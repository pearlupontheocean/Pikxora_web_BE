import express from 'express';
import Job from '../models/Job.js';
import Bid from '../models/Bid.js';
import Contract from '../models/Contract.js';
import Movie from '../models/Movie.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Status transition validation helper
const canTransition = (currentStatus, newStatus) => {
  const allowedTransitions = {
    'draft': ['open', 'cancelled'],
    'open': ['under_review', 'cancelled'],
    'under_review': ['awarded', 'open', 'cancelled'],
    'awarded': ['in_progress', 'cancelled'],
    'in_progress': ['completed', 'cancelled'],
    'completed': [], // Terminal state
    'cancelled': []  // Terminal state
  };

  return allowedTransitions[currentStatus]?.includes(newStatus) || false;
};

// @route   POST /api/jobs
// @desc    Create a new job
// @access  Private (studio, admin)
router.post('/', protect, async (req, res) => {
  try {
    const {
      title,
      description,
      movie_id,
      job_type,
      package_per_year,
      assignment_mode,
      assigned_to,
      payment_type,
      currency,
      min_budget,
      max_budget,
      hourly_rate,
      estimated_hours,
      total_shots,
      total_frames,
      resolution,
      frame_rate,
      shot_breakdown,
      required_skills,
      software_preferences,
      deliverables,
      bid_deadline,
      expected_start_date,
      final_delivery_date,
      notes_for_bidders
    } = req.body;

    // Check permissions
    if (!req.user.roles.includes('studio') && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Only studios and admins can create jobs' });
    }

    // Validate job type specific requirements
    let finalAssignmentMode = assignment_mode;
    let finalAssignedTo = assigned_to;
    
    if (job_type === 'job') {
      // Studio jobs: require package_per_year only, no budget/payment, no VFX specs, no schedule
      if (!package_per_year) {
        return res.status(400).json({ error: 'Package per year is required for studio jobs' });
      }
      // Studio jobs are always open for bidding (no assignment_mode needed)
      finalAssignmentMode = 'open';
      finalAssignedTo = [];
    } else if (job_type === 'freelance') {
      // Freelance jobs: require assignment_mode, payment_type, final_delivery_date
      if (!assignment_mode) {
        return res.status(400).json({ error: 'Assignment mode is required for freelance jobs' });
      }
      if (!payment_type) {
        return res.status(400).json({ error: 'Payment type is required for freelance jobs' });
      }
      if (!final_delivery_date) {
        return res.status(400).json({ error: 'Final delivery date is required for freelance jobs' });
      }
      finalAssignmentMode = assignment_mode;
      if (assignment_mode === 'direct' && (!assigned_to || (Array.isArray(assigned_to) && assigned_to.length === 0))) {
        return res.status(400).json({ error: 'At least one assigned_to user is required for direct assignment' });
      }
      if (assignment_mode === 'open' && !bid_deadline) {
        return res.status(400).json({ error: 'Bid deadline is required for open bidding' });
      }
      finalAssignedTo = assignment_mode === 'direct' ? (Array.isArray(assigned_to) ? assigned_to : [assigned_to]) : [];
    }

    // Validate movie exists if provided
    if (movie_id) {
      const movie = await Movie.findOne({ _id: movie_id, created_by: req.user.id });
      if (!movie) {
        return res.status(400).json({ error: 'Movie not found or access denied' });
      }
    }

    const job = new Job({
      title,
      description,
      movie_id,
      job_type: job_type || 'job',
      package_per_year: job_type === 'job' ? package_per_year : undefined,
      assignment_mode: finalAssignmentMode,
      assigned_to: finalAssignedTo,
      payment_type: job_type === 'job' ? undefined : payment_type,
      currency: currency || 'INR',
      min_budget: job_type === 'job' ? undefined : min_budget,
      max_budget: job_type === 'job' ? undefined : max_budget,
      hourly_rate: job_type === 'job' ? undefined : hourly_rate,
      estimated_hours: job_type === 'job' ? undefined : estimated_hours,
      total_shots: job_type === 'job' ? undefined : total_shots,
      total_frames: job_type === 'job' ? undefined : total_frames,
      resolution: job_type === 'job' ? undefined : resolution,
      frame_rate: job_type === 'job' ? undefined : frame_rate,
      shot_breakdown: job_type === 'job' ? undefined : shot_breakdown,
      required_skills: required_skills || [],
      software_preferences: software_preferences || [],
      deliverables: deliverables || [],
      bid_deadline: job_type === 'job' ? undefined : (bid_deadline ? new Date(bid_deadline) : undefined),
      expected_start_date: job_type === 'job' ? undefined : (expected_start_date ? new Date(expected_start_date) : undefined),
      final_delivery_date: job_type === 'job' ? undefined : (final_delivery_date ? new Date(final_delivery_date) : undefined),
      notes_for_bidders: job_type === 'job' ? undefined : notes_for_bidders,
      status: 'draft',
      created_by: req.user.id
    });

    await job.save();


    await job.populate([
      { path: 'movie_id', select: 'title production_year' },
      { path: 'assigned_to', select: 'email' },
      { path: 'created_by', select: 'email' }
    ]);

    res.status(201).json({
      message: 'Job created successfully',
      job
    });
  } catch (error) {
    console.error('Create job error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    // Return more detailed error for debugging
    res.status(500).json({ 
      error: 'Server error',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   GET /api/jobs
// @desc    Get jobs with filtering
// @access  Private
router.get('/', protect, async (req, res) => {
  try {

    const {
      status,
      job_type,
      assignment_mode,
      payment_type,
      min_budget,
      max_budget,
      skills,
      software,
      movie_id,
      created_by_me,
      assigned_to_me
    } = req.query;


    let query = {};
    let jobTypeFilter = null; // Store job_type filter separately to avoid $or conflicts

    // Filter by job_type
    // Note: Old jobs may not have job_type field - treat them as 'freelance'
    if (job_type) {
      if (job_type === 'freelance') {
        // Include jobs with job_type='freelance' OR jobs without job_type field (legacy)
        jobTypeFilter = { $or: [{ job_type: 'freelance' }, { job_type: { $exists: false } }] };
      } else {
        query.job_type = job_type;
      }
    }

    // Filter by status
    if (status) {
      query.status = status;
    }

    // Filter by assignment mode
    if (assignment_mode) {
      query.assignment_mode = assignment_mode;
    }

    // Filter by payment type
    if (payment_type) {
      query.payment_type = payment_type;
    }

    // Budget range filtering - FIXED: should be within range, not OR
    if (min_budget || max_budget) {
      if (min_budget && max_budget) {
        // Job's budget range should overlap with requested range
        query.$or = [
          { $and: [{ min_budget: { $lte: parseInt(max_budget) } }, { max_budget: { $gte: parseInt(min_budget) } }] },
          { $and: [{ min_budget: { $gte: parseInt(min_budget) } }, { min_budget: { $lte: parseInt(max_budget) } }] }
        ];
      } else if (min_budget) {
        query.max_budget = { $gte: parseInt(min_budget) };
      } else if (max_budget) {
        query.min_budget = { $lte: parseInt(max_budget) };
      }
    }

    // Skills filtering
    if (skills) {
      const skillsArray = skills.split(',').map(s => s.trim());
      query.required_skills = { $in: skillsArray };
    }

    // Software filtering
    if (software) {
      const softwareArray = software.split(',').map(s => s.trim());
      query.software_preferences = { $in: softwareArray };
    }

    // Movie filtering
    if (movie_id) {
      query.movie_id = movie_id;
    }

    // User's own jobs
    if (created_by_me === 'true') {
      query.created_by = req.user.id;
    }

    // Jobs assigned to user (direct assignment)
    if (assigned_to_me === 'true') {
      query.assigned_to = { $in: [req.user.id] }; // Match if user ID is in the array
      query.assignment_mode = 'direct';
    }

    // Access control for non-admin users
    if (!req.user.roles.includes('admin')) {
      // Build the base visibility query
      const baseQuery = { ...query };

      // Clear the original query and rebuild it with access control
      Object.keys(query).forEach(key => delete query[key]);

      // Users can see jobs they created, jobs assigned to them, or open bidding jobs
      // IMPORTANT: Direct assignment jobs are ONLY visible to the creator and assigned users
      
      // If filtering by assigned_to_me, ONLY show jobs assigned to the user (not jobs they created)
      if (assigned_to_me === 'true') {
        query.assigned_to = { $in: [req.user.id] }; // Only jobs assigned to them
        query.assignment_mode = 'direct'; // Must be direct assignment
        // Apply status and job_type filters
        if (baseQuery.status) {
          query.status = baseQuery.status;
        }
        if (baseQuery.job_type) {
          query.job_type = baseQuery.job_type;
        }
      } else if (created_by_me === 'true') {
        // If filtering by created_by_me, show ALL jobs created by user (regardless of status)
        query.created_by = req.user.id;
        // Apply status filter if provided (user wants to filter their own jobs by status)
        if (baseQuery.status) {
          query.status = baseQuery.status;
        }
        // Apply job_type filter if provided
        if (baseQuery.job_type) {
          query.job_type = baseQuery.job_type;
        }
      } else {
        // Normal visibility: jobs they created, jobs assigned to them, or open jobs
        const visibilityConditions = [
          { created_by: req.user.id }, // Jobs they created (regardless of status)
          { assigned_to: { $in: [req.user.id] } } // Jobs assigned to them (check if user ID is in array)
        ];

        // Add open jobs visibility
        // For freelance jobs: must have assignment_mode='open' and status='open'
        // For studio jobs (job_type='job'): just need status='open'
        if (baseQuery.assignment_mode !== 'direct') {
          // Open freelance jobs (bidding)
          visibilityConditions.push({ status: 'open', assignment_mode: 'open', job_type: 'freelance' });
          visibilityConditions.push({ status: 'open', assignment_mode: 'open', job_type: { $exists: false } }); // Legacy jobs
          // Open studio jobs (applications) - just need status='open' and job_type='job'
          visibilityConditions.push({ status: 'open', job_type: 'job' });
        }

        query.$or = visibilityConditions;
        
        // When we have $or conditions, we need to be careful about applying top-level filters
        // because MongoDB requires ALL conditions to match, which would exclude user's own jobs
        // that don't match the filter (e.g., draft jobs when filtering by status='open')
        
        // For assignment_mode: Don't apply top-level filter when we have $or with user's own jobs
        // because user's draft jobs might not have assignment_mode set (studio jobs don't have assignment_mode)
        // Instead, the assignment_mode='open' is already in the $or condition for open bidding jobs
        if (baseQuery.assignment_mode && baseQuery.assignment_mode === 'open') {
          // Don't apply top-level filter - it's already in the $or condition
          // This allows user's own jobs (which may not have assignment_mode='open') to show
        } else if (baseQuery.assignment_mode === 'direct') {
          // For direct assignment, we can apply the filter because assigned jobs are already in $or
          query.assignment_mode = 'direct';
        }
        
        // Apply job_type filter (this is safe because it applies to all conditions in $or)
        if (baseQuery.job_type) {
          query.job_type = baseQuery.job_type;
        }
      }
      if (baseQuery.payment_type) {
        query.payment_type = baseQuery.payment_type;
      }
      if (baseQuery.min_budget || baseQuery.max_budget) {
        query.min_budget = baseQuery.min_budget;
        query.max_budget = baseQuery.max_budget;
      }
      if (baseQuery.required_skills && baseQuery.required_skills.$in) {
        query.required_skills = { $in: baseQuery.required_skills.$in };
      }
      if (baseQuery.software_preferences && baseQuery.software_preferences.$in) {
        query.software_preferences = { $in: baseQuery.software_preferences.$in };
      }
    }

    // Combine jobTypeFilter with query using $and if needed
    let finalQuery = query;
    if (jobTypeFilter) {
      if (query.$or) {
        // If we already have $or in query, wrap both in $and
        finalQuery = { $and: [jobTypeFilter, query] };
      } else {
        // Otherwise, just merge the $or from jobTypeFilter
        finalQuery = { ...query, ...jobTypeFilter };
      }
    }

    const jobs = await Job.find(finalQuery)
      .populate('movie_id', 'title production_year genre')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .sort({ createdAt: -1 })
      .lean();


    res.json(jobs);
  } catch (error) {
    console.error('❌ Get jobs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/jobs/public
// @desc    Get public jobs (open bidding jobs only)
// @access  Public
router.get('/public', async (req, res) => {
  try {
    const {
      status,
      job_type,
      payment_type,
      min_budget,
      max_budget,
      skills,
      software,
      movie_id
    } = req.query;

    let query = {
      status: 'open'
    };

    // Filter by job_type
    // Note: Old jobs may not have job_type field - treat them as 'freelance'
    if (job_type) {
      if (job_type === 'freelance') {
        // Include jobs with job_type='freelance' OR jobs without job_type field (legacy)
        // These also need assignment_mode='open' for bidding
        query.$and = query.$and || [];
        query.$and.push({ $or: [{ job_type: 'freelance' }, { job_type: { $exists: false } }] });
        query.assignment_mode = 'open';
      } else if (job_type === 'job') {
        // Studio jobs - just need status='open' (already set above)
        query.job_type = 'job';
      }
    } else {
      // No job_type filter - show all open jobs
      // Freelance jobs need assignment_mode='open', studio jobs just need status='open'
      query.$or = [
        { job_type: 'job' }, // Studio jobs
        { assignment_mode: 'open', job_type: 'freelance' }, // Freelance jobs
        { assignment_mode: 'open', job_type: { $exists: false } } // Legacy jobs
      ];
    }

    // Filter by payment type
    if (payment_type) {
      query.payment_type = payment_type;
    }

    // Budget range filtering
    if (min_budget || max_budget) {
      if (min_budget && max_budget) {
        query.$or = [
          { $and: [{ min_budget: { $lte: parseInt(max_budget) } }, { max_budget: { $gte: parseInt(min_budget) } }] },
          { $and: [{ min_budget: { $gte: parseInt(min_budget) } }, { min_budget: { $lte: parseInt(max_budget) } }] }
        ];
      } else if (min_budget) {
        query.max_budget = { $gte: parseInt(min_budget) };
      } else if (max_budget) {
        query.min_budget = { $lte: parseInt(max_budget) };
      }
    }

    // Skills filtering
    if (skills) {
      const skillsArray = skills.split(',').map(s => s.trim());
      query.required_skills = { $in: skillsArray };
    }

    // Software filtering
    if (software) {
      const softwareArray = software.split(',').map(s => s.trim());
      query.software_preferences = { $in: softwareArray };
    }

    // Movie filtering
    if (movie_id) {
      query.movie_id = movie_id;
    }

    const jobs = await Job.find(query)
      .populate('movie_id', 'title production_year genre')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(jobs);
  } catch (error) {
    console.error('❌ Get public jobs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/jobs/:id/public
// @desc    Get public job by ID (open bidding jobs only)
// @access  Public
router.get('/:id/public', async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('movie_id', 'title production_year genre poster_url')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only allow access to open bidding jobs
    if (job.status !== 'open' || job.assignment_mode !== 'open') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Increment view count
    await Job.findByIdAndUpdate(req.params.id, { $inc: { view_count: 1 } });

    res.json(job);
  } catch (error) {
    console.error('Get public job error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid job ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/jobs/:id
// @desc    Get job by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.id)
      .populate('movie_id', 'title production_year genre poster_url')
      .populate('created_by', 'email')
      .populate('assigned_to', 'email')
      .lean();

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Check access permissions
    // Check if user is in assigned_to array
    const isAssignedToUser = Array.isArray(job.assigned_to)
      ? job.assigned_to.some(user => user._id.toString() === req.user.id)
      : job.assigned_to?._id?.toString() === req.user.id;

    const hasAccess =
      req.user.roles.includes('admin') ||
      job.created_by._id.toString() === req.user.id ||
      (job.assignment_mode === 'open' && job.status === 'open') ||
      isAssignedToUser ||
      (job.status === 'awarded' && req.user.roles.some(role => ['artist', 'studio'].includes(role)) && (await Bid.exists({ job_id: job._id, bidder_id: req.user.id, status: 'accepted' })));

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Increment view count
    await Job.findByIdAndUpdate(req.params.id, { $inc: { view_count: 1 } });

    res.json(job);
  } catch (error) {
    console.error('Get job error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid job ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update job
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Prevent editing after certain statuses
    if (['awarded', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ error: 'Cannot edit job in current status' });
    }

    const updateFields = [
      'title', 'description', 'movie_id', 'payment_type', 'currency',
      'min_budget', 'max_budget', 'total_shots', 'total_frames',
      'resolution', 'frame_rate', 'shot_breakdown', 'required_skills',
      'software_preferences', 'deliverables', 'bid_deadline',
      'final_delivery_date', 'notes_for_bidders', 'status'
    ];

    const updates = {};
    updateFields.forEach(field => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Special handling for assignment_mode changes
    if (req.body.assignment_mode && req.body.assignment_mode !== job.assignment_mode) {
      if (job.status !== 'draft') {
        return res.status(400).json({ error: 'Cannot change assignment mode after publishing' });
      }
      updates.assignment_mode = req.body.assignment_mode;
      if (req.body.assignment_mode === 'direct') {
        // Ensure assigned_to is an array
        updates.assigned_to = Array.isArray(req.body.assigned_to) ? req.body.assigned_to : [req.body.assigned_to];
      }
    }

    const updatedJob = await Job.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'movie_id', select: 'title production_year' },
      { path: 'assigned_to', select: 'email' },
      { path: 'created_by', select: 'email' }
    ]);

    res.json({
      message: 'Job updated successfully',
      job: updatedJob
    });
  } catch (error) {
    console.error('Update job error:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/jobs/:id/publish
// @desc    Publish job (change status from draft to open)
// @access  Private
router.put('/:id/publish', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.status !== 'draft') {
      return res.status(400).json({ error: 'Job is not in draft status' });
    }

    // Validate required fields for publishing
    // Only freelance jobs with open bidding require bid_deadline
    // Studio jobs (job_type === 'job') don't need bid_deadline
    if (job.job_type !== 'job' && !job.bid_deadline && job.assignment_mode === 'open') {
      return res.status(400).json({ error: 'Bid deadline is required for open bidding freelance jobs' });
    }

    job.status = 'open';
    await job.save();

    res.json({
      message: 'Job published successfully',
      job
    });
  } catch (error) {
    console.error('Publish job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/jobs/:id
// @desc    Update a job (only by creator, only if draft or open)
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    console.log('🔍 PUT /api/jobs/:id - Request body:', JSON.stringify(req.body, null, 2));
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only job creator can edit
    if (job.created_by.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this job' });
    }

    // Can edit jobs in various statuses, but restrict field editing based on status
    const editableStatuses = ['draft', 'open', 'under_review', 'awarded', 'in_progress'];
    if (!editableStatuses.includes(job.status)) {
      return res.status(400).json({ error: 'Cannot edit job in current status' });
    }


    // Update job fields
    const allowedFields = [
      'title', 'description', 'movie_id', 'assignment_mode', 'assigned_to',
      'payment_type', 'currency', 'min_budget', 'max_budget', 'total_shots',
      'total_frames', 'resolution', 'frame_rate', 'shot_breakdown',
      'required_skills', 'software_preferences', 'deliverables',
      'bid_deadline', 'expected_start_date', 'final_delivery_date',
      'notes_for_bidders', 'status'
    ];

    let statusUpdated = false;
    // Update job fields - process each field and assign to job object
    console.log('🔍 Processing field updates:');
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        let processedValue = req.body[field];
        console.log(`  📝 ${field}: ${JSON.stringify(processedValue)}`);

        // Handle empty strings for ObjectId fields
        if (field === 'movie_id' && processedValue === '') {
          processedValue = undefined;
          console.log(`    → Converted empty string to undefined`);
        }
        // Handle assigned_to array
        else if (field === 'assigned_to') {
          if (Array.isArray(processedValue)) {
            // Filter out empty strings and ensure valid ObjectIds
            processedValue = processedValue.filter(id => id && id !== '');
            console.log(`    → Processed assigned_to array: ${processedValue.length} users`);
          } else if (processedValue === '') {
            processedValue = [];
            console.log(`    → Converted empty string to empty array`);
          } else if (processedValue) {
            // Convert single value to array for backward compatibility
            processedValue = [processedValue];
            console.log(`    → Converted single value to array`);
          }
        }
        // Handle date fields
        else if ((field === 'bid_deadline' || field === 'expected_start_date' || field === 'final_delivery_date') && processedValue) {
          processedValue = new Date(processedValue);
          console.log(`    → Converted to Date: ${processedValue}`);
        }
        // Handle shot_breakdown array validation
        else if (field === 'shot_breakdown' && Array.isArray(processedValue)) {
          processedValue = processedValue.filter(shot =>
            shot && typeof shot === 'object' && shot.name && shot.name.trim()
          ).map(shot => ({
            name: shot.name.trim(),
            shot_code: shot.shot_code ? shot.shot_code.trim() : '',
            frame_in: shot.frame_in || 0,
            frame_out: shot.frame_out || 0,
            complexity: shot.complexity || 'medium'
          }));
          console.log(`    → Processed shot_breakdown array`);
        }
        // For all other fields (title, description, status, etc.) - use value as-is

        // Always assign the processed value to the job object
        job[field] = processedValue;
        console.log(`    ✅ Set job.${field} = ${JSON.stringify(job[field])}`);
      } else {
        console.log(`  ❌ ${field}: not in request body`);
      }
    });


    // If changing from direct to open assignment, clear assigned_to
    if (req.body.assignment_mode === 'open' && job.assignment_mode === 'direct') {
      job.assigned_to = [];
    }

    // Validate status transitions
    if (req.body.status && req.body.status !== job.status) {
      const currentStatus = job.status;
      const newStatus = req.body.status;

      if (!canTransition(currentStatus, newStatus)) {
        return res.status(400).json({
          error: `Cannot change status from ${currentStatus} to ${newStatus}`
        });
      }


      // Additional validation for specific transitions
      if (newStatus === 'open' && currentStatus === 'draft') {
        // When publishing from draft to open, ensure required fields are set
        // Check the NEW values being sent, not the old values in the database
        const newJobType = req.body.job_type || job.job_type;
        const newAssignmentMode = req.body.assignment_mode || job.assignment_mode;
        const newBidDeadline = req.body.bid_deadline || job.bid_deadline;

        // Only freelance jobs with open bidding require bid_deadline
        // Studio jobs (job_type === 'job') don't need bid_deadline
        if (newJobType !== 'job' && newAssignmentMode === 'open' && !newBidDeadline) {
          return res.status(400).json({
            error: 'Bid deadline is required when publishing open freelance jobs'
          });
        }
      }

      // Validate assignment mode requirements
      const assignmentMode = req.body.assignment_mode || job.assignment_mode;
      const assignedTo = req.body.assigned_to !== undefined ? req.body.assigned_to : job.assigned_to;

      if (assignmentMode === 'direct' && !assignedTo) {
        return res.status(400).json({
          error: 'Direct assignment requires selecting a user to assign to'
        });
      }
    }

    console.log('🔍 Job state before save:', {
      status: job.status,
      title: job.title,
      assignment_mode: job.assignment_mode,
      bid_deadline: job.bid_deadline
    });

    const savedJob = await job.save();
    console.log('✅ Job saved with new status:', savedJob.status);

    // Verify the job was actually updated in the database
    const verifiedJob = await Job.findById(job._id);
    if (!verifiedJob) {
      return res.status(404).json({ error: 'Job not found after update' });
    }

    console.log('🔍 Database verification - updated job status:', verifiedJob.status);

    await verifiedJob.populate('movie_id', 'title production_year genre');
    await verifiedJob.populate('created_by', 'email');
    await verifiedJob.populate('assigned_to', 'email');

    job = verifiedJob;

    console.log('📤 Returning updated job with status:', job.status);

    res.json({
      message: 'Job updated successfully',
      job
    });
  } catch (error) {
    console.error('Update job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/jobs/:id
// @desc    Delete job
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const job = await Job.findOne({ _id: req.params.id, created_by: req.user.id });

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Prevent deletion after certain statuses
    if (['awarded', 'in_progress', 'completed'].includes(job.status)) {
      return res.status(400).json({ error: 'Cannot delete job in current status' });
    }

    // Delete associated bids
    await Bid.deleteMany({ job_id: req.params.id });

    // Delete the job
    await Job.findByIdAndDelete(req.params.id);

    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Delete job error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;