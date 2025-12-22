import mongoose from 'mongoose';

const associationSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending',
  },
}, {
  timestamps: true,
});

// Ensure a user cannot request to connect with themselves
associationSchema.path('requester').validate(function (value) {
  return this.recipient.toString() !== value.toString();
}, 'Cannot send an association request to yourself.');

// Prevent duplicate association requests or connections
associationSchema.index({ requester: 1, recipient: 1 }, { unique: true });

const Association = mongoose.model('Association', associationSchema);

export default Association;

