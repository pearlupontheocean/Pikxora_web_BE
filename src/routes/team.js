import express from 'express';
import TeamMember from '../models/TeamMember.js';
import Wall from '../models/Wall.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';
import { isBase64Image, isCloudinaryUrl, uploadBase64ToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } from '../utils/imageUtils.js';

const router = express.Router();

// @route   GET /api/team/wall/:wallId
// @desc    Get team members for a wall
// @access  Public
router.get('/wall/:wallId', async (req, res) => {
  try {
    const teamMembers = await TeamMember.find({ wall_id: req.params.wallId })
      .sort({ order_index: 1, createdAt: 1 });
    
    // Cloudinary URLs are ready to use, no conversion needed
    const membersWithUrls = teamMembers.map((member) => {
      return member.toObject();
    });
    
    res.json(membersWithUrls);
  } catch (error) {
    console.error('Get team members error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/team
// @desc    Create a new team member
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const wall = await Wall.findById(req.body.wall_id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    // Check if user owns the wall
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Handle avatar_url: upload base64 to Cloudinary if needed
    const memberData = { ...req.body };
    if (memberData.avatar_url && isBase64Image(memberData.avatar_url)) {
      try {
        const uploadResult = await uploadBase64ToCloudinary(memberData.avatar_url, 'avatars', 'avatar', 'image');
        memberData.avatar_url = uploadResult.secure_url;
      } catch (error) {
        console.error('Error uploading avatar to Cloudinary:', error);
        return res.status(400).json({ error: `Avatar upload error: ${error.message}` });
      }
    }
    
    const teamMember = new TeamMember(memberData);
    await teamMember.save();
    
    res.status(201).json(teamMember.toObject());
  } catch (error) {
    console.error('Create team member error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/team/:id
// @desc    Update a team member
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const teamMember = await TeamMember.findById(req.params.id);
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    // Check if user owns the wall
    const wall = await Wall.findById(teamMember.wall_id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Handle avatar_url: upload base64 to Cloudinary if needed, delete old if replaced
    const updateData = { ...req.body };
    const oldAvatarUrl = teamMember.avatar_url;
    
    if (updateData.avatar_url && updateData.avatar_url !== oldAvatarUrl) {
      if (isBase64Image(updateData.avatar_url)) {
        try {
          const uploadResult = await uploadBase64ToCloudinary(updateData.avatar_url, 'avatars', 'avatar', 'image');
          updateData.avatar_url = uploadResult.secure_url;
          
          // Delete old avatar from Cloudinary if it exists
          if (oldAvatarUrl && isCloudinaryUrl(oldAvatarUrl)) {
            const oldPublicId = extractPublicIdFromUrl(oldAvatarUrl);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old avatar from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } catch (error) {
          console.error('Error uploading avatar to Cloudinary:', error);
          return res.status(400).json({ error: `Avatar upload error: ${error.message}` });
        }
      } else if (!isCloudinaryUrl(updateData.avatar_url)) {
        return res.status(400).json({ error: 'Avatar URL must be a base64 image or Cloudinary URL' });
      }
    }
    
    Object.assign(teamMember, updateData);
    await teamMember.save();
    
    res.json(teamMember.toObject());
  } catch (error) {
    console.error('Update team member error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/team/:id
// @desc    Delete a team member
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const teamMember = await TeamMember.findById(req.params.id);
    if (!teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }
    
    // Check if user owns the wall
    const wall = await Wall.findById(teamMember.wall_id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Delete avatar from Cloudinary if it exists
    if (teamMember.avatar_url && isCloudinaryUrl(teamMember.avatar_url)) {
      try {
        const avatarPublicId = extractPublicIdFromUrl(teamMember.avatar_url);
        if (avatarPublicId) {
          await deleteFromCloudinary(avatarPublicId, 'image');
        }
      } catch (error) {
        console.error('Error deleting avatar from Cloudinary:', error);
        // Continue with deletion even if Cloudinary deletion fails
      }
    }
    
    await TeamMember.findByIdAndDelete(req.params.id);
    res.json({ message: 'Team member deleted successfully' });
  } catch (error) {
    console.error('Delete team member error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

