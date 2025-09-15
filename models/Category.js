const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  icon: {
    type: String,
    default: '💰'
  },
  color: {
    type: String,
    default: '#4CAF50',
    validate: {
      validator: function(v) {
        return /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Cor deve ser um código hexadecimal válido'
    }
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null // null = categoria padrão do sistema
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Category', categorySchema);