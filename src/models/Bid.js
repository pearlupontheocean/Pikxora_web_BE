import mongoose from 'mongoose';

const bidSchema = new mongoose.Schema({
  // Relationships
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  bidder_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Bidder Info
  bidder_type: {
    type: String,
    enum: ['artist', 'studio'],
    required: true
  },

  // Pricing
  amount_total: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },
  breakdown: [{
    label: {
      type: String,
      required: true,
      trim: true
    },
    amount: {
      type: Number,
      required: true,
      min: 0
    }
  }],

  // Schedule
  estimated_duration_days: {
    type: Number,
    min: 1
  },
  start_available_from: {
    type: Date
  },

  // Proposal Details
  notes: {
    type: String,
    trim: true
  },
  included_services: [{
    type: String,
    trim: true
  }],

  // Status
  status: {
    type: String,
    enum: ['pending', 'shortlisted', 'accepted', 'rejected', 'withdrawn'],
    default: 'pending'
  },

  // Timestamps
  submitted_at: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
bidSchema.index({ job_id: 1 }); // Bids by job
bidSchema.index({ bidder_id: 1 }); // Bids by bidder
bidSchema.index({ status: 1 }); // Filter by status
bidSchema.index({ job_id: 1, status: 1 }); // Job's bids by status
bidSchema.index({ bidder_id: 1, status: 1 }); // Bidder's bids by status
bidSchema.index({ submitted_at: -1 }); // Sort by submission time
bidSchema.index({ amount_total: 1 }); // Sort by amount

const Bid = mongoose.model('Bid', bidSchema);
export default Bid;
