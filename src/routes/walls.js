import express from 'express';
import Wall from '../models/Wall.js';
import Project from '../models/Project.js';
import TeamMember from '../models/TeamMember.js';
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import { protect } from '../middleware/auth.js';
import { 
  isBase64Image, 
  isBase64Video,
  isEmbedUrl,
  isCloudinaryUrl,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
  extractPublicIdFromUrl,
  validateBase64ImageSize
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
    
    // Cloudinary URLs are ready to use, no conversion needed
    const wallsWithUrls = walls.map((wall) => {
      const wallObj = wall; // Already a plain object with lean()
      
      // Add rating directly from populated user_id (profile) for easier frontend access
      if (wallObj.user_id && wallObj.user_id.rating) {
        wallObj.rating = wallObj.user_id.rating;
      } else if (profile.rating) {
        // Fallback to profile rating if populate didn't work
        wallObj.rating = profile.rating;
      }
      
      return wallObj;
    });
    
    res.json(wallsWithUrls);
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
// @desc    Get all published walls (excluding artist walls)
// @access  Public
router.get('/', async (req, res) => {
  try {
    // Optimize: Use lean() and limit results for better performance
    const walls = await Wall.find({ published: true })
      .select('-__v') // Exclude version key
      .populate('user_id', 'name email rating location associations user_id')
      .sort({ createdAt: -1 })
      .limit(100) // Limit results to prevent huge responses
      .lean(); // Use lean for better performance
    

    // Cloudinary URLs are ready to use, no conversion needed
    const wallsWithUrls = walls.map((wall) => {
      const wallObj = wall; // Already a plain object with lean()
      
      // Add rating directly from populated user_id (profile) for easier frontend access
      if (wallObj.user_id && wallObj.user_id.rating) {
        wallObj.rating = wallObj.user_id.rating;
      }
      
      return wallObj;
    });
    // Get all unique user IDs from profiles to fetch user roles efficiently
    const profileUserIds = walls
      .map(wall => {
        // Handle both ObjectId and string formats
        const userId = wall.user_id?.user_id;
        return userId ? (userId.toString ? userId.toString() : String(userId)) : null;
      })
      .filter(Boolean)
      .filter((id, index, self) => self.indexOf(id) === index); // Get unique IDs
    
    // Fetch all users with their roles in one query
    const users = await User.find({ _id: { $in: profileUserIds } })
      .select('_id roles')
      .lean();
    
    // Create a map of user_id to roles for quick lookup
    const userRolesMap = new Map(users.map(user => [user._id.toString(), user.roles || []]));
    
    // Filter out artist walls BEFORE processing
    const nonArtistWalls = walls.filter((wall) => {
      if (!wall.user_id || !wall.user_id.user_id) {
        // If we can't determine the user, exclude it for safety
        return false;
      }
      // Handle both ObjectId and string formats
      const userIdObj = wall.user_id.user_id;
      const userId = userIdObj.toString ? userIdObj.toString() : String(userIdObj);
      const roles = userRolesMap.get(userId) || [];
      // Exclude walls created by users with 'artist' role
      const isArtist = Array.isArray(roles) && roles.includes('artist');
      return !isArtist;
    });
    
    // Convert file paths to base64 for frontend
    // Note: walls are already plain objects due to lean()
    const wallsWithBase64 = await Promise.all(
      nonArtistWalls.map(async (wall) => {
        const wallObj = wall; // Already a plain object with lean()
        
        // Add rating directly from populated user_id (profile) for easier frontend access
        if (wallObj.user_id && wallObj.user_id.rating) {
          wallObj.rating = wallObj.user_id.rating;
        }
        
        // Add roles from user to user_id object for easier frontend access
        if (wallObj.user_id && wallObj.user_id.user_id) {
          const userId = wallObj.user_id.user_id.toString();
          const roles = userRolesMap.get(userId) || [];
          wallObj.user_id.roles = roles;
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
    
    res.json(wallsWithUrls);
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
    
    // Cloudinary URLs are already ready to use, no conversion needed
    
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

    // Check if the user already has a wall
    const existingWall = await Wall.findOne({ user_id: profile._id });
    if (existingWall) {
      return res.status(400).json({ error: 'User can only have one wall.' });
    }

    // Prepare wall data
    const wallData = { ...req.body };
    
    // Handle logo_url: upload base64 to Cloudinary, keep existing Cloudinary URLs
    if (wallData.logo_url) {
      try {
        if (isBase64Image(wallData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(wallData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(wallData.logo_url, 'logos', 'logo', 'image');
          wallData.logo_url = uploadResult.secure_url;
        } else if (isCloudinaryUrl(wallData.logo_url) || isEmbedUrl(wallData.logo_url)) {
          // Already a Cloudinary URL or embed URL, keep as-is
        } else {
          // Invalid format
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, keep existing Cloudinary URLs
    if (wallData.hero_media_url) {
      try {
        if (isBase64Image(wallData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(wallData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(wallData.hero_media_url, 'hero', 'hero', 'image');
          wallData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!wallData.hero_media_type) {
            wallData.hero_media_type = 'image';
          }
        } else if (isBase64Video(wallData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(wallData.hero_media_url, 'hero', 'hero', 'video');
          wallData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!wallData.hero_media_type) {
            wallData.hero_media_type = 'video';
          }
        } else if (isCloudinaryUrl(wallData.hero_media_url) || isEmbedUrl(wallData.hero_media_url)) {
          // Already a Cloudinary URL or embed URL, keep as-is
          if (!wallData.hero_media_type) {
            // Try to determine type from URL
            wallData.hero_media_type = isEmbedUrl(wallData.hero_media_url) ? 'video' : 'image';
          }
        } else {
          // Invalid format
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, keep embed URLs as-is
    if (wallData.showreel_url && wallData.showreel_type === 'upload') {
      try {
        if (isBase64Video(wallData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(wallData.showreel_url, 'showreels', 'showreel', 'video');
          wallData.showreel_url = uploadResult.secure_url;
        } else if (isCloudinaryUrl(wallData.showreel_url)) {
          // Already a Cloudinary URL, keep as-is
        } else {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
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
    
    const wallObj = populatedWall.toObject();
    
    // Add rating directly from populated user_id (profile) for easier frontend access
    if (wallObj.user_id && wallObj.user_id.rating) {
      wallObj.rating = wallObj.user_id.rating;
    } else if (profile.rating) {
      // Fallback to profile rating if populate didn't work
      wallObj.rating = profile.rating;
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    // Track old URLs to delete from Cloudinary if replaced
    const oldUrls = {
      logo_url: wall.logo_url,
      hero_media_url: wall.hero_media_url,
      showreel_url: wall.showreel_url
    };
    
    // Handle logo_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.logo_url && updateData.logo_url !== oldUrls.logo_url) {
      try {
        if (isBase64Image(updateData.logo_url)) {
          // Base64 data received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.logo_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Logo image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.logo_url, 'logos', 'logo', 'image');
          updateData.logo_url = uploadResult.secure_url;
          
          // Delete old logo from Cloudinary if it exists
          if (oldUrls.logo_url && isCloudinaryUrl(oldUrls.logo_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.logo_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'image');
              } catch (error) {
                console.error('Error deleting old logo from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.logo_url) && !isEmbedUrl(updateData.logo_url)) {
          return res.status(400).json({ error: 'Logo URL must be a base64 image, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing logo_url:', error);
        return res.status(400).json({ error: `Logo image error: ${error.message}` });
      }
    }
    
    // Handle hero_media_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.hero_media_url && updateData.hero_media_url !== oldUrls.hero_media_url) {
      try {
        if (isBase64Image(updateData.hero_media_url)) {
          // Base64 image received - validate size before uploading (10MB max for images)
          const validation = validateBase64ImageSize(updateData.hero_media_url, 10);
          if (!validation.valid) {
            return res.status(400).json({ error: `Hero image: ${validation.error}` });
          }
          // Upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'image');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'image' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'image';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (isBase64Video(updateData.hero_media_url)) {
          // Base64 video received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.hero_media_url, 'hero', 'hero', 'video');
          updateData.hero_media_url = uploadResult.secure_url;
          // Set hero_media_type to 'video' if not specified
          if (!updateData.hero_media_type) {
            updateData.hero_media_type = 'video';
          }
          
          // Delete old hero media from Cloudinary if it exists
          if (oldUrls.hero_media_url && isCloudinaryUrl(oldUrls.hero_media_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.hero_media_url);
            if (oldPublicId) {
              try {
                const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
                await deleteFromCloudinary(oldPublicId, resourceType);
              } catch (error) {
                console.error('Error deleting old hero media from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.hero_media_url) && !isEmbedUrl(updateData.hero_media_url)) {
          return res.status(400).json({ error: 'Hero media URL must be a base64 image/video, Cloudinary URL, or embed URL' });
        }
      } catch (error) {
        console.error('Error processing hero_media_url:', error);
        return res.status(400).json({ error: `Hero media error: ${error.message}` });
      }
    }
    
    // Handle showreel_url: upload base64 to Cloudinary, delete old if replaced
    if (updateData.showreel_url && updateData.showreel_type === 'upload' && 
        updateData.showreel_url !== oldUrls.showreel_url) {
      try {
        if (isBase64Video(updateData.showreel_url)) {
          // Base64 video data received - upload to Cloudinary
          const uploadResult = await uploadBase64ToCloudinary(updateData.showreel_url, 'showreels', 'showreel', 'video');
          updateData.showreel_url = uploadResult.secure_url;
          
          // Delete old showreel from Cloudinary if it exists
          if (oldUrls.showreel_url && isCloudinaryUrl(oldUrls.showreel_url)) {
            const oldPublicId = extractPublicIdFromUrl(oldUrls.showreel_url);
            if (oldPublicId) {
              try {
                await deleteFromCloudinary(oldPublicId, 'video');
              } catch (error) {
                console.error('Error deleting old showreel from Cloudinary:', error);
                // Continue even if deletion fails
              }
            }
          }
        } else if (!isCloudinaryUrl(updateData.showreel_url)) {
          return res.status(400).json({ error: 'Showreel URL must be a base64 video or Cloudinary URL when type is upload' });
        }
      } catch (error) {
        console.error('Error processing showreel_url:', error);
        return res.status(400).json({ error: `Showreel error: ${error.message}` });
      }
    }
    
    // Handle associations: upload base64 images to Cloudinary
    if (Array.isArray(updateData.associations)) {
      for (let i = 0; i < updateData.associations.length; i++) {
        const assoc = updateData.associations[i];
        if (assoc && assoc.image && isBase64Image(assoc.image)) {
          try {
            const validation = validateBase64ImageSize(assoc.image, 10);
            if (!validation.valid) {
              return res.status(400).json({ error: `Association image ${i + 1}: ${validation.error}` });
            }
            const uploadResult = await uploadBase64ToCloudinary(assoc.image, 'associations', 'association', 'image');
            updateData.associations[i] = { ...assoc, image: uploadResult.secure_url };
          } catch (error) {
            console.error('Error processing association image:', error);
            return res.status(400).json({ error: `Association image ${i + 1}: ${error.message}` });
          }
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
    
    res.status(201).json(wallObj);
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
    
    // Delete associated files from Cloudinary before deleting the wall
    try {
      // Delete logo if it exists in Cloudinary
      if (wall.logo_url && isCloudinaryUrl(wall.logo_url)) {
        const logoPublicId = extractPublicIdFromUrl(wall.logo_url);
        if (logoPublicId) {
          await deleteFromCloudinary(logoPublicId, 'image');
        }
      }
      
      // Delete hero media if it exists in Cloudinary
      if (wall.hero_media_url && isCloudinaryUrl(wall.hero_media_url)) {
        const heroPublicId = extractPublicIdFromUrl(wall.hero_media_url);
        if (heroPublicId) {
          const resourceType = wall.hero_media_type === 'video' ? 'video' : 'image';
          await deleteFromCloudinary(heroPublicId, resourceType);
        }
      }
      
      // Delete showreel if it exists in Cloudinary
      if (wall.showreel_url && wall.showreel_type === 'upload' && isCloudinaryUrl(wall.showreel_url)) {
        const showreelPublicId = extractPublicIdFromUrl(wall.showreel_url);
        if (showreelPublicId) {
          await deleteFromCloudinary(showreelPublicId, 'video');
        }
      }
    } catch (error) {
      console.error('Error deleting files from Cloudinary:', error);
      // Continue with wall deletion even if Cloudinary deletion fails
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

// @route   GET /api/walls/user/:userId
// @desc    Get all walls for a specific user
// @access  Public
router.get('/user/:userId', async (req, res) => {
  try {
    // Find the profile associated with the userId
    const profile = await Profile.findOne({ user_id: req.params.userId }).lean();

    if (!profile) {
      return res.status(404).json({ error: 'Profile not found for this user.' });
    }

    const walls = await Wall.find({ user_id: profile._id })
      .select('-__v') // Exclude version key
      .populate('user_id', 'name email rating location associations')
      .sort({ createdAt: -1 })
      .lean();

    // Add rating directly from populated user_id (profile) for easier frontend access
    const wallsWithRating = walls.map(wall => ({
      ...wall,
      rating: (wall.user_id && wall.user_id.rating) ? wall.user_id.rating : profile.rating,
    }));

    res.json(wallsWithRating);
  } catch (error) {
    console.error('Get walls by user ID error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    res.status(500).json({ error: error.message });
  }
});

export default router;