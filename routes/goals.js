const express = require('express');
const { body, validationResult } = require('express-validator');
const Goal = require('../models/Goal');
const auth = require('../middleware/auth');

const router = express.Router();

// Criar meta - CORRIGIDO para incluir category
router.post('/', auth, [
  body('title').notEmpty().withMessage('Título é obrigatório'),
  body('targetAmount').isFloat({ min: 0.01 }).withMessage('Valor da meta deve ser maior que 0'),
  body('startDate').isISO8601().withMessage('Data de início inválida'),
  body('endDate').isISO8601().withMessage('Data final inválida'),
  body('description').optional().isString(),
  body('category').optional().isString() // ADICIONADO: validação para category
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const { title, description, targetAmount, startDate, endDate, category } = req.body;

    if (new Date(endDate) <= new Date(startDate)) {
      return res.status(400).json({
        success: false,
        message: 'Data final deve ser posterior à data inicial'
      });
    }

    const goal = new Goal({
      userId: req.user._id,
      title,
      description: description || '',
      targetAmount,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      category: category || '' // CORRIGIDO: incluir category
    });

    await goal.save();

    res.status(201).json({
      success: true,
      message: 'Meta criada com sucesso',
      goal
    });
  } catch (error) {
    console.error('Erro ao criar meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Buscar metas ativas
router.get('/active', auth, async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    
    const goals = await Goal.find({
      userId: req.user._id,
      status: 'active'
    })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    const goalsWithProgress = goals.map(goal => {
      const progress = goal.targetAmount > 0 ? 
        (goal.currentAmount / goal.targetAmount) * 100 : 0;
      const now = new Date();
      const totalDays = Math.ceil((goal.endDate - goal.startDate) / (1000 * 60 * 60 * 24));
      const daysPassed = Math.ceil((now - goal.startDate) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, Math.ceil((goal.endDate - now) / (1000 * 60 * 60 * 24)));
      const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
      const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
      const monthlyTargetRemaining = remainingAmount / monthsRemaining;
      
      return {
        ...goal.toObject(),
        progress: Math.min(progress, 100),
        daysRemaining,
        totalDays,
        daysPassed: Math.max(0, daysPassed),
        monthsRemaining,
        remainingAmount,
        monthlyTargetRemaining
      };
    });

    res.json({
      success: true,
      data: goalsWithProgress,
      count: goalsWithProgress.length
    });
  } catch (error) {
    console.error('Erro ao obter metas ativas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar metas
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const filters = { userId: req.user._id };
    if (status) filters.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const goals = await Goal.find(filters)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Goal.countDocuments(filters);

    const goalsWithProgress = goals.map(goal => {
      const progress = goal.targetAmount > 0 ? 
        (goal.currentAmount / goal.targetAmount) * 100 : 0;
      const now = new Date();
      const totalDays = Math.ceil((goal.endDate - goal.startDate) / (1000 * 60 * 60 * 24));
      const daysPassed = Math.ceil((now - goal.startDate) / (1000 * 60 * 60 * 24));
      const daysRemaining = Math.max(0, Math.ceil((goal.endDate - now) / (1000 * 60 * 60 * 24)));
      const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
      const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
      const monthlyTargetRemaining = remainingAmount / monthsRemaining;
      
      return {
        ...goal.toObject(),
        progress: Math.min(progress, 100),
        daysRemaining,
        totalDays,
        daysPassed: Math.max(0, daysPassed),
        monthsRemaining,
        remainingAmount,
        monthlyTargetRemaining
      };
    });

    res.json({
      success: true,
      goals: goalsWithProgress,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Erro ao listar metas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter meta por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    const progress = goal.targetAmount > 0 ? 
      (goal.currentAmount / goal.targetAmount) * 100 : 0;
    const now = new Date();
    const totalDays = Math.ceil((goal.endDate - goal.startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.ceil((now - goal.startDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((goal.endDate - now) / (1000 * 60 * 60 * 24)));
    const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
    const monthlyTargetRemaining = remainingAmount / monthsRemaining;

    res.json({
      success: true,
      goal: {
        ...goal.toObject(),
        progress: Math.min(progress, 100),
        daysRemaining,
        totalDays,
        daysPassed: Math.max(0, daysPassed),
        monthsRemaining,
        remainingAmount,
        monthlyTargetRemaining
      }
    });
  } catch (error) {
    console.error('Erro ao obter meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar meta - CORRIGIDO para incluir category
router.put('/:id', auth, [
  body('title').optional().notEmpty().withMessage('Título não pode estar vazio'),
  body('targetAmount').optional().isFloat({ min: 0.01 }).withMessage('Valor da meta deve ser maior que 0'),
  body('startDate').optional().isISO8601().withMessage('Data de início inválida'),
  body('endDate').optional().isISO8601().withMessage('Data final inválida'),
  body('status').optional().isIn(['active', 'completed', 'paused']).withMessage('Status inválido'),
  body('description').optional().isString(),
  body('category').optional().isString() // ADICIONADO: validação para category
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    // Validar datas se fornecidas
    const startDate = req.body.startDate ? new Date(req.body.startDate) : goal.startDate;
    const endDate = req.body.endDate ? new Date(req.body.endDate) : goal.endDate;

    if (endDate <= startDate) {
      return res.status(400).json({
        success: false,
        message: 'Data final deve ser posterior à data inicial'
      });
    }

    // Atualizar campos incluindo category
    Object.keys(req.body).forEach(key => {
      if (key === 'startDate' || key === 'endDate') {
        goal[key] = new Date(req.body[key]);
      } else {
        goal[key] = req.body[key]; // Inclui category automaticamente
      }
    });

    goal.updatedAt = new Date();
    await goal.save();

    res.json({
      success: true,
      message: 'Meta atualizada com sucesso',
      goal
    });
  } catch (error) {
    console.error('Erro ao atualizar meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Adicionar valor à meta
router.post('/:id/add', auth, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    goal.currentAmount += req.body.amount;
    
    if (goal.currentAmount >= goal.targetAmount && goal.status === 'active') {
      goal.status = 'completed';
    }

    goal.updatedAt = new Date();
    await goal.save();

    const progress = goal.targetAmount > 0 ? 
      (goal.currentAmount / goal.targetAmount) * 100 : 0;
    const now = new Date();
    const totalDays = Math.ceil((goal.endDate - goal.startDate) / (1000 * 60 * 60 * 24));
    const daysPassed = Math.ceil((now - goal.startDate) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.ceil((goal.endDate - now) / (1000 * 60 * 60 * 24)));
    const monthsRemaining = Math.max(1, Math.ceil(daysRemaining / 30));
    const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount);
    const monthlyTargetRemaining = remainingAmount / monthsRemaining;

    const goalWithCalculations = {
      ...goal.toObject(),
      progress: Math.min(progress, 100),
      daysRemaining,
      totalDays,
      daysPassed: Math.max(0, daysPassed),
      monthsRemaining,
      remainingAmount,
      monthlyTargetRemaining
    };

    res.json({
      success: true,
      message: goal.status === 'completed' ? 
        'Parabéns! Meta concluída!' : 
        'Valor adicionado à meta com sucesso',
      goal: goalWithCalculations
    });
  } catch (error) {
    console.error('Erro ao adicionar valor à meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Endpoint alternativo mantido para compatibilidade
router.patch('/:id/add-amount', auth, [
  body('amount').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que 0')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos',
        errors: errors.array()
      });
    }

    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    goal.currentAmount += req.body.amount;
    
    if (goal.currentAmount >= goal.targetAmount && goal.status === 'active') {
      goal.status = 'completed';
    }

    goal.updatedAt = new Date();
    await goal.save();

    res.json({
      success: true,
      message: 'Valor adicionado à meta com sucesso',
      goal
    });
  } catch (error) {
    console.error('Erro ao adicionar valor à meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar meta
router.delete('/:id', auth, async (req, res) => {
  try {
    const goal = await Goal.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!goal) {
      return res.status(404).json({
        success: false,
        message: 'Meta não encontrada'
      });
    }

    await Goal.deleteOne({ _id: req.params.id });

    res.json({
      success: true,
      message: 'Meta deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar meta:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;