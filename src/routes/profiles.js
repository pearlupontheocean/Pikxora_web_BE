import express from 'express';
import Profile from '../models/Profile.js';
import User from '../models/User.js'; // Import User model
import mongoose from 'mongoose'; // Import mongoose
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// @route   GET /api/profiles
// @desc    Get all profiles (admin only)
// @access  Private/Admin
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const profiles = await Profile.find({}).populate('user_id', 'email roles').sort({ createdAt: -1 });
    res.json(profiles);
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/profiles/me
// @desc    Get current user's profile
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id }).populate('user_id', 'email roles');
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/profiles/pending
// @desc    Get pending studio profiles
// @access  Private/Admin
router.get('/pending', protect, adminOnly, async (req, res) => {
  try {
    const profiles = await Profile.find({
      verification_status: 'pending'
    }).populate('user_id', 'email roles').sort({ createdAt: -1 });
    
    res.json(profiles);
  } catch (error) {
    console.error('Get pending profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/profiles/user/:userId
// @desc    Get user and their profile details by user ID
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password'); // Exclude password
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profile = await Profile.findOne({ user_id: req.params.userId });

    // Combine user and profile data into the CurrentUser structure
    const userDetails = {
      user: {
        id: user._id,
        email: user.email,
        roles: user.roles,
      },
      profile: profile ? {
        _id: profile._id,
        name: profile.name,
        bio: profile.bio,
        verification_status: profile.verification_status,
        rating: profile.rating,
        location: profile.location,
        avatar_url: profile.avatar_url,
        tagline: profile.tagline,
        brand_colors: profile.brand_colors,
        social_links: profile.social_links,
        skills: profile.skills,
        wall_id: profile.wall_id,
      } : null,
    };

    res.json(userDetails);
  } catch (error) {
    console.error('Get user profile by ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/profiles/profile/:profileId
// @desc    Get profile by profile ID with populated user data
// @access  Public
router.get('/profile/:profileId', async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.profileId).populate('user_id', 'email roles'); // Populate user data

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // Combine user and profile data for frontend consistency
    const userDetails = {
      user: {
        id: profile.user_id._id,
        email: profile.user_id.email,
        roles: profile.user_id.roles,
      },
      profile: {
        _id: profile._id,
        name: profile.name,
        bio: profile.bio,
        verification_status: profile.verification_status,
        rating: profile.rating,
        location: profile.location,
        avatar_url: profile.avatar_url,
        tagline: profile.tagline,
        brand_colors: profile.brand_colors,
        social_links: profile.social_links,
        skills: profile.skills,
        wall_id: profile.wall_id,
      },
    };

    res.json(userDetails);
  } catch (error) {
    console.error('Get profile by profile ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid profile ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/profiles/discover
// @desc    Get verified artists and studios for discovery
// @access  Private
router.get('/discover', protect, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 6;
    const currentUserId = req.user.id;
    const excludeUserIds = req.query.excludeUserIds ? req.query.excludeUserIds.split(',').map(id => new mongoose.Types.ObjectId(id)) : [];

    const aggregationPipeline = [
      // Exclude the current user's profile
      { $match: { user_id: { $ne: new mongoose.Types.ObjectId(currentUserId) } } },
      // Exclude already associated users
      { $match: { user_id: { $nin: excludeUserIds } } },
      // Match profiles that are approved
      { $match: { verification_status: 'approved' } },
      // Lookup the associated user to filter by roles
      { $lookup: {
          from: 'users',
          localField: 'user_id',
          foreignField: '_id',
          as: 'user',
      }},
      // Unwind the user array (since user_id is unique, this will be at most one element)
      { $unwind: '$user' },
      // Match users with roles 'artist' or 'studio'
      { $match: { 'user.roles': { $in: ['artist', 'studio'] } } },
      // Sort by a recent field (e.g., verified_at, or updatedAt if not available)
      { $sort: { updatedAt: -1 } }, // Assuming 'updatedAt' can serve as a proxy for recency if 'verified_at' isn't explicitly tracked
      // Limit the number of results
      { $limit: limit },
      // Project to return only public fields needed by the frontend
      { $project: {
          _id: 1,
          name: 1,
          role: { $arrayElemAt: ['$user.roles', 0] }, // Get the first role as 'role'
          location: 1,
          verification_status: 1,
          wall_id: 1,
      }},
    ];

    const discoveredProfiles = await Profile.aggregate(aggregationPipeline);

    res.json(discoveredProfiles);
  } catch (error) {
    console.error('Discover profiles error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/profiles/:id
// @desc    Get profile by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id);
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/profiles/me
// @desc    Update current user's profile
// @access  Private
router.put('/me', protect, async (req, res) => {
  try {
    const profile = await Profile.findOneAndUpdate(
      { user_id: req.user.id },
      req.body,
      { new: true, runValidators: true }
    );
    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/profiles/:id/verify
// @desc    Verify a profile
// @access  Private/Admin
router.put('/:id/verify', protect, adminOnly, async (req, res) => {
  try {
    const { verification_status, rating } = req.body;
    
    const updateData = { verification_status };
    if (rating) {
      updateData.rating = rating;
    }
    
    const profile = await Profile.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.json(profile);
  } catch (error) {
    console.error('Verify profile error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;