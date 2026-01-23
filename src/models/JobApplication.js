import mongoose from 'mongoose';

const jobApplicationSchema = new mongoose.Schema({
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  applicant_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Contact Information
  applicant_email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  applicant_phone: {
    type: String,
    required: true,
    trim: true
  },
  cover_letter: {
    type: String,
    maxlength: 2000
  },
  expected_salary: {
    type: Number,
    min: 0
  },
  currency: {
    type: String,
    default: 'INR'
  },
  notice_period: {
    type: String,
    enum: ['immediate', '15_days', '30_days', '60_days', '90_days'],
    default: 'immediate'
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'],
    default: 'pending'
  },
  notes: {
    type: String,
    maxlength: 500
  }
}, {
  timestamps: true
});

// Compound index to ensure one application per user per job
jobApplicationSchema.index({ job_id: 1, applicant_id: 1 }, { unique: true });

// Index for querying applications by job
jobApplicationSchema.index({ job_id: 1, status: 1 });

// Index for querying applications by user
jobApplicationSchema.index({ applicant_id: 1 });

const JobApplication = mongoose.model('JobApplication', jobApplicationSchema);

export default JobApplication;

