import express from 'express';
import { protect } from '../middleware/auth.js';
import Association from '../models/Association.js';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import Wall from '../models/Wall.js';
import Project from '../models/Project.js';

const router = express.Router();

// Explanation: The 'profile' field is not directly on the User schema in the Association model. 
// We will populate User fields and then manually fetch and merge Profile data.
const populateAssociationUsers = (query) => {
  return query
    .populate('requester', 'email roles') // Only populate user fields
    .populate('recipient', 'email roles'); // Only populate user fields
};

router.post('/request', protect, async (req, res) => {
  try {
    const { recipientProfileId } = req.body;
    const requesterUserId = req.user.id;

    const requesterProfile = await Profile.findOne({ user_id: requesterUserId });
    if (!requesterProfile) {
      return res.status(404).json({ error: 'Requester profile not found.' });
    }

    const requesterUser = await User.findById(requesterUserId);
    if (!requesterUser) {
      return res.status(404).json({ error: 'Requester user not found.' });
    }

    const isAllowedRole = requesterUser.roles.includes('artist') || requesterUser.roles.includes('studio');
    const isVerified = requesterProfile.verification_status === 'approved';

    if (!isAllowedRole || !isVerified) {
      return res.status(403).json({ error: "Only verified artists and studios can send association requests." });
    }

    const recipientProfile = await Profile.findById(recipientProfileId);
    if (!recipientProfile) {
      return res.status(404).json({ error: 'Recipient profile not found.' });
    }
    const recipientUserId = recipientProfile.user_id;

    if (requesterUserId.toString() === recipientUserId.toString()) {
      return res.status(400).json({ error: 'Cannot send an association request to yourself.' });
    }

    const existingAssociation = await Association.findOne({
      $or: [
        { requester: requesterUserId, recipient: recipientUserId },
        { requester: recipientUserId, recipient: requesterUserId },
      ],
    });

    if (existingAssociation) {
      let errorMessage = 'Association request already sent or already connected.';
      if (existingAssociation.status === 'pending') {
        errorMessage = 'An association request is already pending with this creator.';
      } else if (existingAssociation.status === 'accepted') {
        errorMessage = 'You are already associated with this creator.';
      }
      return res.status(400).json({ error: errorMessage });
    }

    const association = new Association({
      requester: requesterUserId,
      recipient: recipientUserId,
      status: 'pending',
    });

    await association.save();

    // Now, fetch the full User objects and then their associated Profiles
    const populatedAssociation = await populateAssociationUsers(Association.findById(association._id)).lean(); // Use .lean() for plain JS objects

    // Fetch requester and recipient profiles separately and merge
    const requesterProfileData = await Profile.findOne({ user_id: populatedAssociation.requester._id }).select('name avatar_url location rating wall_id');
    const recipientProfileData = await Profile.findOne({ user_id: populatedAssociation.recipient._id }).select('name avatar_url location rating wall_id');

    if (requesterProfileData) {
      populatedAssociation.requester.profile = requesterProfileData;
    }
    if (recipientProfileData) {
      populatedAssociation.recipient.profile = recipientProfileData;
    }

    const io = req.app.get('io'); // Get io from app locals
    if (io) {
      io.to(recipientUserId.toString()).emit('newAssociationRequest', populatedAssociation);
    }

    res.status(201).json({ message: 'Association request sent.', association: populatedAssociation });
  } catch (error) {
    console.error('Send association request error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/accept/:id', protect, async (req, res) => {
  try {
    const association = await Association.findOne({
      _id: req.params.id,
      recipient: req.user.id,
      status: 'pending',
    });

    if (!association) {
      return res.status(404).json({ error: 'Association request not found or not pending.' });
    }

    association.status = 'accepted';
    await association.save();

    // Manually populate profiles for accepted association
    const populatedAssociation = await populateAssociationUsers(Association.findById(association._id)).lean();
    const requesterProfileData = await Profile.findOne({ user_id: populatedAssociation.requester._id }).select('name avatar_url location rating wall_id');
    const recipientProfileData = await Profile.findOne({ user_id: populatedAssociation.recipient._id }).select('name avatar_url location rating wall_id');

    if (requesterProfileData) {
      populatedAssociation.requester.profile = requesterProfileData;
    }
    if (recipientProfileData) {
      populatedAssociation.recipient.profile = recipientProfileData;
    }

    const io = req.app.get('io'); // Get io from app locals
    if (io) {
      io.to(association.requester.toString()).emit('associationAccepted', populatedAssociation);
      io.to(association.recipient.toString()).emit('associationAccepted', populatedAssociation);
    }

    res.json({ message: 'Association request accepted.', association: populatedAssociation });
  } catch (error) {
    console.error('Accept association request error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/reject/:id', protect, async (req, res) => {
  try {
    const association = await Association.findOne({
      _id: req.params.id,
      recipient: req.user.id,
      status: 'pending',
    });

    if (!association) {
      return res.status(404).json({ error: 'Association request not found or not pending.' });
    }

    association.status = 'rejected';
    await association.deleteOne(); // Changed from .save() to .deleteOne() in previous turn, keep it.

    const io = req.app.get('io'); // Get io from app locals
    if (io) {
      io.to(association.requester.toString()).emit('associationRejected', { associationId: association._id, recipientId: association.recipient });
    }

    res.json({ message: 'Association request rejected.' });
  } catch (error) {
    console.error('Reject association request error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending', protect, async (req, res) => {
  try {
    const pendingAssociations = await populateAssociationUsers(
      Association.find({
        recipient: req.user.id,
        status: 'pending',
      })
    ).sort({ createdAt: -1 }).lean();

    // Manually populate profiles for pending associations
    for (let assoc of pendingAssociations) {
      const requesterProfileData = await Profile.findOne({ user_id: assoc.requester._id }).select('name avatar_url location rating wall_id');
      const recipientProfileData = await Profile.findOne({ user_id: assoc.recipient._id }).select('name avatar_url location rating wall_id');

      if (requesterProfileData) {
        assoc.requester.profile = requesterProfileData;
      }
      if (recipientProfileData) {
        assoc.recipient.profile = recipientProfileData;
      }
    }

    res.json(pendingAssociations);
  } catch (error) {
    console.error('Get pending associations error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/connected', protect, async (req, res) => {
  try {
    let connectedAssociations = await populateAssociationUsers(
      Association.find({
        $or: [{ requester: req.user.id, status: 'accepted' }, { recipient: req.user.id, status: 'accepted' }],
      })
    ).lean();

    // Manually populate profiles and fetch latest activity for connected associations
    for (let assoc of connectedAssociations) {
      const currentUserId = req.user.id;
      const otherUserId = assoc.requester._id.toString() === currentUserId.toString() ? assoc.recipient._id : assoc.requester._id;

      // Fetch profiles
      const requesterProfileData = await Profile.findOne({ user_id: assoc.requester._id }).select('name avatar_url location rating wall_id updatedAt');
      const recipientProfileData = await Profile.findOne({ user_id: assoc.recipient._id }).select('name avatar_url location rating wall_id updatedAt');

      if (requesterProfileData) {
        assoc.requester.profile = requesterProfileData;
      }
      if (recipientProfileData) {
        assoc.recipient.profile = recipientProfileData;
      }

      // Determine the other user's data structure after profile merging
      const otherUser = assoc.requester._id.toString() === currentUserId.toString() ? assoc.recipient : assoc.requester;
      const otherUserProfile = otherUser.profile; // This will now have the profile data

      let lastActivityTimestamp = null;
      let lastActivityType = "";

      // Check profile update activity
      if (otherUserProfile && otherUserProfile.updatedAt) {
        lastActivityTimestamp = otherUserProfile.updatedAt;
        lastActivityType = "Updated profile";
      }

      // Check wall activity
      const latestWall = await Wall.findOne({ user_id: otherUserId }).sort({ updatedAt: -1 });
      if (latestWall && (!lastActivityTimestamp || latestWall.updatedAt > lastActivityTimestamp)) {
        lastActivityTimestamp = latestWall.updatedAt;
        lastActivityType = latestWall.createdAt.getTime() === latestWall.updatedAt.getTime() ? "Created a new wall" : "Updated a wall";
      }

      // Check project activity
      const latestProject = await Project.findOne({ user_id: otherUserId }).sort({ updatedAt: -1 });
      if (latestProject && (!lastActivityTimestamp || latestProject.updatedAt > lastActivityTimestamp)) {
        lastActivityTimestamp = latestProject.updatedAt;
        lastActivityType = latestProject.createdAt.getTime() === latestProject.updatedAt.getTime() ? "Created a new project" : "Updated a project";
      }

      otherUser.lastActivityTimestamp = lastActivityTimestamp;
      otherUser.lastActivityType = lastActivityType;
    }

    res.json(connectedAssociations);
  } catch (error) {
    console.error('Get connected associations error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', protect, async (req, res) => {
  try {
    const association = await Association.findOne({
      _id: req.params.id,
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
      status: 'accepted',
    });

    if (!association) {
      return res.status(404).json({ error: 'Association not found or not connected.' });
    }

    await association.deleteOne();
    res.json({ message: 'Association removed successfully.' });
  } catch (error) {
    console.error('Remove association error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
