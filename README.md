# Pixora Connect Backend Server

Express.js + MongoDB backend for Pixora Connect.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
Create a `.env` file in the server directory:
```env
MONGODB_URI=mongodb://localhost:27017/pixora-connect
JWT_SECRET=your-secret-key-here
PORT=5000
NODE_ENV=development
```

### 3. Start MongoDB
```bash
# Start MongoDB locally
mongod

# Or use MongoDB Atlas connection string
```

### 4. Run the Server
```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

Server will start on http://localhost:5000

## Project Structure

```
server/
├── src/
│   ├── config/
│   │   └── database.js       # MongoDB connection
│   ├── models/               # Mongoose models
│   │   ├── User.js
│   │   ├── Profile.js
│   │   ├── Wall.js
│   │   ├── Project.js
│   │   └── TeamMember.js
│   ├── middleware/
│   │   ├── auth.js           # JWT authentication
│   │   └── upload.js         # File upload with Multer
│   ├── routes/
│   │   ├── auth.js           # Authentication endpoints
│   │   ├── profiles.js       # Profile management
│   │   ├── walls.js          # Wall CRUD
│   │   ├── projects.js       # Project operations
│   │   └── upload.js         # File upload endpoint
│   └── index.js              # Express server
├── uploads/                  # File storage
└── .env                      # Environment variables
```

## API Endpoints

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/signin` - Login user
- `GET /api/auth/me` - Get current user

### Profiles
- `GET /api/profiles/me` - Get current user's profile
- `PUT /api/profiles/me` - Update current user's profile
- `GET /api/profiles/pending` - Get pending verifications (admin only)
- `PUT /api/profiles/:id/verify` - Verify profile (admin only)

### Walls
- `GET /api/walls` - Get all published walls
- `GET /api/walls/my` - Get current user's walls
- `GET /api/walls/:id` - Get wall by ID
- `POST /api/walls` - Create new wall
- `PUT /api/walls/:id` - Update wall
- `DELETE /api/walls/:id` - Delete wall

### Projects
- `GET /api/projects/wall/:wallId` - Get projects for a wall
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project

### Upload
- `POST /api/upload` - Upload file

## Database Models

### User
- `_id` (ObjectId)
- `email` (String, unique)
- `password` (String, hashed)
- `roles` (Array of Strings)

### Profile
- `_id` (ObjectId)
- `user_id` (ObjectId, ref: User)
- `email`, `name`, `verification_status`, `rating`, etc.

### Wall
- `_id` (ObjectId)
- `user_id` (ObjectId, ref: Profile)
- `title`, `description`, `published`, `view_count`, etc.

### Project
- `_id` (ObjectId)
- `wall_id` (ObjectId, ref: Wall)
- `title`, `description`, `media_url`, etc.

### TeamMember
- `_id` (ObjectId)
- `studio_wall_id` (ObjectId, ref: Wall)
- `artist_id` (ObjectId, ref: Profile)
- `role` (String)

## Authentication

All protected routes use JWT authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your-token>
```

## File Uploads

Files are uploaded to the `uploads/` directory and served statically at `/uploads`.

Supported folders:
- `profiles/` - Profile images
- `walls/` - Wall images
- `projects/` - Project media
- `logos/` - Studio logos
- `hero/` - Hero images
- `showreels/` - Showreel videos

## Development

The server uses Nodemon for auto-reload during development. Any changes to files in `src/` will automatically restart the server.

## Troubleshooting

**MongoDB Connection Error:**
- Make sure MongoDB is running: `mongod`
- Check the connection string in `.env`
- Verify MongoDB URI is correct

**Port Already in Use:**
- Change the PORT in `.env`
- Or kill the process using port 5000

**File Upload Not Working:**
- Ensure `uploads/` directory exists
- Check file permissions
- Verify Multer configuration

## Production Deployment

1. Set `NODE_ENV=production` in `.env`
2. Use MongoDB Atlas for database
3. Configure proper CORS settings
4. Use a reverse proxy (Nginx)
5. Set up process manager (PM2)
6. Configure SSL/HTTPS
