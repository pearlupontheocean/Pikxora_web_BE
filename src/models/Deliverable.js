import mongoose from 'mongoose';

const deliverableSchema = new mongoose.Schema({
  // Relationships
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true
  },
  uploaded_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Deliverable Info
  label: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },

  // File Details
  file_url: {
    type: String,
    required: true,
    trim: true
  },
  file_type: {
    type: String,
    enum: ['preview', 'final', 'working', 'reference'],
    required: true
  },
  file_format: {
    type: String,
    trim: true // e.g., EXR, ProRes, MP4, etc.
  },

  // VFX Context
  shot_code: {
    type: String,
    trim: true
  },
  frame_range: {
    start: {
      type: Number,
      min: 0
    },
    end: {
      type: Number,
      min: 0
    }
  },

  // Approval Workflow
  status: {
    type: String,
    enum: ['submitted', 'in_review', 'approved', 'changes_requested'],
    default: 'submitted'
  },
  review_notes: {
    type: String,
    trim: true
  },
  reviewed_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewed_at: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
deliverableSchema.index({ job_id: 1 }); // Deliverables by job
deliverableSchema.index({ contract_id: 1 }); // Deliverables by contract
deliverableSchema.index({ uploaded_by: 1 }); // Deliverables by uploader
deliverableSchema.index({ status: 1 }); // Filter by approval status
deliverableSchema.index({ file_type: 1 }); // Filter by file type
deliverableSchema.index({ shot_code: 1 }); // Find deliverables by shot
deliverableSchema.index({ job_id: 1, status: 1 }); // Job deliverables by status
deliverableSchema.index({ contract_id: 1, file_type: 1 }); // Contract files by type

const Deliverable = mongoose.model('Deliverable', deliverableSchema);
export default Deliverable;
