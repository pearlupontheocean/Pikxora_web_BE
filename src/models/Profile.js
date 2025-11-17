import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  verification_status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rating: {
    type: Number,
    min: 1,
    max: 5
  },
  location: String,
  bio: String,
  avatar_url: String,
  associations: [String],
  social_links: {
    twitter: String,
    linkedin: String,
    instagram: String,
    website: String
  },
  brand_colors: {
    primary: String,
    secondary: String
  }
}, {
  timestamps: true
});

// Add indexes for faster queries
profileSchema.index({ user_id: 1 }); // Already unique, but explicit index helps
profileSchema.index({ verification_status: 1 }); // Index for pending/approved queries
profileSchema.index({ email: 1 }); // Index for email lookups

const Profile = mongoose.model('Profile', profileSchema);
export default Profile;
