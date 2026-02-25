import mongoose from 'mongoose';

const newsSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    teaser: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    link: {
      type: String,
      trim: true,
    },
    image_url: {
      type: String,
      trim: true,
    },
    is_published: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

newsSchema.index({ createdAt: -1 });
newsSchema.index({ is_published: 1, createdAt: -1 });

const News = mongoose.model('News', newsSchema);

export default News;

