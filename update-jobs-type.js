/**
 * Migration script to add job_type field to existing jobs
 * Run this once to update all existing jobs in the database
 * 
 * Usage: node update-jobs-type.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from the project root (BE directory)
dotenv.config({ path: path.resolve(__dirname, '.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function updateJobs() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const jobsCollection = db.collection('jobs');

    // Count jobs without job_type
    const countWithoutType = await jobsCollection.countDocuments({ job_type: { $exists: false } });
    console.log(`Found ${countWithoutType} jobs without job_type field`);

    if (countWithoutType === 0) {
      console.log('All jobs already have job_type field. No updates needed.');
      await mongoose.disconnect();
      return;
    }

    // Update all jobs without job_type to have job_type: 'freelance'
    // (since they have VFX specs like total_shots, min_budget, etc.)
    const result = await jobsCollection.updateMany(
      { job_type: { $exists: false } },
      { $set: { job_type: 'freelance' } }
    );

    console.log(`Updated ${result.modifiedCount} jobs to have job_type: 'freelance'`);

    // Verify the update
    const remainingWithoutType = await jobsCollection.countDocuments({ job_type: { $exists: false } });
    console.log(`Remaining jobs without job_type: ${remainingWithoutType}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    console.log('Migration complete!');
  } catch (error) {
    console.error('Error updating jobs:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

updateJobs();

