import express from 'express';
import Profile from '../models/Profile.js';
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
