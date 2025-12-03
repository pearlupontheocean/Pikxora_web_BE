import mongoose from 'mongoose';

const milestoneSchema = new mongoose.Schema({
  // Relationships
  contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },

  // Milestone Details
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // Schedule & Payment
  due_date: {
    type: Date,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },

  // Deliverables (optional - can be detailed or summary)
  deliverables: [{
    type: String,
    trim: true
  }],

  // Status
  status: {
    type: String,
    enum: ['pending', 'in_review', 'approved', 'paid'],
    default: 'pending'
  },

  // Actual completion (when approved)
  completed_at: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
milestoneSchema.index({ contract_id: 1 }); // Milestones by contract
milestoneSchema.index({ status: 1 }); // Filter by status
milestoneSchema.index({ due_date: 1 }); // Milestones by deadline
milestoneSchema.index({ contract_id: 1, status: 1 }); // Contract milestones by status
milestoneSchema.index({ due_date: 1, status: 1 }); // Upcoming deadlines

const Milestone = mongoose.model('Milestone', milestoneSchema);
export default Milestone;
