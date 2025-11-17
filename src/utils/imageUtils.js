import fs from 'fs';
import { promises as fsPromises } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Saves a base64 image to the filesystem
 * @param {string} base64Data - Base64 encoded image data (with or without data URI prefix)
 * @param {string} folder - Folder name within uploads directory (e.g., 'logos', 'hero')
 * @param {string} prefix - Filename prefix (e.g., 'logo', 'hero')
 * @returns {Promise<string>} - URL path to the saved file
 */
export async function saveBase64Image(base64Data, folder = 'wall-assets', prefix = 'image') {
  try {
    // Remove data URI prefix if present (e.g., "data:image/png;base64,")
    const base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    // Extract MIME type if available
    const mimeMatch = base64Data.match(/data:([^;]+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    
    // Determine file extension from MIME type
    const extensionMap = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };
    const extension = extensionMap[mimeType] || '.png';
    
    // Convert base64 to buffer
    const buffer = Buffer.from(base64String, 'base64');
    
    // Create upload directory if it doesn't exist
    const uploadPath = path.join(__dirname, '../../uploads', folder);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = `${prefix}-${uniqueSuffix}${extension}`;
    const filepath = path.join(uploadPath, filename);
    
    // Write file to disk
    fs.writeFileSync(filepath, buffer);
    
    // Return the URL path
    return `/uploads/${folder}/${filename}`;
  } catch (error) {
    console.error('Error saving base64 image:', error);
    throw new Error(`Failed to save image: ${error.message}`);
  }
}

/**
 * Checks if a string is a base64 image data URI
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isBase64Image(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:image/') && str.includes('base64,');
}

/**
 * Cleans and normalizes a base64 data URI string
 * @param {string} base64Data - Base64 encoded data with data URI prefix
 * @returns {string} - Cleaned base64 data URI
 */
export function cleanBase64String(base64Data) {
  try {
    if (!base64Data || typeof base64Data !== 'string') {
      return base64Data;
    }
    
    // If it's a data URI, preserve the prefix
    if (base64Data.includes(',')) {
      const parts = base64Data.split(',');
      if (parts.length >= 2) {
        const prefix = parts[0];
        const data = parts.slice(1).join(','); // In case there are commas in the data (shouldn't happen, but be safe)
        // Clean the base64 data part (remove whitespace)
        const cleanedData = data.trim().replace(/\s/g, '');
        return `${prefix},${cleanedData}`;
      }
    }
    
    // If it's just base64 data, clean it
    return base64Data.trim().replace(/\s/g, '');
  } catch (error) {
    console.error('Error cleaning base64 string:', error);
    // Return original if cleaning fails
    return base64Data;
  }
}

/**
 * Validates base64 image size
 * @param {string} base64Data - Base64 encoded image data
 * @param {number} maxSizeMB - Maximum file size in MB (default: 50MB)
 * @returns {{ valid: boolean; error?: string; sizeMB?: number }}
 */
export function validateBase64ImageSize(base64Data, maxSizeMB = 50) {
  if (!base64Data) {
    return { valid: false, error: 'No image data provided' };
  }
  
  try {
    // Remove data URI prefix to get just the base64 string
    let base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    // Trim whitespace and newlines that might cause issues
    base64String = base64String.trim().replace(/\s/g, '');
    
    // Validate base64 format (basic check)
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64String)) {
      return { valid: false, error: 'Invalid base64 format' };
    }
    
    // Base64 encoding increases size by ~33%, so actual file size is smaller
    // Calculate approximate file size: base64 string length * 3/4
    // Account for padding characters (=)
    const paddingCount = (base64String.match(/=/g) || []).length;
    const base64Length = base64String.length;
    const approximateFileSizeBytes = Math.floor((base64Length * 3) / 4) - paddingCount;
    const sizeMB = approximateFileSizeBytes / (1024 * 1024);
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    
    // Check actual base64 payload size (this is what we send over the network)
    const base64PayloadSizeMB = base64String.length / (1024 * 1024);
    
    if (approximateFileSizeBytes > maxSizeBytes) {
      return {
        valid: false,
        error: `Image file size (${sizeMB.toFixed(2)}MB) exceeds maximum allowed size of ${maxSizeMB}MB`,
        sizeMB
      };
    }
    
    // Also check base64 payload size (should be ~33% larger than file size)
    // Use a more generous limit for payload size (base64 is ~33% larger)
    if (base64PayloadSizeMB > maxSizeMB * 1.4) {
      return {
        valid: false,
        error: `Image payload size (${base64PayloadSizeMB.toFixed(2)}MB) is too large. Maximum allowed: ${(maxSizeMB * 1.4).toFixed(2)}MB`,
        sizeMB: base64PayloadSizeMB
      };
    }
    
    return { valid: true, sizeMB };
  } catch (error) {
    console.error('Error validating base64 image size:', error);
    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

/**
 * Converts a file path to base64 data URL
 * @param {string} filePath - File path starting with /uploads/
 * @returns {Promise<string>} - Base64 data URL
 */
export async function convertFilePathToBase64(filePath) {
  try {
    const fullPath = path.join(__dirname, '../../', filePath);
    
    // Check if file exists (async check)
    try {
      await fsPromises.access(fullPath);
    } catch {
      throw new Error(`File not found: ${filePath}`);
    }
    
    // Read file as buffer (async)
    const buffer = await fsPromises.readFile(fullPath);
    
    // Determine MIME type from file extension
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mov': 'video/quicktime',
      '.avi': 'video/x-msvideo'
    };
    const mimeType = mimeMap[ext] || (ext.startsWith('.') ? `application/${ext.slice(1)}` : 'application/octet-stream');
    
    // Convert to base64
    const base64String = buffer.toString('base64');
    return `data:${mimeType};base64,${base64String}`;
  } catch (error) {
    console.error('Error converting file to base64:', error);
    throw error;
  }
}

/**
 * Checks if a string is a base64 video data URI
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isBase64Video(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:video/') && str.includes('base64,');
}

/**
 * Checks if a string is an embed URL (YouTube, Vimeo, etc.)
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isEmbedUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return str.includes('youtube.com') || 
         str.includes('youtu.be') || 
         str.includes('vimeo.com') ||
         str.startsWith('http') && (str.includes('/embed/') || str.includes('player.vimeo.com'));
}

