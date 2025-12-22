import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
  // Basic Info
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  movie_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Movie'
  },

  // Assignment Mode
  assignment_mode: {
    type: String,
    enum: ['direct', 'open'],
    required: true
  },
  assigned_to: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }], // Only used for direct assignment - can be multiple users

  // Budget & Payment
  payment_type: {
    type: String,
    enum: ['fixed', 'per_shot', 'per_frame'],
    required: true
  },
  currency: {
    type: String,
    default: 'INR',
    trim: true
  },
  min_budget: {
    type: Number,
    min: 0
  },
  max_budget: {
    type: Number,
    min: 0
  },

  // VFX Specifications
  total_shots: {
    type: Number,
    min: 0
  },
  total_frames: {
    type: Number,
    min: 0
  },
  resolution: {
    type: String,
    trim: true
  },
  frame_rate: {
    type: Number,
    min: 1
  },
  shot_breakdown: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    shot_code: {
      type: String,
      trim: true
    },
    frame_in: {
      type: Number,
      min: 0
    },
    frame_out: {
      type: Number,
      min: 0
    },
    complexity: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  }],

  // Requirements
  required_skills: [{
    type: String,
    trim: true
  }],
  software_preferences: [{
    type: String,
    trim: true
  }],
  deliverables: [{
    type: String,
    trim: true
  }],

  // Dates & Deadlines
  bid_deadline: {
    type: Date,
    required: true
  },
  expected_start_date: {
    type: Date
  },
  final_delivery_date: {
    type: Date,
    required: true
  },

  // Status & Workflow
  status: {
    type: String,
    enum: ['draft', 'open', 'under_review', 'awarded', 'in_progress', 'completed', 'cancelled'],
    default: 'draft'
  },
  notes_for_bidders: {
    type: String,
    trim: true
  },

  // Metadata
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  view_count: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
jobSchema.index({ created_by: 1 }); // Jobs by creator
jobSchema.index({ status: 1 }); // Filter by status
jobSchema.index({ assignment_mode: 1 }); // Direct vs open jobs
jobSchema.index({ bid_deadline: 1 }); // Jobs by deadline
jobSchema.index({ final_delivery_date: 1 }); // Jobs by delivery date
jobSchema.index({ movie_id: 1 }); // Jobs by movie
jobSchema.index({ assigned_to: 1 }); // Jobs assigned to specific user
jobSchema.index({ created_by: 1, status: 1 }); // Creator's jobs by status
jobSchema.index({ payment_type: 1 }); // Filter by payment type
jobSchema.index({ min_budget: 1, max_budget: 1 }); // Budget range queries
jobSchema.index({ title: 'text', description: 'text' }); // Text search
jobSchema.index({ required_skills: 1 }); // Skills-based search
jobSchema.index({ software_preferences: 1 }); // Software-based search

const Job = mongoose.model('Job', jobSchema);
export default Job;