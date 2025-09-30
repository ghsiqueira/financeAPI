const mongoose = require('mongoose');

const goalShareSchema = new mongoose.Schema({
  goal: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Goal',
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sharedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['viewer', 'contributor', 'co-owner'],
    default: 'viewer',
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected'],
    default: 'pending'
  },
  inviteToken: {
    type: String,
    unique: true,
    sparse: true 
  },
  inviteExpiration: {
    type: Date
  },
  permissions: {
    canAddAmount: { type: Boolean, default: false },
    canEdit: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: false },
    canInviteOthers: { type: Boolean, default: false }
  },
  contribution: {
    type: Number,
    default: 0 
  },
  notificationsEnabled: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date
  }
});

goalShareSchema.index({ goal: 1, sharedWith: 1 }, { unique: true });
goalShareSchema.index({ inviteToken: 1 });
goalShareSchema.index({ status: 1 });

goalShareSchema.pre('save', function(next) {
  if (this.isModified('role')) {
    switch (this.role) {
      case 'viewer':
        this.permissions = {
          canAddAmount: false,
          canEdit: false,
          canDelete: false,
          canInviteOthers: false
        };
        break;
      case 'contributor':
        this.permissions = {
          canAddAmount: true,
          canEdit: false,
          canDelete: false,
          canInviteOthers: false
        };
        break;
      case 'co-owner':
        this.permissions = {
          canAddAmount: true,
          canEdit: true,
          canDelete: false,
          canInviteOthers: true
        };
        break;
    }
  }
  next();
});

module.exports = mongoose.model('GoalShare', goalShareSchema);