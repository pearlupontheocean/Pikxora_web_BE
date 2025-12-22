import express from 'express';
import cors from 'cors';
import compression from 'compression';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import http from 'http'; // Import http module
import { Server } from 'socket.io'; // Import Socket.IO Server
import connectDB from './config/database.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profiles.js';
import wallRoutes from './routes/walls.js';
import projectRoutes from './routes/projects.js';
import teamRoutes from './routes/team.js';
import uploadRoutes from './routes/upload.js';
import movieRoutes from './routes/movies.js';
import jobRoutes from './routes/jobs.js';
import bidRoutes from './routes/bids.js';
import contractRoutes from './routes/contracts.js';
import deliverableRoutes from './routes/deliverables.js';
import reviewRoutes from './routes/reviews.js';
import associationRoutes from './routes/associations.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const server = http.createServer(app); // Create HTTP server
export const io = new Server(server, { // Initialize Socket.IO and export it
  cors: {
    origin: [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://pikxora-web-fe.vercel.app'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('register', (userId) => {
    socket.join(userId); // Join a room named after the user's ID
    console.log(`User ${userId} registered for real-time updates`);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected:', socket.id);
  });
});

// Connect to MongoDB
connectDB();

// Performance Middleware
app.use(compression({
  level: 6,
  threshold: 1024,
  filter: (req, res) => {
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
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://pikxora-web-fe.vercel.app'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      const envOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];
      if (envOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
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
  maxAge: 86400
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ 
  limit: '70mb',
  strict: false
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '70mb',
  parameterLimit: 50000
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/profiles', profileRoutes);
app.use('/api/walls', wallRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/bids', bidRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/deliverables', deliverableRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/associations', associationRoutes); // Pass router directly

// Set io instance on app for route handlers to access
app.set('io', io);

// Export app for Vercel serverless functions
export default app;

const PORT = process.env.PORT || 5001;

if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
} else {
  // For Vercel, export a handler for serverless function
  // This might require a different approach for real-time, e.g., external WebSocket service
  // For now, Socket.IO functionality will be limited in Vercel's serverless environment.
  // Consider a dedicated Vercel deployment with a custom server if full WebSocket support is needed.
  console.log("Serverless environment detected. Socket.IO will not run as a persistent server.");
}
