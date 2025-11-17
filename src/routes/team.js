import express from 'express';
import TeamMember from '../models/TeamMember.js';
import Wall from '../models/Wall.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';
import { isBase64Image, convertFilePathToBase64 } from '../utils/imageUtils.js';

const router = express.Router();

// @route   GET /api/team/wall/:wallId
// @desc    Get team members for a wall
// @access  Public
router.get('/wall/:wallId', async (req, res) => {
  try {
    const teamMembers = await TeamMember.find({ wall_id: req.params.wallId })
      .sort({ order_index: 1, createdAt: 1 });
    
    // Convert file paths to base64 for frontend
    const membersWithBase64 = await Promise.all(
      teamMembers.map(async (member) => {
        const memberObj = member.toObject();
        
        // Convert avatar_url if it's a file path
        if (memberObj.avatar_url && memberObj.avatar_url.startsWith('/uploads/') && !isBase64Image(memberObj.avatar_url)) {
          try {
            memberObj.avatar_url = await convertFilePathToBase64(memberObj.avatar_url);
          } catch (error) {
            console.error('Error converting avatar to base64:', error);
          }
        }
        
        return memberObj;
      })
    );
    
    res.json(membersWithBase64);
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
    
    const teamMember = new TeamMember(req.body);
    await teamMember.save();
    
    // Convert avatar_url if it's a file path
    const memberObj = teamMember.toObject();
    if (memberObj.avatar_url && memberObj.avatar_url.startsWith('/uploads/') && !isBase64Image(memberObj.avatar_url)) {
      try {
        memberObj.avatar_url = await convertFilePathToBase64(memberObj.avatar_url);
      } catch (error) {
        console.error('Error converting avatar to base64:', error);
      }
    }
    
    res.status(201).json(memberObj);
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
    
    Object.assign(teamMember, req.body);
    await teamMember.save();
    
    // Convert avatar_url if it's a file path
    const memberObj = teamMember.toObject();
    if (memberObj.avatar_url && memberObj.avatar_url.startsWith('/uploads/') && !isBase64Image(memberObj.avatar_url)) {
      try {
        memberObj.avatar_url = await convertFilePathToBase64(memberObj.avatar_url);
      } catch (error) {
        console.error('Error converting avatar to base64:', error);
      }
    }
    
    res.json(memberObj);
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
    
    await TeamMember.findByIdAndDelete(req.params.id);
    res.json({ message: 'Team member deleted successfully' });
  } catch (error) {
    console.error('Delete team member error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

