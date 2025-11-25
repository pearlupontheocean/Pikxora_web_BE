import multer from 'multer';
import path from 'path';
import { storage, isCloudinaryConfigured } from '../config/cloudinary.js';

// Create a memory storage fallback if Cloudinary is not configured
const memoryStorage = multer.memoryStorage();

// Use Cloudinary storage if configured, otherwise use memory storage (will need manual upload)
const uploadStorage = isCloudinaryConfigured() ? storage : memoryStorage;

export const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      cb(null, true);
    } else {
      cb(new Error('Only images and videos are allowed'));
    }
  }
});
