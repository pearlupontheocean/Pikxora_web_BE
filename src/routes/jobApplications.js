import express from 'express';
import JobApplication from '../models/JobApplication.js';
import Job from '../models/Job.js';
import Profile from '../models/Profile.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/job-applications
// @desc    Apply for a job
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    // Only artists can apply for jobs
    if (!req.user.roles.includes('artist')) {
      return res.status(403).json({ error: 'Only artists can apply for jobs' });
    }

    const {
      job_id,
      applicant_email,
      applicant_phone,
      cover_letter,
      expected_salary,
      currency,
      notice_period
    } = req.body;

    // Validate required fields
    if (!applicant_email || !applicant_phone) {
      return res.status(400).json({ error: 'Email and phone number are required' });
    }

    // Validate job exists and is a studio job
    const job = await Job.findById(job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.job_type !== 'job') {
      return res.status(400).json({ error: 'This is a freelance job. Please submit a bid instead.' });
    }

    if (job.status !== 'open') {
      return res.status(400).json({ error: 'This job is not accepting applications' });
    }

    // Check if user is not the job owner
    if (job.created_by.toString() === req.user.id) {
      return res.status(400).json({ error: 'You cannot apply to your own job' });
    }

    // Check if user already applied
    const existingApplication = await JobApplication.findOne({
      job_id,
      applicant_id: req.user.id
    });

    if (existingApplication) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }

    const application = new JobApplication({
      job_id,
      applicant_id: req.user.id,
      applicant_email,
      applicant_phone,
      cover_letter,
      expected_salary,
      currency: currency || 'INR',
      notice_period: notice_period || 'immediate',
      status: 'pending'
    });

    await application.save();

    await application.populate([
      { path: 'job_id', select: 'title' },
      { path: 'applicant_id', select: 'email name' }
    ]);

    res.status(201).json({
      message: 'Application submitted successfully',
      application
    });
  } catch (error) {
    console.error('Apply for job error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'You have already applied for this job' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/job-applications/job/:jobId
// @desc    Get all applications for a job (job owner only)
// @access  Private
router.get('/job/:jobId', protect, async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    // Only job owner or admin can view applications
    if (job.created_by.toString() !== req.user.id && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const applications = await JobApplication.find({ job_id: req.params.jobId })
      .populate({
        path: 'applicant_id',
        select: 'email name'
      })
      .sort({ createdAt: -1 });

    // Get profiles for all applicants
    const applicantIds = applications.map(app => app.applicant_id._id);
    const profiles = await Profile.find({ user_id: { $in: applicantIds } })
      .select('name title location skills experience rating avatar_url user_id');

    // Map profiles to applications
    const applicationsWithProfiles = applications.map(app => {
      const profile = profiles.find(p => p.user_id.toString() === app.applicant_id._id.toString());
      return {
        ...app.toObject(),
        applicant_profile: profile || null
      };
    });

    res.json(applicationsWithProfiles);
  } catch (error) {
    console.error('Get job applications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/job-applications/my
// @desc    Get all applications submitted by current user
// @access  Private
router.get('/my', protect, async (req, res) => {
  try {
    const applications = await JobApplication.find({ applicant_id: req.user.id })
      .populate({
        path: 'job_id',
        select: 'title description status job_type package_per_year currency created_by',
        populate: {
          path: 'created_by',
          select: 'email name'
        }
      })
      .sort({ createdAt: -1 });

    res.json(applications);
  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/job-applications/check/:jobId
// @desc    Check if current user has applied for a job
// @access  Private
router.get('/check/:jobId', protect, async (req, res) => {
  try {
    const application = await JobApplication.findOne({
      job_id: req.params.jobId,
      applicant_id: req.user.id
    });

    res.json({
      hasApplied: !!application,
      application: application || null
    });
  } catch (error) {
    console.error('Check application error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/job-applications/:id/status
// @desc    Update application status (job owner only)
// @access  Private
router.put('/:id/status', protect, async (req, res) => {
  try {
    const { status, notes } = req.body;

    const application = await JobApplication.findById(req.params.id)
      .populate('job_id', 'created_by');

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Only job owner or admin can update status
    if (application.job_id.created_by.toString() !== req.user.id && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const validStatuses = ['pending', 'reviewed', 'shortlisted', 'rejected', 'hired'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    application.status = status;
    if (notes) {
      application.notes = notes;
    }

    await application.save();

    await application.populate([
      { path: 'job_id', select: 'title' },
      { path: 'applicant_id', select: 'email name' }
    ]);

    res.json({
      message: 'Application status updated',
      application
    });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/job-applications/:id
// @desc    Withdraw application (applicant only)
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const application = await JobApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Only the applicant can withdraw
    if (application.applicant_id.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Can only withdraw pending applications
    if (application.status !== 'pending') {
      return res.status(400).json({ error: 'Cannot withdraw application that is already being processed' });
    }

    await application.deleteOne();

    res.json({ message: 'Application withdrawn successfully' });
  } catch (error) {
    console.error('Withdraw application error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;

