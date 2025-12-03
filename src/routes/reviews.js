import express from 'express';
import Review from '../models/Review.js';
import Contract from '../models/Contract.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/reviews
// @desc    Create a review for a completed contract
// @access  Private (client only)
router.post('/', protect, async (req, res) => {
  try {
    const {
      contract_id,
      rating,
      review_text,
      aspects
    } = req.body;

    // Find and validate contract
    const contract = await Contract.findById(contract_id);

    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    // Only client can review
    if (contract.client_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only review completed contracts
    if (contract.status !== 'completed') {
      return res.status(400).json({ error: 'Can only review completed contracts' });
    }

    // Check if review already exists
    const existingReview = await Review.findOne({ contract_id });
    if (existingReview) {
      return res.status(400).json({ error: 'Review already exists for this contract' });
    }

    const review = new Review({
      contract_id,
      job_id: contract.job_id,
      reviewer_id: req.user.id,
      target_user_id: contract.vendor_id,
      rating,
      review_text,
      aspects: aspects || {},
      is_public: true
    });

    await review.save();

    await review.populate([
      { path: 'reviewer_id', select: 'email' },
      { path: 'target_user_id', select: 'email' }
    ]);

    // Update profile rating (aggregate calculation)
    await updateProfileRating(contract.vendor_id);

    res.status(201).json({
      message: 'Review submitted successfully',
      review
    });
  } catch (error) {
    console.error('Create review error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/reviews/user/:userId
// @desc    Get reviews for a user
// @access  Public (only public reviews)
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({
      target_user_id: req.params.userId,
      is_public: true
    })
      .populate('contract_id', 'total_amount currency')
      .populate('job_id', 'title')
      .populate('reviewer_id', 'email')
      .sort({ createdAt: -1 })
      .lean();

    // Calculate aggregate stats
    const stats = {
      total_reviews: reviews.length,
      average_rating: reviews.length > 0
        ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
        : 0,
      rating_distribution: {
        5: reviews.filter(r => r.rating === 5).length,
        4: reviews.filter(r => r.rating === 4).length,
        3: reviews.filter(r => r.rating === 3).length,
        2: reviews.filter(r => r.rating === 2).length,
        1: reviews.filter(r => r.rating === 1).length
      }
    };

    res.json({
      reviews,
      stats
    });
  } catch (error) {
    console.error('Get user reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/reviews/my
// @desc    Get reviews written by current user
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer_id: req.user.id })
      .populate('contract_id', 'total_amount currency status')
      .populate('job_id', 'title')
      .populate('target_user_id', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    console.error('Get my reviews error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/reviews/:id
// @desc    Get review by ID
// @access  Public (if public) or Private (reviewer only)
router.get('/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id)
      .populate('contract_id', 'total_amount currency')
      .populate('job_id', 'title')
      .populate('reviewer_id', 'email')
      .populate('target_user_id', 'email')
      .lean();

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // If review is not public, only reviewer can see it
    if (!review.is_public && (!req.user || review.reviewer_id._id.toString() !== req.user.id)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(review);
  } catch (error) {
    console.error('Get review error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid review ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/reviews/:id
// @desc    Update review
// @access  Private (reviewer only)
router.put('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only reviewer can update
    if (review.reviewer_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { rating, review_text, aspects, is_public } = req.body;

    const updates = {};
    if (rating !== undefined) updates.rating = rating;
    if (review_text !== undefined) updates.review_text = review_text;
    if (aspects !== undefined) updates.aspects = aspects;
    if (is_public !== undefined) updates.is_public = is_public;

    const updatedReview = await Review.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    // Update profile rating if rating changed
    if (rating !== undefined) {
      await updateProfileRating(review.target_user_id);
    }

    res.json({
      message: 'Review updated successfully',
      review: updatedReview
    });
  } catch (error) {
    console.error('Update review error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/reviews/:id
// @desc    Delete review
// @access  Private (reviewer only)
router.delete('/:id', protect, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Only reviewer can delete
    if (review.reviewer_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const targetUserId = review.target_user_id;

    await Review.findByIdAndDelete(req.params.id);

    // Update profile rating after deletion
    await updateProfileRating(targetUserId);

    res.json({ message: 'Review deleted successfully' });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Helper function to update profile rating based on reviews
async function updateProfileRating(userId) {
  try {
    const reviews = await Review.find({
      target_user_id: userId,
      is_public: true
    }).select('rating aspects');

    if (reviews.length === 0) {
      // Reset to null if no reviews
      await Profile.findOneAndUpdate(
        { user_id: userId },
        { rating: null }
      );
      return;
    }

    // Calculate average rating
    const averageRating = reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

    // Round to nearest 0.5
    const roundedRating = Math.round(averageRating * 2) / 2;

    await Profile.findOneAndUpdate(
      { user_id: userId },
      { rating: roundedRating }
    );
  } catch (error) {
    console.error('Error updating profile rating:', error);
    // Don't throw - this is a background operation
  }
}

export default router;
