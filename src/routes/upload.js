import express from 'express';
import { upload } from '../middleware/upload.js';
import { protect } from '../middleware/auth.js';
import { requireCloudinary } from '../config/cloudinary.js';

const router = express.Router();

// @route   POST /api/upload
// @desc    Upload a file to Cloudinary
// @access  Private
router.post('/', protect, (req, res, next) => {
  // Check Cloudinary configuration before processing upload
  try {
    requireCloudinary();
    next();
  } catch (error) {
    return res.status(500).json({ 
      error: 'Cloudinary is not configured. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in your .env file. See CLOUDINARY_SETUP.md for instructions.' 
    });
  }
}, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Cloudinary returns secure_url and public_id in req.file
    res.json({
      url: req.file.path, // secure_url
      secure_url: req.file.path,
      public_id: req.file.filename, // public_id without extension
      resource_type: req.file.resource_type
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
