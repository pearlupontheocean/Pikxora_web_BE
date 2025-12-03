import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  poster_url: {
    type: String,
    trim: true
  },
  production_year: {
    type: Number,
    min: 1900,
    max: new Date().getFullYear() + 10
  },
  genre: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['planning', 'pre_production', 'production', 'post_production', 'completed', 'cancelled'],
    default: 'planning'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
movieSchema.index({ created_by: 1 }); // Find movies by creator
movieSchema.index({ status: 1 }); // Filter by status
movieSchema.index({ createdAt: -1 }); // Sort by creation date
movieSchema.index({ title: 'text' }); // Text search on title

const Movie = mongoose.model('Movie', movieSchema);
export default Movie;
