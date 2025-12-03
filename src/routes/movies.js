import express from 'express';
import Movie from '../models/Movie.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

// @route   POST /api/movies
// @desc    Create a new movie
// @access  Private (studio, admin)
router.post('/', protect, async (req, res) => {
  try {
    const { title, description, poster_url, production_year, genre, status } = req.body;

    // Check if user has permission (studio or admin)
    if (!req.user.roles.includes('studio') && !req.user.roles.includes('admin')) {
      return res.status(403).json({ error: 'Only studios and admins can create movies' });
    }

    const movie = new Movie({
      title,
      description,
      poster_url,
      production_year,
      genre,
      status: status || 'planning',
      created_by: req.user.id
    });

    await movie.save();

    await movie.populate('created_by', 'email');

    res.status(201).json({
      message: 'Movie created successfully',
      movie
    });
  } catch (error) {
    console.error('Create movie error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/movies
// @desc    Get all movies (for current user)
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const movies = await Movie.find({ created_by: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.json(movies);
  } catch (error) {
    console.error('Get movies error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   GET /api/movies/:id
// @desc    Get movie by ID
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const movie = await Movie.findOne({
      _id: req.params.id,
      created_by: req.user.id
    }).lean();

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    res.json(movie);
  } catch (error) {
    console.error('Get movie error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   PUT /api/movies/:id
// @desc    Update movie
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { title, description, poster_url, production_year, genre, status } = req.body;

    const movie = await Movie.findOneAndUpdate(
      { _id: req.params.id, created_by: req.user.id },
      {
        title,
        description,
        poster_url,
        production_year,
        genre,
        status
      },
      { new: true, runValidators: true }
    );

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    res.json({
      message: 'Movie updated successfully',
      movie
    });
  } catch (error) {
    console.error('Update movie error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// @route   DELETE /api/movies/:id
// @desc    Delete movie
// @access  Private
router.delete('/:id', protect, async (req, res) => {
  try {
    const movie = await Movie.findOneAndDelete({
      _id: req.params.id,
      created_by: req.user.id
    });

    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    res.json({ message: 'Movie deleted successfully' });
  } catch (error) {
    console.error('Delete movie error:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid movie ID' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
