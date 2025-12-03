import express from 'express';
import Bid from '../models/Bid.js';
import Job from '../models/Job.js';
import Contract from '../models/Contract.js';
import Milestone from '../models/Milestone.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/bids
// @desc    Submit a bid on a job
// @access  Private (artist, studio)
router.post('/', protect, async (req, res) => {
  try {
    const {
      job_id,
      amount_total,
      currency,
      breakdown,
      estimated_duration_days,
      start_available_from,
      notes,
      included_services
    } = req.body;

    // Check if user can bid (artist or studio)
    if (!req.user.roles.includes('artist') && !req.user.roles.includes('studio')) {
      return res.status(403).json({ error: 'Only artists and studios can submit bids' });
    }

    // Find and validate job
    const job = await Job.findById(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.assignment_mode !== 'open' || job.status !== 'open') {
      return res.status(400).json({ error: 'Job is not open for bidding' });
    }

    // Check bid deadline
    if (new Date() > new Date(job.bid_deadline)) {
      return res.status(400).json({ error: 'Bidding deadline has passed' });
    }

    // Check if user already submitted a bid
    const existingBid = await Bid.findOne({ job_id, bidder_id: req.user.id });
    if (existingBid) {
      return res.status(400).json({ error: 'You have already submitted a bid for this job' });
    }

    // Determine bidder type
    const bidder_type = req.user.roles.includes('studio') ? 'studio' : 'artist';

    const bid = new Bid({
      job_id,
      bidder_id: req.user.id,
      bidder_type,
      amount_total,
      currency: currency || 'INR',
      breakdown,
      estimated_duration_days,
      start_available_from,
      notes,
      included_services,
      status: 'pending'
    });

    await bid.save();

    await bid.populate('bidder_id', 'email');

    res.status(201).json({
      message: 'Bid submitted successfully',
      bid
    });
  } catch (error) {
    console.error('Submit bid error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/bids/job/:jobId
// @desc    Get all bids for a job
// @access  Private (job owner or admin only)
router.get('/job/:jobId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only job owner or admin can see bids
    if (!req.user.roles.includes('admin') && job.created_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const bids = await Bid.find({ job_id: req.params.jobId })
      .populate('bidder_id', 'email')
      .sort({ submitted_at: -1 })
      .lean();

    res.json(bids);
  } catch (error) {
    console.error('Get job bids error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/bids/my
// @desc    Get current user's bids
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const bids = await Bid.find({ bidder_id: req.user.id })
      .populate({
        path: 'job_id',
        select: 'title status created_by final_delivery_date',
        populate: { path: 'created_by', select: 'email' }
      })
      .sort({ submitted_at: -1 })
      .lean();

    res.json(bids);
  } catch (error) {
    console.error('Get my bids error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/bids/:id
// @desc    Get bid by ID
// @access  Private (bidder or job owner or admin)
router.get('/:id', protect, async (req, res) => {
  try {
    const bid = await Bid.findById(req.params.id)
      .populate('bidder_id', 'email')
      .populate('job_id', 'title status created_by')
      .lean();

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Check access permissions
    const hasAccess =
      req.user.roles.includes('admin') ||
      bid.bidder_id._id.toString() === req.user.id ||
      bid.job_id.created_by.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(bid);
  } catch (error) {
    console.error('Get bid error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid bid ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/bids/:id/status
// @desc    Update bid status (shortlist/accept/reject)
// @access  Private (job owner or admin only)
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['pending', 'shortlisted', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const bid = await Bid.findById(req.params.id).populate('job_id');
    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Check permissions
    if (!req.user.roles.includes('admin') && bid.job_id.created_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Prevent status changes after acceptance
    if (bid.status === 'accepted' && status !== 'accepted') {
      return res.status(400).json({ error: 'Cannot change status of accepted bid' });
    }

    // Handle bid acceptance - create contract
    if (status === 'accepted') {
      // Check if another bid is already accepted
      const acceptedBid = await Bid.findOne({ job_id: bid.job_id._id, status: 'accepted' });
      if (acceptedBid) {
        return res.status(400).json({ error: 'Another bid has already been accepted for this job' });
      }

      // Create contract
      const contract = new Contract({
        job_id: bid.job_id._id,
        client_id: bid.job_id.created_by,
        vendor_id: bid.bidder_id,
        total_amount: bid.amount_total,
        currency: bid.currency,
        start_date: bid.start_available_from || new Date(),
        end_date: bid.job_id.final_delivery_date,
        status: 'active'
      });

      await contract.save();

      // Create default milestone (can be customized later)
      const milestone = new Milestone({
        contract_id: contract._id,
        title: 'Project Delivery',
        description: 'Complete delivery of all project deliverables',
        due_date: bid.job_id.final_delivery_date,
        amount: bid.amount_total,
        deliverables: bid.job_id.deliverables,
        status: 'pending'
      });

      await milestone.save();

      // Update job status
      await Job.findByIdAndUpdate(bid.job_id._id, { status: 'awarded' });

      // Reject all other bids
      await Bid.updateMany(
        { job_id: bid.job_id._id, _id: { $ne: bid._id } },
        { status: 'rejected' }
      );
    }

    // Update bid status
    bid.status = status;
    if (notes) bid.notes = notes;
    await bid.save();

    res.json({
      message: `Bid ${status} successfully`,
      bid
    });
  } catch (error) {
    console.error('Update bid status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/bids/:id
// @desc    Update bid (only by bidder before submission deadline)
// @access  Private (bidder only)
router.put('/:id', protect, async (req, res) => {
  try {
    const bid = await Bid.findOne({ _id: req.params.id, bidder_id: req.user.id })
      .populate('job_id');

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Can only edit pending bids before deadline
    if (bid.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot edit bid in current status' });
    }

    if (new Date() > new Date(bid.job_id.bid_deadline)) {
      return res.status(400).json({ error: 'Bidding deadline has passed' });
    }

    const updateFields = [
      'amount_total', 'currency', 'breakdown', 'estimated_duration_days',
      'start_available_from', 'notes', 'included_services'
    ];

    const updates = {};
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedBid = await Bid.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Bid updated successfully',
      bid: updatedBid
    });
  } catch (error) {
    console.error('Update bid error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/bids/:id
// @desc    Withdraw bid
// @access  Private (bidder only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const bid = await Bid.findOne({ _id: req.params.id, bidder_id: req.user.id })
      .populate('job_id');

    if (!bid) {
      return res.status(404).json({ error: 'Bid not found' });
    }

    // Can only withdraw pending bids before deadline
    if (bid.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot withdraw bid in current status' });
    }

    if (new Date() > new Date(bid.job_id.bid_deadline)) {
      return res.status(400).json({ error: 'Bidding deadline has passed' });
    }

    await Bid.findByIdAndDelete(req.params.id);

    res.json({ message: 'Bid withdrawn successfully' });
  } catch (error) {
    console.error('Withdraw bid error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
