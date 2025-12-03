import express from 'express';
import Deliverable from '../models/Deliverable.js';
import Contract from '../models/Contract.js';
import Job from '../models/Job.js';
import { protect } from '../middleware/auth.js';
import { uploadBase64ToCloudinary } from '../utils/imageUtils.js';

const router = express.Router();

// @route   POST /api/deliverables
// @desc    Upload a deliverable
// @access  Private (contract vendor only)
router.post('/', protect, async (req, res) => {
  try {
    const {
      contract_id,
      label,
      description,
      file_url,
      file_type,
      file_format,
      shot_code,
      frame_range
    } = req.body;

    // Find and validate contract
    const contract = await Contract.findById(contract_id)
      .populate('job_id');

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only vendor can upload deliverables
    if (contract.vendor_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only upload to active contracts
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Cannot upload deliverables to contract in current status' });
    }

    const deliverable = new Deliverable({
      job_id: contract.job_id._id,
      contract_id,
      uploaded_by: req.user.id,
      label,
      description,
      file_url,
      file_type,
      file_format,
      shot_code,
      frame_range,
      status: 'submitted'
    });

    await deliverable.save();

    await deliverable.populate('uploaded_by', 'email');

    res.status(201).json({
      message: 'Deliverable uploaded successfully',
      deliverable
    });
  } catch (error) {
    console.error('Upload deliverable error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/deliverables/contract/:contractId
// @desc    Get deliverables for a contract
// @access  Private (client or vendor)
router.get('/contract/:contractId', protect, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.contractId);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check access permissions
    const hasAccess =
      contract.client_id.toString() === req.user.id ||
      contract.vendor_id.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deliverables = await Deliverable.find({ contract_id: req.params.contractId })
      .populate('uploaded_by', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(deliverables);
  } catch (error) {
    console.error('Get deliverables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/deliverables/job/:jobId
// @desc    Get deliverables for a job
// @access  Private (job owner or assigned vendor)
router.get('/job/:jobId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check access permissions
    const hasAccess =
      job.created_by.toString() === req.user.id ||
      job.assigned_to?.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deliverables = await Deliverable.find({ job_id: req.params.jobId })
      .populate('contract_id', 'status')
      .populate('uploaded_by', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(deliverables);
  } catch (error) {
    console.error('Get job deliverables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/deliverables/:id
// @desc    Get deliverable by ID
// @access  Private (client or vendor)
router.get('/:id', protect, async (req, res) => {
  try {
    const deliverable = await Deliverable.findById(req.params.id)
      .populate('contract_id')
      .populate('job_id', 'title')
      .populate('uploaded_by', 'email')
      .populate('reviewed_by', 'email')
      .lean();

    if (!deliverable) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    // Check access permissions
    const hasAccess =
      deliverable.contract_id.client_id.toString() === req.user.id ||
      deliverable.contract_id.vendor_id.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(deliverable);
  } catch (error) {
    console.error('Get deliverable error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid deliverable ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/deliverables/:id/review
// @desc    Review/approve deliverable
// @access  Private (client only)
router.put('/:id/review', protect, async (req, res) => {
  try {
    const { status, review_notes } = req.body;

    if (!['submitted', 'in_review', 'approved', 'changes_requested'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const deliverable = await Deliverable.findById(req.params.id)
      .populate('contract_id');

    if (!deliverable) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    // Only client can review deliverables
    if (deliverable.contract_id.client_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Update deliverable
    deliverable.status = status;
    if (review_notes !== undefined) deliverable.review_notes = review_notes;

    if (status === 'approved' || status === 'changes_requested') {
      deliverable.reviewed_by = req.user.id;
      deliverable.reviewed_at = new Date();
    }

    await deliverable.save();

    // Update contract deliverables status if all deliverables are approved
    const allDeliverables = await Deliverable.find({ contract_id: deliverable.contract_id._id });
    const approvedCount = allDeliverables.filter(d => d.status === 'approved').length;

    if (approvedCount === allDeliverables.length) {
      await Contract.findByIdAndUpdate(deliverable.contract_id._id, {
        deliverables_status: 'approved'
      });
    } else if (allDeliverables.some(d => d.status === 'changes_requested')) {
      await Contract.findByIdAndUpdate(deliverable.contract_id._id, {
        deliverables_status: 'changes_requested'
      });
    }

    res.json({
      message: 'Deliverable reviewed successfully',
      deliverable
    });
  } catch (error) {
    console.error('Review deliverable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/deliverables/:id
// @desc    Update deliverable (vendor only, before approval)
// @access  Private (uploader only)
router.put('/:id', protect, async (req, res) => {
  try {
    const deliverable = await Deliverable.findById(req.params.id);

    if (!deliverable) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    // Only uploader can update
    if (deliverable.uploaded_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only update before approval
    if (['approved', 'changes_requested'].includes(deliverable.status)) {
      return res.status(400).json({ error: 'Cannot update deliverable in current status' });
    }

    const updateFields = [
      'label', 'description', 'file_url', 'file_type', 'file_format',
      'shot_code', 'frame_range'
    ];

    const updates = {};
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    const updatedDeliverable = await Deliverable.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Deliverable updated successfully',
      deliverable: updatedDeliverable
    });
  } catch (error) {
    console.error('Update deliverable error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/deliverables/:id
// @desc    Delete deliverable
// @access  Private (uploader only, before approval)
router.delete('/:id', protect, async (req, res) => {
  try {
    const deliverable = await Deliverable.findById(req.params.id);

    if (!deliverable) {
      return res.status(404).json({ error: 'Deliverable not found' });
    }

    // Only uploader can delete
    if (deliverable.uploaded_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only delete before approval
    if (['approved', 'changes_requested'].includes(deliverable.status)) {
      return res.status(400).json({ error: 'Cannot delete deliverable in current status' });
    }

    await Deliverable.findByIdAndDelete(req.params.id);

    res.json({ message: 'Deliverable deleted successfully' });
  } catch (error) {
    console.error('Delete deliverable error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
