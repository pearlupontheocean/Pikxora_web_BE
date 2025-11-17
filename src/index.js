import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import wallRoutes from './routes/walls.js';
import projectRoutes from './routes/projects.js';
import teamRoutes from './routes/team.js';
import uploadRoutes from './routes/upload.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Connect to MongoDB
connectDB();

// Performance Middleware
// Compression middleware - compress all responses
app.use(compression({
  level: 6, // Compression level (0-9, 6 is a good balance)
  threshold: 1024, // Only compress responses larger than 1KB
  filter: (req, res) => {
    // Don't compress if client doesn't support it
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Response time logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = duration > 1000 ? '⚠️' : duration > 500 ? '⚡' : '✅';
    console.log(`${logLevel} ${req.method} ${req.path} - ${duration}ms`);
  });
  next();
});

// CORS Middleware
app.use(cors({
  origin: '*', // Allow all origins (use specific origin in production)
  credentials: true
}));

// Body parsing middleware
// Increase payload size limit to handle base64 images (50MB file = ~67MB in base64)
app.use(express.json({ 
  limit: '70mb',
  // Use faster JSON parser
  strict: false
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '70mb',
  parameterLimit: 50000 // Increase parameter limit
}));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/walls', wallRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/upload', uploadRoutes);

// Export app for Vercel serverless functions
export default app;

// Only start server if not in Vercel environment
const PORT = process.env.PORT || 5001;

// Vercel provides PORT automatically, but we check if we're in a serverless environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}
