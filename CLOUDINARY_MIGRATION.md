# Cloudinary Migration Complete

This document outlines the migration from local file storage to Cloudinary.

## Changes Made

### 1. **New Dependencies**
- `cloudinary` - Cloudinary SDK
- `multer-storage-cloudinary` - Multer storage adapter for Cloudinary

### 2. **New Configuration**
- **`src/config/cloudinary.js`** - Cloudinary configuration and storage setup
  - Configures Cloudinary with environment variables
  - Creates CloudinaryStorage for multer
  - Organizes uploads into folders: `pikxora/{folder}`

### 3. **Updated Middleware**
- **`src/middleware/upload.js`** - Replaced `multer.diskStorage` with Cloudinary storage
  - Files now upload directly to Cloudinary
  - No local file system operations

### 4. **Updated Utilities**
- **`src/utils/imageUtils.js`** - Complete rewrite
  - `uploadBase64ToCloudinary()` - Uploads base64 images/videos to Cloudinary
  - `deleteFromCloudinary()` - Deletes files from Cloudinary using public_id
  - `extractPublicIdFromUrl()` - Extracts public_id from Cloudinary URLs
  - `isCloudinaryUrl()` - Checks if a string is a Cloudinary URL
  - Removed all local file system operations (`fs`, `path.join`, etc.)

### 5. **Updated Routes**

#### **Upload Route** (`src/routes/upload.js`)
- Returns `secure_url` and `public_id` from Cloudinary
- No longer returns local file paths

#### **Walls Route** (`src/routes/walls.js`)
- Uploads base64 images/videos to Cloudinary on create/update
- Stores Cloudinary `secure_url` in database
- Deletes old files from Cloudinary when replaced or wall is deleted
- Removed all `/uploads/` path conversion logic

#### **Team Route** (`src/routes/team.js`)
- Uploads avatar images to Cloudinary
- Deletes old avatars when replaced or team member is deleted

#### **Projects Route** (`src/routes/projects.js`)
- Uploads media files to Cloudinary
- Handles both images and videos
- Deletes old media when replaced or project is deleted

### 6. **Removed Features**
- Static file serving (`app.use('/uploads', ...)`) removed from `index.js`
- All local file path logic (`/uploads/...`)
- Base64 storage in MongoDB (now stores Cloudinary URLs)
- File system operations (`fs`, directory creation, etc.)

## Environment Variables

Add these to your `.env` file:

```env
# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

### Getting Cloudinary Credentials

1. Sign up at https://cloudinary.com
2. Go to Dashboard: https://cloudinary.com/console
3. Copy your:
   - Cloud Name
   - API Key
   - API Secret

## Database Schema

The database now stores:
- **`secure_url`** - Full Cloudinary URL (HTTPS)
- **`public_id`** - Can be extracted from URL when needed for deletion

Models remain unchanged - they still use `String` fields for URLs, but now store Cloudinary URLs instead of local paths or base64.

## File Organization in Cloudinary

Files are organized in Cloudinary folders:
- `pikxora/logos/` - Studio logos
- `pikxora/hero/` - Hero images/videos
- `pikxora/showreels/` - Showreel videos
- `pikxora/wall-assets/` - Wall assets
- `pikxora/avatars/` - Team member avatars
- `pikxora/projects/` - Project media
- `pikxora/general/` - General uploads

## API Changes

### Upload Endpoint (`POST /api/upload`)
**Before:**
```json
{
  "url": "/uploads/folder/filename.jpg"
}
```

**After:**
```json
{
  "url": "https://res.cloudinary.com/...",
  "secure_url": "https://res.cloudinary.com/...",
  "public_id": "pikxora/folder/filename",
  "resource_type": "image"
}
```

### Wall/Project/Team Endpoints
- Accept base64 images/videos (uploaded to Cloudinary)
- Accept existing Cloudinary URLs (stored as-is)
- Return Cloudinary URLs in responses
- Automatically delete old files when replaced

## Migration Notes

### Existing Data
If you have existing data with:
- `/uploads/` paths - These will need to be migrated manually or handled gracefully
- Base64 strings in database - These can remain, but new uploads will use Cloudinary

### Backward Compatibility
The code no longer handles `/uploads/` paths. If you have existing data:
1. Migrate existing files to Cloudinary
2. Update database records with Cloudinary URLs
3. Or add migration logic to handle old paths

## Benefits

1. **Scalability** - No local storage limits
2. **CDN** - Cloudinary provides global CDN
3. **Image Optimization** - Automatic optimization and transformations
4. **Video Support** - Built-in video processing
5. **No Server Storage** - Reduces server disk usage
6. **Automatic Cleanup** - Files deleted when records are deleted

## Testing

1. Set up Cloudinary credentials in `.env`
2. Test file upload via `POST /api/upload`
3. Test wall creation with base64 images
4. Test file deletion when updating/replacing files
5. Verify files appear in Cloudinary dashboard

## Troubleshooting

**Upload fails:**
- Check Cloudinary credentials in `.env`
- Verify Cloudinary account is active
- Check file size limits (50MB default)

**Files not deleting:**
- Verify `public_id` extraction is working
- Check Cloudinary API permissions
- Review error logs for Cloudinary API errors

**Old files still in database:**
- Run migration script to update old paths
- Or handle old paths gracefully in frontend

