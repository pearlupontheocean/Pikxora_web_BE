# CORS Error Fix

## Problem
You were getting this error:
```
Access to XMLHttpRequest at 'http://pikxora-web-be.vercel.app/api/auth/signin' from origin 'http://localhost:8080' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: Redirect is not allowed for a preflight request.
```

## Root Causes

### 1. CORS Configuration Issue
- **Problem**: Using `origin: '*'` with `credentials: true` is not allowed by CORS specification
- **Fix**: Changed to use a function that explicitly allows specific origins

### 2. Redirect Issue (HTTP → HTTPS)
- **Problem**: Your frontend is making requests to `http://pikxora-web-be.vercel.app` (HTTP)
- **Issue**: Vercel automatically redirects HTTP to HTTPS, but browsers **cannot follow redirects for preflight OPTIONS requests**
- **Solution**: **Always use HTTPS** in your frontend API calls

## Fixes Applied

### 1. Updated CORS Configuration
- Changed from `origin: '*'` to a function that allows specific origins
- Added proper handling for localhost development
- Configured all necessary CORS headers and methods
- Added `maxAge` to cache preflight requests

### 2. Frontend Fix Required
**IMPORTANT**: Update your frontend to use HTTPS:

```javascript
// ❌ WRONG - Using HTTP
const API_URL = 'http://pikxora-web-be.vercel.app';

// ✅ CORRECT - Using HTTPS
const API_URL = 'https://pikxora-web-be.vercel.app';
```

## Next Steps

1. **Update your frontend API base URL to use HTTPS**
   - Change from `http://pikxora-web-be.vercel.app` to `https://pikxora-web-be.vercel.app`
   - This is the most important fix!

2. **Deploy the updated backend code**
   ```bash
   git add BE/src/index.js
   git commit -m "Fix CORS configuration for preflight requests"
   git push origin main
   ```
   Vercel will automatically redeploy.

3. **Test the API**
   - Make sure your frontend uses HTTPS
   - Test the signin endpoint again
   - Check browser console for any remaining CORS errors

## Testing

After deploying, test with:

```bash
# Test OPTIONS preflight request
curl -X OPTIONS https://pikxora-web-be.vercel.app/api/auth/signin \
  -H "Origin: http://localhost:8080" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v

# Should return 204 with proper CORS headers
```

## Production Considerations

For production, you should:

1. **Restrict CORS origins** - Update the `allowedOrigins` array in `src/index.js` to only include your production frontend URL
2. **Set environment variable** - Add `ALLOWED_ORIGINS` in Vercel with your production frontend URL
3. **Remove the "allow all" fallback** - Currently allowing all origins for debugging, remove this in production

Example production configuration:
```javascript
const allowedOrigins = [
  'https://your-production-frontend.com',
  'https://www.your-production-frontend.com'
];
```

## Additional Notes

- The CORS middleware is now placed before body parsing middleware (correct order)
- Preflight requests are handled automatically by the `cors` package
- The configuration allows credentials, which is necessary for JWT tokens in cookies if you use them


