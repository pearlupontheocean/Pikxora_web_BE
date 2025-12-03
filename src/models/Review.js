import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema({
  // Relationships
  contract_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contract',
    required: true,
    unique: true // One review per contract
  },
  job_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  reviewer_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Client who reviews
  },
  target_user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // Vendor being reviewed
  },

  // Review Content
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  review_text: {
    type: String,
    trim: true
  },

  // Detailed Ratings (optional)
  aspects: {
    communication: {
      type: Number,
      min: 1,
      max: 5
    },
    quality: {
      type: Number,
      min: 1,
      max: 5
    },
    timeliness: {
      type: Number,
      min: 1,
      max: 5
    },
    professionalism: {
      type: Number,
      min: 1,
      max: 5
    }
  },

  // Metadata
  is_public: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
reviewSchema.index({ contract_id: 1 }); // Review by contract (unique)
reviewSchema.index({ job_id: 1 }); // Review by job
reviewSchema.index({ reviewer_id: 1 }); // Reviews by reviewer
reviewSchema.index({ target_user_id: 1 }); // Reviews of target user
reviewSchema.index({ rating: 1 }); // Filter by rating
reviewSchema.index({ target_user_id: 1, createdAt: -1 }); // User's reviews sorted by date
reviewSchema.index({ target_user_id: 1, rating: 1 }); // User's reviews by rating

const Review = mongoose.model('Review', reviewSchema);
export default Review;
