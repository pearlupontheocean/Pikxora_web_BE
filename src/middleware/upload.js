import multer from 'multer';
import path from 'path';
import { storage, isCloudinaryConfigured } from '../config/cloudinary.js';

// Create a memory storage fallback if Cloudinary is not configured
const memoryStorage = multer.memoryStorage();

// Use Cloudinary storage if configured, otherwise use memory storage (will need manual upload)
const uploadStorage = isCloudinaryConfigured() ? storage : memoryStorage;

// Allowed file types for different use cases
const imageVideoTypes = /jpeg|jpg|png|gif|webp|mp4|webm|mov/;
const documentTypes = /pdf|doc|docx/;
const documentMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

export const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
    const isImageVideo = imageVideoTypes.test(ext) && imageVideoTypes.test(file.mimetype);
    const isDocument = documentTypes.test(ext) || documentMimeTypes.includes(file.mimetype);
    
    if (isImageVideo || isDocument) {
      cb(null, true);
    } else {
      cb(new Error('Only images, videos, and documents (PDF, DOC, DOCX) are allowed'));
    }
  }
});
