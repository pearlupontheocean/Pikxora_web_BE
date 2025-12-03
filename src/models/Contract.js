import mongoose from 'mongoose';

const contractSchema = new mongoose.Schema({
  // Relationships
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    unique: true // One contract per job
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  vendor_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Contract Details
  total_amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },

  // Dates
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    required: true
  },

  // Terms
  terms_notes: {
    type: String,
    trim: true
  },
  deliverables_status: {
    type: String,
    enum: ['not_started', 'in_progress', 'submitted', 'approved', 'changes_requested'],
    default: 'not_started'
  },

  // Status
  status: {
    type: String,
    enum: ['active', 'completed', 'terminated', 'disputed'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
contractSchema.index({ job_id: 1 }); // Contract by job (unique)
contractSchema.index({ client_id: 1 }); // Contracts by client
contractSchema.index({ vendor_id: 1 }); // Contracts by vendor
contractSchema.index({ status: 1 }); // Filter by status
contractSchema.index({ end_date: 1 }); // Contracts by deadline
contractSchema.index({ client_id: 1, status: 1 }); // Client's contracts by status
contractSchema.index({ vendor_id: 1, status: 1 }); // Vendor's contracts by status

const Contract = mongoose.model('Contract', contractSchema);
export default Contract;
