import express from 'express';
import Wall from '../models/Wall.js';
import Project from '../models/Project.js';
import TeamMember from '../models/TeamMember.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';
import { 
  isBase64Image, 
  isBase64Video,
  isEmbedUrl,
  convertFilePathToBase64, 
  validateBase64ImageSize,
  cleanBase64String
} from '../utils/imageUtils.js';

const router = express.Router();

// IMPORTANT: Define specific routes before parameterized routes

// @route   GET /api/walls/my
// @desc    Get current user's walls
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    // Optimize: Use lean() and select only needed fields
    const profile = await Profile.findOne({ user_id: req.user.id })
      .select('_id rating')
      .lean();
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    // Optimize: Use lean() for faster queries, select only needed fields
    const walls = await Wall.find({ user_id: profile._id })
      .select('-__v') // Exclude version key
      .populate('user_id', 'name email rating location associations')
      .sort({ createdAt: -1 })
      .lean(); // Use lean for better performance
    
    // Convert file paths to base64 for frontend
    // Note: walls are already plain objects due to lean()
    const wallsWithBase64 = await Promise.all(
      walls.map(async (wall) => {
        const wallObj = wall; // Already a plain object with lean()
        
        // Add rating directly from populated user_id (profile) for easier frontend access
        if (wallObj.user_id && wallObj.user_id.rating) {
          wallObj.rating = wallObj.user_id.rating;
        } else if (profile.rating) {
          // Fallback to profile rating if populate didn't work
          wallObj.rating = profile.rating;
        }
        
        // Convert logo_url if it's a file path
        if (wallObj.logo_url && wallObj.logo_url.startsWith('/uploads/') && !isBase64Image(wallObj.logo_url)) {
          try {
            wallObj.logo_url = await convertFilePathToBase64(wallObj.logo_url);
          } catch (error) {
            console.error('Error converting logo to base64:', error);
            // Keep original path if conversion fails
          }
        }
        
        // Convert hero_media_url if it's a file path
        if (wallObj.hero_media_url && wallObj.hero_media_url.startsWith('/uploads/') && !isBase64Image(wallObj.hero_media_url)) {
          try {
            wallObj.hero_media_url = await convertFilePathToBase64(wallObj.hero_media_url);
          } catch (error) {
            console.error('Error converting hero media to base64:', error);
            // Keep original path if conversion fails
          }
        }
        
        return wallObj;
      })
    );
    
    res.json(wallsWithBase64);
  } catch (error) {
    console.error('Get my walls error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   PUT /api/walls/:id/view
// @desc    Increment wall view count
// @access  Public
router.put('/:id/view', async (req, res) => {
  try {
    const wall = await Wall.findById(req.params.id);
    
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    wall.view_count += 1;
    await wall.save();
    
    res.json({ view_count: wall.view_count });
  } catch (error) {
    console.error('Increment view error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/walls
// @desc    Get all published walls
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Optimize: Use lean() and limit results for better performance
    const walls = await Wall.find({ published: true })
      .select('-__v') // Exclude version key
      .populate('user_id', 'name email rating location associations')
      .sort({ createdAt: -1 })
      .limit(100) // Limit results to prevent huge responses
      .lean(); // Use lean for better performance
    
    // Convert file paths to base64 for frontend
    // Note: walls are already plain objects due to lean()
    const wallsWithBase64 = await Promise.all(
      walls.map(async (wall) => {
        const wallObj = wall; // Already a plain object with lean()
        
        // Add rating directly from populated user_id (profile) for easier frontend access
        if (wallObj.user_id && wallObj.user_id.rating) {
          wallObj.rating = wallObj.user_id.rating;
        }
        
        // Convert logo_url if it's a file path
        if (wallObj.logo_url && wallObj.logo_url.startsWith('/uploads/') && !isBase64Image(wallObj.logo_url)) {
          try {
            wallObj.logo_url = await convertFilePathToBase64(wallObj.logo_url);
          } catch (error) {
            console.error('Error converting logo to base64:', error);
            // Keep original path if conversion fails
          }
        }
        
        // Convert hero_media_url if it's a file path
        if (wallObj.hero_media_url && wallObj.hero_media_url.startsWith('/uploads/') && !isBase64Image(wallObj.hero_media_url)) {
          try {
            wallObj.hero_media_url = await convertFilePathToBase64(wallObj.hero_media_url);
          } catch (error) {
            console.error('Error converting hero media to base64:', error);
            // Keep original path if conversion fails
          }
        }
        
        return wallObj;
      })
    );
    
    res.json(wallsWithBase64);
  } catch (error) {
    console.error('Get walls error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/walls/:id
// @desc    Get wall by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    // Optimize: Use lean() for faster query
    const wall = await Wall.findById(req.params.id)
      .select('-__v') // Exclude version key
      .populate('user_id', 'name email rating location associations')
      .lean(); // Use lean for better performance
    
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    // Note: wall is already a plain object due to lean()
    const wallObj = wall;
    
    // Add rating directly from populated user_id (profile) for easier frontend access
    if (wallObj.user_id && wallObj.user_id.rating) {
      wallObj.rating = wallObj.user_id.rating;
    }
    
    // Convert file paths to base64 for frontend
    if (wallObj.logo_url && wallObj.logo_url.startsWith('/uploads/') && !isBase64Image(wallObj.logo_url)) {
      try {
        wallObj.logo_url = await convertFilePathToBase64(wallObj.logo_url);
      } catch (error) {
        console.error('Error converting logo to base64:', error);
        // Keep original path if conversion fails
      }
    }
    
    if (wallObj.hero_media_url && wallObj.hero_media_url.startsWith('/uploads/') && !isBase64Image(wallObj.hero_media_url)) {
      try {
        wallObj.hero_media_url = await convertFilePathToBase64(wallObj.hero_media_url);
      } catch (error) {
        console.error('Error converting hero media to base64:', error);
        // Keep original path if conversion fails
      }
    }
    
    // Convert showreel file path to base64 if it's an upload type
    if (wallObj.showreel_url && wallObj.showreel_type === 'upload' && 
        wallObj.showreel_url.startsWith('/uploads/') && !isBase64Video(wallObj.showreel_url)) {
      try {
        wallObj.showreel_url = await convertFilePathToBase64(wallObj.showreel_url);
      } catch (error) {
        console.error('Error converting showreel to base64:', error);
        // Keep original path if conversion fails
      }
    }
    
    res.json(wallObj);
  } catch (error) {
    console.error('Get wall error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   POST /api/walls
// @desc    Create a new wall
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    
    // Prepare wall data
    const wallData = { ...req.body };
    
    // Handle logo_url: store base64 directly, convert file paths to base64
    if (wallData.logo_url) {
      try {
        if (isBase64Image(wallData.logo_url)) {
          // Base64 data received - validate size before storing (10MB max for images)
          const validation = validateBase64ImageSize(wallData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
        // Clean the base64 string before storing
        wallData.logo_url = cleanBase64String(wallData.logo_url);
      } else if (wallData.logo_url.startsWith('/uploads/')) {
        // File path received - convert to base64 before storing
        wallData.logo_url = await convertFilePathToBase64(wallData.logo_url);
        }
        // If it's neither base64 nor file path, keep it as-is (could be URL)
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: store base64 directly, convert file paths to base64
    if (wallData.hero_media_url) {
      try {
        if (isBase64Image(wallData.hero_media_url)) {
          // Base64 data received - validate size before storing (10MB max for images)
          const validation = validateBase64ImageSize(wallData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
        // Clean the base64 string before storing
        wallData.hero_media_url = cleanBase64String(wallData.hero_media_url);
        // Set hero_media_type to 'image' if not specified
        if (!wallData.hero_media_type) {
          wallData.hero_media_type = 'image';
        }
      } else if (wallData.hero_media_url.startsWith('/uploads/')) {
        // File path received - convert to base64 before storing
        wallData.hero_media_url = await convertFilePathToBase64(wallData.hero_media_url);
          // Set hero_media_type to 'image' if not specified
          if (!wallData.hero_media_type) {
            wallData.hero_media_type = 'image';
          }
        } else {
          // If it's not base64 or file path, set hero_media_type to 'image' if not specified
          if (!wallData.hero_media_type && wallData.hero_media_url) {
            wallData.hero_media_type = 'image';
          }
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero image error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: convert file paths to base64, keep embed URLs as-is
    if (wallData.showreel_url && wallData.showreel_type === 'upload') {
      if (isBase64Video(wallData.showreel_url)) {
        // Base64 video data received - clean and store directly
        wallData.showreel_url = cleanBase64String(wallData.showreel_url);
      } else if (wallData.showreel_url.startsWith('/uploads/')) {
        // File path received - convert to base64 before storing
        try {
          wallData.showreel_url = await convertFilePathToBase64(wallData.showreel_url);
        } catch (error) {
          console.error('Error converting showreel file to base64:', error);
          return res.status(400).json({ error: 'Failed to convert showreel video: ' + error.message });
        }
      }
    }
    
    // Check total document size (MongoDB has 16MB document limit)
    const wallDataString = JSON.stringify(wallData);
    const wallDataSizeMB = Buffer.byteLength(wallDataString, 'utf8') / (1024 * 1024);
    
    if (wallDataSizeMB > 15) { // Leave some margin below 16MB limit
      return res.status(400).json({ 
        error: `Wall data is too large (${wallDataSizeMB.toFixed(2)}MB). Maximum allowed: 15MB. Please reduce image sizes.` 
      });
    }
    
    let wall;
    try {
      wall = new Wall({
        ...wallData,
        user_id: profile._id
      });
      
      await wall.save();
    } catch (saveError) {
      console.error('Error saving wall to database:', saveError);
      
      // Check if it's a document size error
      if (saveError.message && (saveError.message.includes('document is too large') || saveError.message.includes('too large'))) {
        return res.status(400).json({ 
          error: 'Wall data is too large. Please reduce image sizes. Maximum total size: 15MB.' 
        });
      }
      // Check if it's a buffer offset error
      if (saveError.message && saveError.message.includes('offset')) {
        return res.status(400).json({ 
          error: 'Invalid image data format. Please try uploading the images again.' 
        });
      }
      // Check for validation errors
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({ 
          error: `Validation error: ${saveError.message}` 
        });
      }
      // Re-throw to be caught by outer catch
      throw saveError;
    }
    
    // Populate user_id before sending response
    if (!wall || !wall._id) {
      throw new Error('Wall was not created successfully');
    }
    
    const populatedWall = await Wall.findById(wall._id)
      .populate('user_id', 'name email rating location associations');
    
    // Images should already be base64 at this point, but convert any remaining file paths as safety net
    const wallObj = populatedWall.toObject();
    
    // Add rating directly from populated user_id (profile) for easier frontend access
    if (wallObj.user_id && wallObj.user_id.rating) {
      wallObj.rating = wallObj.user_id.rating;
    } else if (profile.rating) {
      // Fallback to profile rating if populate didn't work
      wallObj.rating = profile.rating;
    }
    
    if (wallObj.logo_url && wallObj.logo_url.startsWith('/uploads/') && !isBase64Image(wallObj.logo_url)) {
      try {
        wallObj.logo_url = await convertFilePathToBase64(wallObj.logo_url);
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }
    
    if (wallObj.hero_media_url && wallObj.hero_media_url.startsWith('/uploads/') && !isBase64Image(wallObj.hero_media_url)) {
      try {
        wallObj.hero_media_url = await convertFilePathToBase64(wallObj.hero_media_url);
      } catch (error) {
        console.error('Error converting hero media to base64:', error);
      }
    }
    
    // Convert showreel file path to base64 if it's an upload type
    if (wallObj.showreel_url && wallObj.showreel_type === 'upload' && 
        wallObj.showreel_url.startsWith('/uploads/') && !isBase64Video(wallObj.showreel_url)) {
      try {
        wallObj.showreel_url = await convertFilePathToBase64(wallObj.showreel_url);
      } catch (error) {
        console.error('Error converting showreel to base64:', error);
      }
    }
    
    res.status(201).json(wallObj);
  } catch (error) {
    console.error('Create wall error:', error);
    const errorMessage = error.message || 'Failed to create wall';
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   PUT /api/walls/:id
// @desc    Update a wall
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const wall = await Wall.findById(req.params.id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    // Check if user owns the wall
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    // Prepare update data
    const updateData = { ...req.body };
    
    // If base64 images are provided, store them directly (don't convert to files)
    // If logo_url is base64, keep it as base64
    if (updateData.logo_url && isBase64Image(updateData.logo_url)) {
      // Base64 data received - validate size before storing (10MB max for images)
      const validation = validateBase64ImageSize(updateData.logo_url, 10);
      if (!validation.valid) {
        return res.status(400).json({ error: `Logo image: ${validation.error}` });
      }
    } else if (updateData.logo_url && updateData.logo_url.startsWith('/uploads/')) {
      // If it's a file path, convert it to base64 for frontend
      try {
        updateData.logo_url = await convertFilePathToBase64(updateData.logo_url);
      } catch (error) {
        console.error('Error converting logo file to base64:', error);
        // Continue with file path if conversion fails
      }
    }
    
    // If hero_media_url is base64, keep it as base64
    if (updateData.hero_media_url && isBase64Image(updateData.hero_media_url)) {
      // Base64 data received - validate size before storing (10MB max for images)
      const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
      if (!validation.valid) {
        return res.status(400).json({ error: `Hero image: ${validation.error}` });
      }
      // Set hero_media_type to 'image' if not specified
      if (!updateData.hero_media_type) {
        updateData.hero_media_type = 'image';
      }
    } else if (updateData.hero_media_url && updateData.hero_media_url.startsWith('/uploads/')) {
      // If it's a file path, convert it to base64 for frontend
      try {
        updateData.hero_media_url = await convertFilePathToBase64(updateData.hero_media_url);
      } catch (error) {
        console.error('Error converting hero file to base64:', error);
        // Continue with file path if conversion fails
      }
    }
    
    // Handle showreel_url: convert file paths to base64, keep embed URLs as-is
    if (updateData.showreel_url && updateData.showreel_type === 'upload') {
      if (isBase64Video(updateData.showreel_url)) {
        // Base64 video data received - store directly
      } else if (updateData.showreel_url.startsWith('/uploads/')) {
        // File path received - convert to base64 before storing
        try {
          updateData.showreel_url = await convertFilePathToBase64(updateData.showreel_url);
        } catch (error) {
          console.error('Error converting showreel file to base64:', error);
          return res.status(400).json({ error: 'Failed to convert showreel video: ' + error.message });
        }
      }
    }
    
    Object.assign(wall, updateData);
    await wall.save();
    
    // Populate before returning
    const populatedWall = await Wall.findById(wall._id)
      .populate('user_id', 'name email rating location associations');
    
    const wallObj = populatedWall.toObject();
    
    // Add rating directly from populated user_id (profile) for easier frontend access
    if (wallObj.user_id && wallObj.user_id.rating) {
      wallObj.rating = wallObj.user_id.rating;
    } else if (profile.rating) {
      // Fallback to profile rating if populate didn't work
      wallObj.rating = profile.rating;
    }
    
    // Convert any remaining file paths to base64 for frontend
    if (wallObj.logo_url && wallObj.logo_url.startsWith('/uploads/') && !isBase64Image(wallObj.logo_url)) {
      try {
        wallObj.logo_url = await convertFilePathToBase64(wallObj.logo_url);
      } catch (error) {
        console.error('Error converting logo to base64:', error);
      }
    }
    
    if (wallObj.hero_media_url && wallObj.hero_media_url.startsWith('/uploads/') && !isBase64Image(wallObj.hero_media_url)) {
      try {
        wallObj.hero_media_url = await convertFilePathToBase64(wallObj.hero_media_url);
      } catch (error) {
        console.error('Error converting hero media to base64:', error);
      }
    }
    
    // Convert showreel file path to base64 if it's an upload type
    if (wallObj.showreel_url && wallObj.showreel_type === 'upload' && 
        wallObj.showreel_url.startsWith('/uploads/') && !isBase64Video(wallObj.showreel_url)) {
      try {
        wallObj.showreel_url = await convertFilePathToBase64(wallObj.showreel_url);
      } catch (error) {
        console.error('Error converting showreel to base64:', error);
      }
    }
    
    res.json(wallObj);
  } catch (error) {
    console.error('Update wall error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   DELETE /api/walls/:id
// @desc    Delete a wall
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const profile = await Profile.findOne({ user_id: req.user.id });
    if (!profile) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    const wall = await Wall.findById(req.params.id);
    if (!wall) {
      return res.status(404).json({ error: 'Wall not found' });
    }
    
    // Check if user owns the wall
    if (wall.user_id.toString() !== profile._id.toString()) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await Wall.findByIdAndDelete(req.params.id);
    res.json({ message: 'Wall deleted' });
  } catch (error) {
    console.error('Delete wall error:', error);
    res.status(500).json({ error: error.message });
  }
});

// @route   GET /api/walls/:id/projects
// @desc    Get projects for a wall
// @access  Public
router.get('/:id/projects', async (req, res) => {
  try {
    const projects = await Project.find({ wall_id: req.params.id })
      .sort({ order_index: 1 });
    
    res.json(projects);
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
