import express from 'express';
import Contract from '../models/Contract.js';
import Milestone from '../models/Milestone.js';
import Job from '../models/Job.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/contracts
// @desc    Get contracts for current user
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const contracts = await Contract.find({
      $or: [
        { client_id: req.user.id },
        { vendor_id: req.user.id }
      ]
    })
      .populate('job_id', 'title status final_delivery_date')
      .populate('client_id', 'email')
      .populate('vendor_id', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(contracts);
  } catch (error) {
    console.error('Get contracts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/contracts/:id
// @desc    Get contract by ID
// @access  Private (client or vendor only)
router.get('/:id', protect, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id)
      .populate('job_id')
      .populate('client_id', 'email')
      .populate('vendor_id', 'email')
      .lean();

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check access permissions
    const hasAccess =
      contract.client_id._id.toString() === req.user.id ||
      contract.vendor_id._id.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Get milestones
    const milestones = await Milestone.find({ contract_id: req.params.id })
      .sort({ due_date: 1 })
      .lean();

    res.json({
      contract,
      milestones
    });
  } catch (error) {
    console.error('Get contract error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid contract ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/contracts/:id
// @desc    Update contract
// @access  Private (client only for basic updates)
router.put('/:id', protect, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only client can update contract details
    if (contract.client_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only update active contracts
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Cannot update contract in current status' });
    }

    const { terms_notes, deliverables_status } = req.body;

    const updates = {};
    if (terms_notes !== undefined) updates.terms_notes = terms_notes;
    if (deliverables_status !== undefined) updates.deliverables_status = deliverables_status;

    const updatedContract = await Contract.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Contract updated successfully',
      contract: updatedContract
    });
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/contracts/:id/status
// @desc    Update contract status
// @access  Private (client or vendor)
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status } = req.body;

    if (!['active', 'completed', 'terminated', 'disputed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Check permissions - both client and vendor can update status
    const hasAccess =
      contract.client_id.toString() === req.user.id ||
      contract.vendor_id.toString() === req.user.id;

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Status transition validations
    if (contract.status === 'completed' && status !== 'completed') {
      return res.status(400).json({ error: 'Cannot change status of completed contract' });
    }

    if (contract.status === 'terminated' && status !== 'terminated') {
      return res.status(400).json({ error: 'Cannot change status of terminated contract' });
    }

    // Update contract status
    contract.status = status;
    await contract.save();

    // Update job status if contract is completed
    if (status === 'completed') {
      await Job.findByIdAndUpdate(contract.job_id, { status: 'completed' });
    }

    res.json({
      message: `Contract status updated to ${status}`,
      contract
    });
  } catch (error) {
    console.error('Update contract status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   POST /api/contracts/:id/milestones
// @desc    Add milestone to contract
// @access  Private (client only)
router.post('/:id/milestones', protect, async (req, res) => {
  try {
    const {
      title,
      description,
      due_date,
      amount,
      deliverables
    } = req.body;

    const contract = await Contract.findById(req.params.id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only client can add milestones
    if (contract.client_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only add milestones to active contracts
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Cannot add milestones to contract in current status' });
    }

    const milestone = new Milestone({
      contract_id: req.params.id,
      title,
      description,
      due_date,
      amount,
      deliverables,
      status: 'pending'
    });

    await milestone.save();

    res.status(201).json({
      message: 'Milestone added successfully',
      milestone
    });
  } catch (error) {
    console.error('Add milestone error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/contracts/:contractId/milestones/:milestoneId
// @desc    Update milestone
// @access  Private (client or vendor)
router.put('/:contractId/milestones/:milestoneId', protect, async (req, res) => {
  try {
    const { status, review_notes } = req.body;

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

    const milestone = await Milestone.findOne({
      _id: req.params.milestoneId,
      contract_id: req.params.contractId
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found' });
    }

    // Status updates
    if (status) {
      if (!['pending', 'in_review', 'approved', 'paid'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      milestone.status = status;

      if (status === 'approved') {
        milestone.completed_at = new Date();
      }
    }

    if (review_notes !== undefined) {
      milestone.review_notes = review_notes;
    }

    await milestone.save();

    res.json({
      message: 'Milestone updated successfully',
      milestone
    });
  } catch (error) {
    console.error('Update milestone error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/contracts/:contractId/milestones/:milestoneId
// @desc    Delete milestone
// @access  Private (client only)
router.delete('/:contractId/milestones/:milestoneId', protect, async (req, res) => {
  try {
    const contract = await Contract.findById(req.params.contractId);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only client can delete milestones
    if (contract.client_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only delete from active contracts
    if (contract.status !== 'active') {
      return res.status(400).json({ error: 'Cannot delete milestones from contract in current status' });
    }

    const milestone = await Milestone.findOneAndDelete({
      _id: req.params.milestoneId,
      contract_id: req.params.contractId,
      status: 'pending' // Can only delete pending milestones
    });

    if (!milestone) {
      return res.status(404).json({ error: 'Milestone not found or cannot be deleted' });
    }

    res.json({ message: 'Milestone deleted successfully' });
  } catch (error) {
    console.error('Delete milestone error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
