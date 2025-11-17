// Script to manually drop old TeamMember indexes
// Run with: node drop-old-indexes.js

import mongoose from 'mongoose';
import TeamMember from './src/models/TeamMember.js';
import dotenv from 'dotenv';

dotenv.config();

const dropOldIndexes = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pixora-connect');
    console.log('Connected to MongoDB');

    // Get all indexes
    const indexes = await TeamMember.collection.indexes();
    console.log('Current indexes:', indexes.map(i => ({ name: i.name, key: i.key })));

    // Drop indexes that reference old fields
    for (const index of indexes) {
      const indexKeys = Object.keys(index.key || {});
      
      if (indexKeys.includes('studio_wall_id') || indexKeys.includes('artist_id')) {
        try {
          await TeamMember.collection.dropIndex(index.name);
          console.log(`✅ Dropped old index: ${index.name}`);
        } catch (err) {
          console.error(`❌ Error dropping index ${index.name}:`, err.message);
        }
      }
    }

    // Ensure the correct index exists
    try {
      await TeamMember.collection.createIndex({ wall_id: 1 });
      console.log('✅ Created correct index on wall_id');
    } catch (err) {
      if (err.code === 85) {
        console.log('✅ Index on wall_id already exists');
      } else {
        console.error('❌ Error creating index:', err.message);
      }
    }

    console.log('\n✅ Done! Old indexes have been removed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

dropOldIndexes();

