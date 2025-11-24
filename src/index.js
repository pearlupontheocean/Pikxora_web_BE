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

// CORS Middleware - Handle preflight requests properly
// Note: When credentials: true, you cannot use origin: '*'
// Must specify exact origins or use a function
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      // Add your production frontend URL here
      'https://pikxora-web-fe.vercel.app'
    ];
    
    // Check if origin is in allowed list or if we're in development
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      // For production, check environment variable for additional origins
      const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
      if (envOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        // For now, allow all origins to debug CORS issues
        // TODO: Restrict this in production
        callback(null, true);
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Type', 'Authorization'],
  preflightContinue: false,
  optionsSuccessStatus: 204,
  maxAge: 86400 // Cache preflight requests for 24 hours
};

app.use(cors(corsOptions));

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
