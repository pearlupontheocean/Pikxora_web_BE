import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema({
  wall_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wall',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  media_url: String,
  media_type: {
    type: String,
    enum: ['image', 'video']
  },
  category: String,
  order_index: {
    type: Number,
    default: 0
  },
  showreel_url: String,
  showreel_type: {
    type: String,
    enum: ['embed', 'upload']
  }
}, {
  timestamps: true
});

// Add indexes for faster queries
projectSchema.index({ wall_id: 1, order_index: 1 }); // Compound index for wall projects sorted by order
projectSchema.index({ wall_id: 1 }); // Index for finding projects by wall

const Project = mongoose.model('Project', projectSchema);
export default Project;
