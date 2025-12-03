import express from 'express';
import Job from '../models/Job.js';
import Bid from '../models/Bid.js';
import Contract from '../models/Contract.js';
import Movie from '../models/Movie.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/jobs
// @desc    Create a new job
// @access  Private (studio, admin)
router.post('/', protect, async (req, res) => {
  try {
    const {
      title,
      description,
      movie_id,
      assignment_mode,
      assigned_to,
      payment_type,
      currency,
      min_budget,
      max_budget,
      total_shots,
      total_frames,
      resolution,
      frame_rate,
      shot_breakdown,
      required_skills,
      software_preferences,
      deliverables,
      bid_deadline,
      expected_start_date,
      final_delivery_date,
      notes_for_bidders
    } = req.body;

    // Check permissions
    if (!req.user.roles.includes('studio') && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Only studios and admins can create jobs' });
    }

    // Validate assignment mode
    if (assignment_mode === 'direct' && !assigned_to) {
      return res.status(400).json({ error: 'assigned_to is required for direct assignment' });
    }

    if (assignment_mode === 'open' && !bid_deadline) {
      return res.status(400).json({ error: 'bid_deadline is required for open bidding' });
    }

    // Validate movie exists if provided
    if (movie_id) {
      const movie = await Movie.findOne({ _id: movie_id, created_by: req.user.id });
      if (!movie) {
        return res.status(400).json({ error: 'Movie not found or access denied' });
      }
    }

    const job = new Job({
      title,
      description,
      movie_id,
      assignment_mode,
      assigned_to: assignment_mode === 'direct' ? assigned_to : null,
      payment_type,
      currency: currency || 'INR',
      min_budget,
      max_budget,
      total_shots,
      total_frames,
      resolution,
      frame_rate,
      shot_breakdown,
      required_skills,
      software_preferences,
      deliverables,
      bid_deadline,
      expected_start_date,
      final_delivery_date,
      notes_for_bidders,
      status: 'draft',
      created_by: req.user.id
    });

    await job.save();

    await job.populate([
      { path: 'movie_id', select: 'title production_year' },
      { path: 'assigned_to', select: 'email' },
      { path: 'created_by', select: 'email' }
    ]);

    res.status(201).json({
      message: 'Job created successfully',
      job
    });
  } catch (error) {
    console.error('Create job error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/jobs
// @desc    Get jobs with filtering
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const {
      status,
      assignment_mode,
      payment_type,
      min_budget,
      max_budget,
      skills,
      software,
      movie_id,
      created_by_me,
      assigned_to_me
    } = req.query;

    let query = {};

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by assignment mode
    if (assignment_mode) {
      query.assignment_mode = assignment_mode;
    }

    // Filter by payment type
    if (payment_type) {
      query.payment_type = payment_type;
    }

    // Budget range filtering
    if (min_budget || max_budget) {
      query.$or = [];
      if (min_budget) {
        query.$or.push({ max_budget: { $gte: parseInt(min_budget) } });
      }
      if (max_budget) {
        query.$or.push({ min_budget: { $lte: parseInt(max_budget) } });
      }
    }

    // Skills filtering
    if (skills) {
      const skillsArray = skills.split(',').map(s => s.trim());
      query.required_skills = { $in: skillsArray };
    }

    // Software filtering
    if (software) {
      const softwareArray = software.split(',').map(s => s.trim());
      query.software_preferences = { $in: softwareArray };
    }

    // Movie filtering
    if (movie_id) {
      query.movie_id = movie_id;
    }

    // User's own jobs
    if (created_by_me === 'true') {
      query.created_by = req.user.id;
    }

    // Jobs assigned to user (direct assignment)
    if (assigned_to_me === 'true') {
      query.assigned_to = req.user.id;
      query.assignment_mode = 'direct';
    }

    // For non-admin users, only show open jobs or their own jobs
    if (!req.user.roles.includes('admin')) {
      query.$or = [
        { status: 'open', assignment_mode: 'open' },
        { created_by: req.user.id },
        { assigned_to: req.user.id }
      ];
    }

    const jobs = await Job.find(query)
      .populate('movie_id', 'title production_year genre')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(jobs);
  } catch (error) {
    console.error('Get jobs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get job by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('movie_id', 'title production_year genre poster_url')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check access permissions
    const hasAccess =
      req.user.roles.includes('admin') ||
      job.created_by._id.toString() === req.user.id ||
      (job.assignment_mode === 'open' && job.status === 'open') ||
      job.assigned_to?._id.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Increment view count
    await Job.findByIdAndUpdate(req.params.id, { $inc: { view_count: 1 } });

    res.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid job ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update job
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Prevent editing after certain statuses
    if (['awarded', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ error: 'Cannot edit job in current status' });
    }

    const updateFields = [
      'title', 'description', 'movie_id', 'payment_type', 'currency',
      'min_budget', 'max_budget', 'total_shots', 'total_frames',
      'resolution', 'frame_rate', 'shot_breakdown', 'required_skills',
      'software_preferences', 'deliverables', 'expected_start_date',
      'final_delivery_date', 'notes_for_bidders'
    ];

    const updates = {};
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Special handling for assignment_mode changes
    if (req.body.assignment_mode && req.body.assignment_mode !== job.assignment_mode) {
      if (job.status !== 'draft') {
        return res.status(400).json({ error: 'Cannot change assignment mode after publishing' });
      }
      updates.assignment_mode = req.body.assignment_mode;
      if (req.body.assignment_mode === 'direct') {
        updates.assigned_to = req.body.assigned_to;
      }
    }

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'movie_id', select: 'title production_year' },
      { path: 'assigned_to', select: 'email' },
      { path: 'created_by', select: 'email' }
    ]);

    res.json({
      message: 'Job updated successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Update job error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/jobs/:id/publish
// @desc    Publish job (change status from draft to open)
// @access  Private
router.put('/:id/publish', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'draft') {
      return res.status(400).json({ error: 'Job is not in draft status' });
    }

    // Validate required fields for publishing
    if (!job.bid_deadline && job.assignment_mode === 'open') {
      return res.status(400).json({ error: 'Bid deadline is required for open jobs' });
    }

    job.status = 'open';
    await job.save();

    res.json({
      message: 'Job published successfully',
      job
    });
  } catch (error) {
    console.error('Publish job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Delete job
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Prevent deletion after certain statuses
    if (['awarded', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ error: 'Cannot delete job in current status' });
    }

    // Delete associated bids
    await Bid.deleteMany({ job_id: req.params.id });

    // Delete the job
    await Job.findByIdAndDelete(req.params.id);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
