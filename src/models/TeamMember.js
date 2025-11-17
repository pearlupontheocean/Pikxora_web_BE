import mongoose from 'mongoose';

const teamMemberSchema = new mongoose.Schema({
  wall_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Wall',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  bio: String,
  avatar_url: String,
  skills: [String],
  experience_years: Number,
  email: String,
  social_links: {
    linkedin: String,
    twitter: String,
    instagram: String,
    website: String,
    portfolio: String
  },
  order_index: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

teamMemberSchema.index({ wall_id: 1 });

const TeamMember = mongoose.model('TeamMember', teamMemberSchema);

// Drop old indexes from previous schema versions (run once on server start)
let indexesDropped = false;
const dropOldIndexes = async () => {
  if (indexesDropped) return;
  indexesDropped = true;
  
  try {
    const indexes = await TeamMember.collection.indexes();
    
    // Find and drop old indexes
    for (const index of indexes) {
      const indexKeys = Object.keys(index.key || {});
      
      // Drop indexes that reference old fields
      if (indexKeys.includes('studio_wall_id') || indexKeys.includes('artist_id')) {
        try {
          await TeamMember.collection.dropIndex(index.name);
        } catch (err) {
          // Index might not exist, ignore
          if (err.code !== 27 && err.code !== 26) {
            console.error(`Error dropping index ${index.name}:`, err);
          }
        }
      }
    }
    
    // Ensure the correct index exists
    try {
      await TeamMember.collection.createIndex({ wall_id: 1 });
    } catch (err) {
      // Index might already exist, ignore
      if (err.code !== 85) {
        console.error('Error creating TeamMember index:', err);
      }
    }
  } catch (err) {
    console.error('Error managing TeamMember indexes:', err);
  }
};

// Run when model is first loaded (after connection is established)
if (mongoose.connection.readyState === 1) {
  dropOldIndexes();
} else {
  mongoose.connection.once('connected', () => {
    dropOldIndexes();
  });
}

export default TeamMember;
