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
    trim: true,
    maxLength: 100
  },
  description: {
    type: String,
    trim: true,
    maxLength: 500,
    default: ''
  },
  targetAmount: {
    type: Number,
    required: true,
    min: 0.01
  },
  currentAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  startDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  category: {
    type: String,
    trim: true,
    default: '',
    enum: ['', 'Emergência', 'Viagem', 'Casa própria', 'Carro', 'Educação', 'Investimento', 'Aposentadoria', 'Casamento', 'Outros']
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'paused'],
    default: 'active'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Índices para performance
goalSchema.index({ userId: 1, status: 1 });
goalSchema.index({ userId: 1, endDate: 1 });

// Virtual para progresso
goalSchema.virtual('progress').get(function() {
  if (this.targetAmount <= 0) return 0;
  return Math.min((this.currentAmount / this.targetAmount) * 100, 100);
});

// Virtual para dias restantes
goalSchema.virtual('daysRemaining').get(function() {
  const now = new Date();
  const remaining = Math.ceil((this.endDate - now) / (1000 * 60 * 60 * 24));
  return Math.max(0, remaining);
});

// Virtual para total de dias
goalSchema.virtual('totalDays').get(function() {
  return Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
});

// Virtual para dias passados
goalSchema.virtual('daysPassed').get(function() {
  const now = new Date();
  const passed = Math.ceil((now - this.startDate) / (1000 * 60 * 60 * 24));
  return Math.max(0, passed);
});

// Virtual para meses restantes
goalSchema.virtual('monthsRemaining').get(function() {
  return Math.max(1, Math.ceil(this.daysRemaining / 30));
});

// Virtual para valor restante
goalSchema.virtual('remainingAmount').get(function() {
  return Math.max(0, this.targetAmount - this.currentAmount);
});

// Virtual para meta mensal
goalSchema.virtual('monthlyTarget').get(function() {
  const totalMonths = Math.max(1, Math.ceil(this.totalDays / 30));
  return this.targetAmount / totalMonths;
});

// Virtual para meta mensal restante
goalSchema.virtual('monthlyTargetRemaining').get(function() {
  if (this.status === 'completed' || this.daysRemaining <= 0) return 0;
  return this.remainingAmount / this.monthsRemaining;
});

// Middleware para atualizar status automaticamente
goalSchema.pre('save', function(next) {
  // Se atingiu o valor da meta, marcar como completed
  if (this.currentAmount >= this.targetAmount && this.status === 'active') {
    this.status = 'completed';
  }
  
  // Se a data passou e não foi completada, manter como active (usuário decide se pausa)
  // Isso permite flexibilidade para metas com prazo estendido
  
  next();
});

module.exports = mongoose.model('Goal', goalSchema);