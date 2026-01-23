import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ============================================================================
// FALLBACK CLOUDINARY CREDENTIALS
// ============================================================================
// If .env variables are not loaded, these values will be used instead.
// 
// TO USE: Replace the placeholder values below with your actual Cloudinary credentials
// Get your credentials from: https://cloudinary.com/console
//
// Example:
//   const FALLBACK_CLOUD_NAME = 'dxyz123abc';
//   const FALLBACK_API_KEY = '123456789012345';
//   const FALLBACK_API_SECRET = 'abcdefghijklmnopqrstuvwxyz123456';
//
// Priority: Environment variables (.env) > Fallback values (this file)
// ============================================================================
const FALLBACK_CLOUD_NAME = 'dzcnrln1t';
const FALLBACK_API_KEY = '611229544583255';
const FALLBACK_API_SECRET = 'GofJf1jWEXMGt6PYlYY2f42L_9w';

// Helper to check if a value is a placeholder
const isPlaceholder = (value) => {
  return !value || ['your-cloud-name', 'your-api-key', 'your-api-secret'].includes(value);
};

// Get Cloudinary credentials from environment variables or use fallback
// If env var exists but is a placeholder, use fallback instead
const cloudName = (process.env.CLOUDINARY_CLOUD_NAME && !isPlaceholder(process.env.CLOUDINARY_CLOUD_NAME)) 
  ? process.env.CLOUDINARY_CLOUD_NAME 
  : FALLBACK_CLOUD_NAME;
  
const apiKey = (process.env.CLOUDINARY_API_KEY && !isPlaceholder(process.env.CLOUDINARY_API_KEY))
  ? process.env.CLOUDINARY_API_KEY
  : FALLBACK_API_KEY;
  
const apiSecret = (process.env.CLOUDINARY_API_SECRET && !isPlaceholder(process.env.CLOUDINARY_API_SECRET))
  ? process.env.CLOUDINARY_API_SECRET
  : FALLBACK_API_SECRET;

// Check if credentials are configured (not placeholder values)
// Valid credentials should not be empty and not be the placeholder strings
const isPlaceholderValue = (value) => {
  return !value || isPlaceholder(value);
};

// Check if all three credentials are present and not placeholders
const hasValidCloudName = cloudName && !isPlaceholderValue(cloudName);
const hasValidApiKey = apiKey && !isPlaceholderValue(apiKey);
const hasValidApiSecret = apiSecret && !isPlaceholderValue(apiSecret);

const isConfigured = hasValidCloudName && hasValidApiKey && hasValidApiSecret;

// Configure Cloudinary (will use fallback values if env vars not loaded)
cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
});

if (!isConfigured) {
  console.warn('⚠️  Cloudinary credentials not configured. File uploads will fail.');
} else {
  // Silent success - Cloudinary is configured
}

// Export a function to check if Cloudinary is configured
export const isCloudinaryConfigured = () => isConfigured;

// Export a function to validate and throw error if not configured
export const requireCloudinary = () => {
  if (!isConfigured) {
    throw new Error('Cloudinary credentials are not configured. Please update your .env file with actual Cloudinary credentials. See CLOUDINARY_SETUP.md for instructions.');
  }
};

// Document MIME types
const documentMimeTypes = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

// Create Cloudinary storage for multer (only if configured)
export const storage = isConfigured ? new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const folder = req.body.folder || 'general';
    
    // Determine resource type based on file mimetype
    let resourceType = 'auto'; // Cloudinary will auto-detect
    let allowedFormats = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'mov'];
    
    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (documentMimeTypes.includes(file.mimetype)) {
      // Documents need 'raw' resource type in Cloudinary
      resourceType = 'raw';
      allowedFormats = ['pdf', 'doc', 'docx'];
    }
    
    return {
      folder: `pikxora/${folder}`,
      resource_type: resourceType,
      allowed_formats: allowedFormats,
      transformation: resourceType === 'image' ? [
        { quality: 'auto' },
        { fetch_format: 'auto' }
      ] : undefined,
    };
  },
}) : null;

// Export cloudinary instance for direct use
export default cloudinary;

