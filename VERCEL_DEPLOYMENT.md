# Vercel Deployment Guide for Pixora Connect Backend

## Prerequisites
- GitHub account with the BE repository pushed
- Vercel account (sign up at https://vercel.com)
- MongoDB Atlas account (or your MongoDB connection string)

## Step-by-Step Deployment Process

### Step 1: Prepare Your Repository
✅ Your code is already pushed to GitHub at: `https://github.com/pearlupontheocean/PIkxora_web_BE.git`

### Step 2: Sign Up / Login to Vercel
1. Go to https://vercel.com
2. Click "Sign Up" or "Log In"
3. Choose "Continue with GitHub" to connect your GitHub account
4. Authorize Vercel to access your GitHub repositories

### Step 3: Import Your Project
1. After logging in, click the **"Add New..."** button
2. Select **"Project"**
3. You'll see a list of your GitHub repositories
4. Find and click **"PIkxora_web_BE"** (or search for it)
5. Click **"Import"**

### Step 4: Configure Project Settings
Vercel should auto-detect your settings, but verify:

- **Framework Preset**: Leave as default (or select "Other")
- **Root Directory**: Set to `BE` (important!)
- **Build Command**: Leave empty (no build needed)
- **Output Directory**: Leave empty
- **Install Command**: `npm install`

### Step 5: Set Environment Variables
Before deploying, add your environment variables:

1. In the project configuration page, scroll down to **"Environment Variables"**
2. Click **"Add"** and add each of the following:

   | Name | Value | Description |
   |------|-------|-------------|
   | `MONGODB_URI` | `your-mongodb-connection-string` | Your MongoDB Atlas connection string |
   | `JWT_SECRET` | `your-secret-key-here` | A random secret string for JWT tokens (use a strong random string) |
   | `NODE_ENV` | `production` | Set to production |
   | `PORT` | (leave empty) | Vercel will set this automatically |

3. **Important**: 
   - For `MONGODB_URI`: Get this from MongoDB Atlas → Connect → Connect your application
   - For `JWT_SECRET`: Generate a strong random string (you can use: `openssl rand -base64 32` in terminal)
   - Make sure to add these for **Production**, **Preview**, and **Development** environments

### Step 6: Deploy
1. Click the **"Deploy"** button
2. Wait for the deployment to complete (usually 1-3 minutes)
3. You'll see a success message with your deployment URL

### Step 7: Test Your Deployment
1. Your API will be available at: `https://your-project-name.vercel.app`
2. Test an endpoint: `https://your-project-name.vercel.app/api/auth/test`
3. Check the deployment logs in Vercel dashboard if there are any issues

### Step 8: Update CORS (If Needed)
If your frontend is on a different domain, update the CORS origin in `src/index.js`:

```javascript
app.use(cors({
  origin: 'https://your-frontend-domain.com', // Replace with your frontend URL
  credentials: true
}));
```

## Important Notes

### ⚠️ File Uploads Limitation
- Vercel is serverless and doesn't support persistent file storage
- The `/uploads` directory won't persist between deployments
- **Solution Options**:
  1. Use cloud storage (AWS S3, Cloudinary, etc.)
  2. Store files in MongoDB GridFS
  3. Use a separate file storage service

### 🔄 Automatic Deployments
- Vercel automatically deploys when you push to the `main` branch
- Each push creates a new deployment
- You can preview deployments from other branches

### 📊 Monitoring
- Check deployment logs in the Vercel dashboard
- Monitor function execution time and errors
- Set up alerts for failed deployments

### 🔐 Security Best Practices
1. Never commit `.env` files to Git
2. Use strong, random JWT secrets
3. Restrict CORS to your frontend domain in production
4. Use MongoDB Atlas IP whitelist for extra security

## Troubleshooting

### Common Issues:

1. **"Module not found" errors**
   - Ensure `package.json` is in the BE folder
   - Check that all dependencies are listed

2. **"MongoDB connection failed"**
   - Verify `MONGODB_URI` is set correctly
   - Check MongoDB Atlas network access (allow all IPs or add Vercel IPs)
   - Ensure your MongoDB cluster is running

3. **"Function timeout"**
   - Vercel has a 10-second timeout for free tier
   - Optimize database queries
   - Consider upgrading to Pro plan for longer timeouts

4. **"Build failed"**
   - Check that Root Directory is set to `BE`
   - Verify `vercel.json` is correct
   - Check deployment logs for specific errors

## Next Steps After Deployment

1. Update your frontend API base URL to point to your Vercel deployment
2. Test all API endpoints
3. Set up custom domain (optional, in Vercel project settings)
4. Configure environment-specific settings if needed

## Support
- Vercel Docs: https://vercel.com/docs
- Vercel Discord: https://vercel.com/discord

