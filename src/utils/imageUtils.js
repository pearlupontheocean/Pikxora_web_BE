import cloudinary, { requireCloudinary } from '../config/cloudinary.js';

/**
 * Uploads a base64 image/video to Cloudinary
 * @param {string} base64Data - Base64 encoded image/video data (with or without data URI prefix)
 * @param {string} folder - Folder name in Cloudinary (e.g., 'logos', 'hero', 'wall-assets')
 * @param {string} prefix - Filename prefix (e.g., 'logo', 'hero')
 * @param {string} resourceType - 'image' or 'video' (default: 'auto' - Cloudinary will detect)
 * @returns {Promise<{secure_url: string, public_id: string}>} - Cloudinary secure URL and public ID
 */
export async function uploadBase64ToCloudinary(base64Data, folder = 'wall-assets', prefix = 'image', resourceType = 'auto') {
  // Check if Cloudinary is configured before attempting upload
  requireCloudinary();
  
  try {
    // Remove data URI prefix if present (e.g., "data:image/png;base64,")
    const base64String = base64Data.includes(',') 
      ? base64Data.split(',')[1] 
      : base64Data;
    
    // Extract MIME type if available
    const mimeMatch = base64Data.match(/data:([^;]+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    
    // Determine resource type from MIME type if not specified
    if (resourceType === 'auto') {
      if (mimeType.startsWith('image/')) {
        resourceType = 'image';
      } else if (mimeType.startsWith('video/')) {
        resourceType = 'video';
      } else {
        resourceType = 'image'; // Default to image
      }
    }
    
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const publicId = `pikxora/${folder}/${prefix}-${uniqueSuffix}`;
    
    // Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      `data:${mimeType};base64,${base64String}`,
      {
        public_id: publicId,
        resource_type: resourceType,
        folder: `pikxora/${folder}`,
        overwrite: false,
        transformation: resourceType === 'image' ? [
          { quality: 'auto' },
          { fetch_format: 'auto' }
        ] : undefined,
      }
    );
    
    return {
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      url: uploadResult.secure_url, // Alias for backward compatibility
      resource_type: uploadResult.resource_type
    };
  } catch (error) {
    console.error('Error uploading to Cloudinary:', error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
}

/**
 * Deletes a file from Cloudinary using public_id
 * @param {string} publicId - Cloudinary public_id
 * @param {string} resourceType - 'image' or 'video' (default: 'auto')
 * @returns {Promise<Object>} - Cloudinary deletion result
 */
export async function deleteFromCloudinary(publicId, resourceType = 'auto') {
  // Check if Cloudinary is configured before attempting deletion
  requireCloudinary();
  
  try {
    if (!publicId) {
      throw new Error('Public ID is required');
    }
    
    // If public_id includes the full path, extract just the public_id
    // Cloudinary public_id format: pikxora/folder/filename
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType === 'auto' ? undefined : resourceType,
      invalidate: true // Invalidate CDN cache
    });
    
    return result;
  } catch (error) {
    console.error('Error deleting from Cloudinary:', error);
    throw new Error(`Failed to delete from Cloudinary: ${error.message}`);
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
 * Checks if a string is a base64 video data URI
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isBase64Video(str) {
  if (!str || typeof str !== 'string') return false;
  return str.startsWith('data:video/') && str.includes('base64,');
}

/**
 * Checks if a string is a Cloudinary URL
 * @param {string} str - String to check
 * @returns {boolean}
 */
export function isCloudinaryUrl(str) {
  if (!str || typeof str !== 'string') return false;
  return str.includes('cloudinary.com') || str.includes('res.cloudinary.com');
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

/**
 * Extracts public_id from a Cloudinary URL
 * @param {string} cloudinaryUrl - Full Cloudinary URL
 * @returns {string|null} - Public ID or null if not a Cloudinary URL
 */
export function extractPublicIdFromUrl(cloudinaryUrl) {
  if (!isCloudinaryUrl(cloudinaryUrl)) {
    return null;
  }
  
  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{transformations}/{public_id}.{format}
    const urlParts = cloudinaryUrl.split('/upload/');
    if (urlParts.length < 2) {
      return null;
    }
    
    const afterUpload = urlParts[1];
    // Remove transformations if present (format: v{number}/ or {width}x{height}/)
    const parts = afterUpload.split('/');
    const lastPart = parts[parts.length - 1];
    
    // Remove file extension
    const publicId = lastPart.replace(/\.[^.]+$/, '');
    
    // Reconstruct full public_id with folder path if transformations were present
    if (parts.length > 1) {
      // Check if there are folder parts before the filename
      const folderParts = parts.slice(0, -1);
      // Filter out transformation parts (they're usually just numbers or have 'x' in them)
      const actualFolders = folderParts.filter(part => !/^v\d+$/.test(part) && !/^\d+x\d+$/.test(part));
      if (actualFolders.length > 0) {
        return actualFolders.join('/') + '/' + publicId;
      }
    }
    
    return publicId;
  } catch (error) {
    console.error('Error extracting public_id from URL:', error);
    return null;
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
 * Legacy function name for backward compatibility
 * Now uploads to Cloudinary instead of saving locally
 * @deprecated Use uploadBase64ToCloudinary instead
 */
export async function saveBase64Image(base64Data, folder = 'wall-assets', prefix = 'image') {
  const result = await uploadBase64ToCloudinary(base64Data, folder, prefix, 'image');
  return result.secure_url;
}
