# Cloudinary Setup Guide

## Quick Setup

1. **Sign up for Cloudinary** (if you don't have an account)
   - Go to https://cloudinary.com/users/register/free
   - Create a free account (includes 25GB storage and 25GB bandwidth)

2. **Get Your Credentials**
   - Log in to https://cloudinary.com/console
   - On the Dashboard, you'll see:
     - **Cloud Name** (e.g., `dxyz123abc`)
     - **API Key** (e.g., `123456789012345`)
     - **API Secret** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

3. **Update Your .env File**
   
   Open `Pikxora_web_BE/.env` and replace the placeholder values:

   ```env
   # Cloudinary Configuration
   CLOUDINARY_CLOUD_NAME=your-actual-cloud-name-here
   CLOUDINARY_API_KEY=your-actual-api-key-here
   CLOUDINARY_API_SECRET=your-actual-api-secret-here
   ```

   **Example:**
   ```env
   CLOUDINARY_CLOUD_NAME=dxyz123abc
   CLOUDINARY_API_KEY=123456789012345
   CLOUDINARY_API_SECRET=abcdefghijklmnopqrstuvwxyz123456
   ```

4. **Restart Your Server**
   - Stop the server (Ctrl+C)
   - Start it again: `npm run dev`

## Verification

After setting up, you should see:
```
✅ Cloudinary configured successfully
```

If you see an error, check:
- Credentials are correct (no extra spaces)
- .env file is in the `Pikxora_web_BE` directory
- Server was restarted after updating .env

## Security Note

⚠️ **Never commit your `.env` file to Git!** It should already be in `.gitignore`.

## Free Tier Limits

- 25GB storage
- 25GB bandwidth/month
- 25,000 transformations/month

This is usually enough for development and small projects.

## Troubleshooting

**Error: "Invalid api_key"**
- Double-check your API Key in Cloudinary dashboard
- Make sure there are no extra spaces in .env file
- Restart the server after updating .env

**Error: "Cloudinary credentials not configured"**
- Make sure .env file exists in `Pikxora_web_BE` directory
- Check that variable names match exactly (case-sensitive)
- Verify values are not the placeholder values

**Files not uploading**
- Check Cloudinary dashboard for upload errors
- Verify your account is active
- Check file size limits (50MB default in code)

