const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true,
    validate: {
      validator: function(v) {
        return v > this.startDate;
      },
      message: 'Data final deve ser posterior à data inicial'
    }
  },
  monthlyTarget: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused'],
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Calcular meta mensal antes de salvar
goalSchema.pre('save', function(next) {
  if (this.isModified('targetAmount') || this.isModified('startDate') || this.isModified('endDate')) {
    const months = Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24 * 30));
    this.monthlyTarget = this.targetAmount / months;
  }
  next();
});

module.exports = mongoose.model('Goal', goalSchema);