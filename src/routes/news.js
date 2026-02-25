import express from 'express';
import News from '../models/News.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();

// Public: latest published news for landing page
router.get('/public', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 4;

    const items = await News.find({ is_published: true })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json(items);
  } catch (error) {
    console.error('Error fetching public news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Admin: list all news
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const items = await News.find()
      .sort({ createdAt: -1 })
      .lean();

    res.json(items);
  } catch (error) {
    console.error('Error fetching admin news:', error);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

// Admin: create news item
router.post('/', protect, adminOnly, async (req, res) => {
  try {
    const { title, teaser, category, link, image_url, is_published } = req.body;

    if (!title || !teaser) {
      return res.status(400).json({ error: 'Title and teaser are required' });
    }

    const news = await News.create({
      title,
      teaser,
      category,
      link,
      image_url,
      is_published: typeof is_published === 'boolean' ? is_published : true,
      created_by: req.user._id,
    });

    res.status(201).json(news);
  } catch (error) {
    console.error('Error creating news:', error);
    res.status(500).json({ error: 'Failed to create news item' });
  }
});

// Admin: update news item
router.put('/:id', protect, adminOnly, async (req, res) => {
  try {
    const { title, teaser, category, link, image_url, is_published } = req.body;

    const updates = {};

    if (title !== undefined) updates.title = title;
    if (teaser !== undefined) updates.teaser = teaser;
    if (category !== undefined) updates.category = category;
    if (link !== undefined) updates.link = link;
    if (image_url !== undefined) updates.image_url = image_url;
    if (typeof is_published === 'boolean') updates.is_published = is_published;

    const news = await News.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    );

    if (!news) {
      return res.status(404).json({ error: 'News item not found' });
    }

    res.json(news);
  } catch (error) {
    console.error('Error updating news:', error);
    res.status(500).json({ error: 'Failed to update news item' });
  }
});

// Admin: delete news item
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const news = await News.findByIdAndDelete(req.params.id);

    if (!news) {
      return res.status(404).json({ error: 'News item not found' });
    }

    res.json({ message: 'News item deleted successfully' });
  } catch (error) {
    console.error('Error deleting news:', error);
    res.status(500).json({ error: 'Failed to delete news item' });
  }
});

export default router;

