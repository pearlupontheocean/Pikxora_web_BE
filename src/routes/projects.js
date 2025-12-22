import express from 'express';
import Project from '../models/Project.js';
import Wall from '../models/Wall.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';
import { 
  isBase64Image, 
  isBase64Video,
  isCloudinaryUrl,
  isEmbedUrl,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
  extractPublicIdFromUrl
} from '../utils/imageUtils.js';

const router = express.Router();

// @route   GET /api/projects/wall/:wallId
// @desc    Get projects for a wall
// @access  Public
router.get('/wall/:wallId', async (req, res) => {
  try {
    const projects = await Project.find({ wall_id: req.params.wallId })
      .sort({ order_index: 1 });
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/projects
// @desc    Create a new project
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
    
    // Handle media_url: upload base64 to Cloudinary if needed
    const projectData = { ...req.body };
    if (projectData.media_url) {
      try {
        if (isBase64Image(projectData.media_url)) {
          const uploadResult = await uploadBase64ToCloudinary(projectData.media_url, 'projects', 'project', 'image');
          projectData.media_url = uploadResult.secure_url;
          if (!projectData.media_type) {
            projectData.media_type = 'image';
          }
        } else if (isBase64Video(projectData.media_url)) {
          const uploadResult = await uploadBase64ToCloudinary(projectData.media_url, 'projects', 'project', 'video');
          projectData.media_url = uploadResult.secure_url;
          if (!projectData.media_type) {
            projectData.media_type = 'video';
          }
        } else if (!isCloudinaryUrl(projectData.media_url) && !isEmbedUrl(projectData.media_url)) {
          return res.status(400).json({ error: 'Media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing media_url:', error);
        return res.status(400).json({ error: `Media upload error: ${error.message}` });
      }
    }
    
    // Handle showreel_url if it's an upload type
    if (projectData.showreel_url && projectData.showreel_type === 'upload') {
      try {
        if (isBase64Video(projectData.showreel_url)) {
          const uploadResult = await uploadBase64ToCloudinary(projectData.showreel_url, 'showreels', 'showreel', 'video');
          projectData.showreel_url = uploadResult.secure_url;
        } else if (!isCloudinaryUrl(projectData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel upload error: ${error.message}` });
      }
    }
    
    const project = new Project(projectData);
    await project.save();
    
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/projects/:id
// @desc    Update a project
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user owns the wall
    const wall = await Wall.findById(project.wall_id);
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Handle media_url: upload base64 to Cloudinary if needed, delete old if replaced
    const updateData = { ...req.body };
    const oldMediaUrl = project.media_url;
    const oldShowreelUrl = project.showreel_url;
    
    if (updateData.media_url && updateData.media_url !== oldMediaUrl) {
      try {
        if (isBase64Image(updateData.media_url)) {
          const uploadResult = await uploadBase64ToCloudinary(updateData.media_url, 'projects', 'project', 'image');
          updateData.media_url = uploadResult.secure_url;
          if (!updateData.media_type) {
            updateData.media_type = 'image';
          }
          
          // Delete old media from Cloudinary if it exists
          if (oldMediaUrl && isCloudinaryUrl(oldMediaUrl)) {
            const oldPublicId = extractPublicIdFromUrl(oldMediaUrl);
            if (oldPublicId) {
              try {
                const resourceType = project.media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old media from Cloudinary:', error);
              }
            }
          }
        } else if (isBase64Video(updateData.media_url)) {
          const uploadResult = await uploadBase64ToCloudinary(updateData.media_url, 'projects', 'project', 'video');
          updateData.media_url = uploadResult.secure_url;
          if (!updateData.media_type) {
            updateData.media_type = 'video';
          }
          
          // Delete old media from Cloudinary if it exists
          if (oldMediaUrl && isCloudinaryUrl(oldMediaUrl)) {
            const oldPublicId = extractPublicIdFromUrl(oldMediaUrl);
            if (oldPublicId) {
              try {
                const resourceType = project.media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old media from Cloudinary:', error);
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.media_url) && !isEmbedUrl(updateData.media_url)) {
          return res.status(400).json({ error: 'Media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing media_url:', error);
        return res.status(400).json({ error: `Media upload error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary if needed, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldShowreelUrl) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldShowreelUrl && isCloudinaryUrl(oldShowreelUrl)) {
            const oldPublicId = extractPublicIdFromUrl(oldShowreelUrl);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel upload error: ${error.message}` });
      }
    }
    
    Object.assign(project, updateData);
    await project.save();
    
    res.json(project);
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/projects/:id
// @desc    Delete a project
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user owns the wall
    const wall = await Wall.findById(project.wall_id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Delete associated files from Cloudinary before deleting the project
    try {
      // Delete media if it exists in Cloudinary
      if (project.media_url && isCloudinaryUrl(project.media_url)) {
        const mediaPublicId = extractPublicIdFromUrl(project.media_url);
        if (mediaPublicId) {
          const resourceType = project.media_type === 'video' ? 'video' : 'image';
          await deleteFromCloudinary(mediaPublicId, resourceType);
        }
      }
      
      // Delete showreel if it exists in Cloudinary
      if (project.showreel_url && project.showreel_type === 'upload' && isCloudinaryUrl(project.showreel_url)) {
        const showreelPublicId = extractPublicIdFromUrl(project.showreel_url);
        if (showreelPublicId) {
          await deleteFromCloudinary(showreelPublicId, 'video');
        }
      }
    } catch (error) {
      console.error('Error deleting files from Cloudinary:', error);
      // Continue with project deletion even if Cloudinary deletion fails
    }
    
    await Project.findByIdAndDelete(req.params.id);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/projects/user/:userId
// @desc    Get all projects for a specific user
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    // Find the profile associated with the userId
    const profile = await Profile.findOne({ user_id: req.params.userId }).lean();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

    // Find the wall associated with the profile
    const wall = await Wall.findOne({ user_id: profile._id }).lean();

    if (!wall) {
      return res.status(404).json({ error: 'Wall not found for this user.' });
    }

    const projects = await Project.find({ wall_id: wall._id })
      .sort({ order_index: 1 })
      .lean();

    res.json(projects);
  } catch (error) {
    console.error('Get projects by user ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;
