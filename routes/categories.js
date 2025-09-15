const express = require('express');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

const router = express.Router();

// Criar categoria personalizada
router.post('/', auth, [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('type').isIn(['income', 'expense']).withMessage('Tipo deve ser income ou expense'),
  body('icon').optional().isString(),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Cor deve ser um código hexadecimal válido')
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

    const { name, type, icon = '💰', color = '#4CAF50' } = req.body;

    // Verificar se já existe uma categoria com o mesmo nome para este usuário
    const existingCategory = await Category.findOne({
      userId: req.user._id,
      name: { $regex: new RegExp(`^${name}$`, 'i') },
      type
    });

    if (existingCategory) {
      return res.status(400).json({
        success: false,
        message: 'Já existe uma categoria com este nome'
      });
    }

    const category = new Category({
      name,
      type,
      icon,
      color,
      userId: req.user._id,
      isDefault: false
    });

    await category.save();

    res.status(201).json({
      success: true,
      message: 'Categoria criada com sucesso',
      category
    });
  } catch (error) {
    console.error('Erro ao criar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar categorias (padrões + personalizadas do usuário)
router.get('/', auth, async (req, res) => {
  try {
    const { type } = req.query;
    
    const filters = {
      $or: [
        { userId: req.user._id }, // Categorias personalizadas do usuário
        { userId: null, isDefault: true } // Categorias padrão do sistema
      ]
    };
    
    if (type) {
      filters.type = type;
    }

    const categories = await Category.find(filters)
      .sort({ isDefault: -1, name: 1 });

    // Contar uso de cada categoria
    const categoriesWithUsage = await Promise.all(
      categories.map(async (category) => {
        const transactionCount = await Transaction.countDocuments({
          category: category._id,
          userId: req.user._id
        });

        const budgetCount = await Budget.countDocuments({
          category: category._id,
          userId: req.user._id
        });

        return {
          ...category.toObject(),
          usage: {
            transactions: transactionCount,
            budgets: budgetCount,
            total: transactionCount + budgetCount
          }
        };
      })
    );

    res.json({
      success: true,
      categories: categoriesWithUsage
    });
  } catch (error) {
    console.error('Erro ao listar categorias:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter categoria por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      $or: [
        { userId: req.user._id },
        { userId: null, isDefault: true }
      ]
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada'
      });
    }

    // Obter estatísticas de uso
    const transactionCount = await Transaction.countDocuments({
      category: category._id,
      userId: req.user._id
    });

    const budgetCount = await Budget.countDocuments({
      category: category._id,
      userId: req.user._id
    });

    // Obter total gasto/recebido nesta categoria nos últimos 6 meses
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const totalAmount = await Transaction.aggregate([
      {
        $match: {
          category: category._id,
          userId: req.user._id,
          date: { $gte: sixMonthsAgo }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const stats = {
      transactions: transactionCount,
      budgets: budgetCount,
      lastSixMonths: {
        total: totalAmount.length > 0 ? totalAmount[0].total : 0,
        count: totalAmount.length > 0 ? totalAmount[0].count : 0
      }
    };

    res.json({
      success: true,
      category: {
        ...category.toObject(),
        stats
      }
    });
  } catch (error) {
    console.error('Erro ao obter categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar categoria (apenas categorias personalizadas)
router.put('/:id', auth, [
  body('name').optional().notEmpty().withMessage('Nome não pode estar vazio'),
  body('icon').optional().isString(),
  body('color').optional().matches(/^#[0-9A-F]{6}$/i).withMessage('Cor deve ser um código hexadecimal válido')
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

    const category = await Category.findOne({
      _id: req.params.id,
      userId: req.user._id,
      isDefault: false
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada ou não pode ser editada'
      });
    }

    // Se estiver alterando o nome, verificar duplicatas
    if (req.body.name && req.body.name !== category.name) {
      const existingCategory = await Category.findOne({
        _id: { $ne: req.params.id },
        userId: req.user._id,
        name: { $regex: new RegExp(`^${req.body.name}$`, 'i') },
        type: category.type
      });

      if (existingCategory) {
        return res.status(400).json({
          success: false,
          message: 'Já existe uma categoria com este nome'
        });
      }
    }

    const updatedCategory = await Category.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    res.json({
      success: true,
      message: 'Categoria atualizada com sucesso',
      category: updatedCategory
    });
  } catch (error) {
    console.error('Erro ao atualizar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar categoria (apenas categorias personalizadas)
router.delete('/:id', auth, async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      userId: req.user._id,
      isDefault: false
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Categoria não encontrada ou não pode ser deletada'
      });
    }

    // Verificar se a categoria está sendo usada
    const transactionCount = await Transaction.countDocuments({
      category: req.params.id,
      userId: req.user._id
    });

    const budgetCount = await Budget.countDocuments({
      category: req.params.id,
      userId: req.user._id
    });

    if (transactionCount > 0 || budgetCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Não é possível deletar a categoria. Ela está sendo usada em ${transactionCount} transação(ões) e ${budgetCount} orçamento(s).`,
        usage: {
          transactions: transactionCount,
          budgets: budgetCount
        }
      });
    }

    await Category.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Categoria deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter estatísticas por categoria
router.get('/stats/spending', auth, async (req, res) => {
  try {
    const { startDate, endDate, type = 'expense' } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    } else {
      // Últimos 30 dias por padrão
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      dateFilter.date = { $gte: thirtyDaysAgo };
    }

    const stats = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          type: type,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$category',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
          avg: { $avg: '$amount' }
        }
      },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category'
        }
      },
      {
        $unwind: '$category'
      },
      {
        $sort: { total: -1 }
      }
    ]);

    // Calcular total geral
    const grandTotal = stats.reduce((sum, item) => sum + item.total, 0);

    // Adicionar percentuais
    const statsWithPercentage = stats.map(item => ({
      ...item,
      percentage: grandTotal > 0 ? (item.total / grandTotal) * 100 : 0
    }));

    res.json({
      success: true,
      stats: statsWithPercentage,
      summary: {
        grandTotal,
        categoryCount: stats.length,
        period: { startDate, endDate }
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas por categoria:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter ícones disponíveis
router.get('/icons/available', (req, res) => {
  const availableIcons = [
    '💰', '💸', '🏠', '🚗', '🍽️', '🛒', '⚡', '📱', 
    '🏥', '💊', '🎬', '🎮', '📚', '✈️', '🏖️', '👕',
    '⛽', '🚌', '🚇', '🚕', '🍕', '☕', '🍺', '🎯',
    '💼', '💻', '📈', '🎓', '🏋️', '🎵', '📺', '🎪',
    '🐕', '🐱', '🌱', '🔧', '🎨', '💍', '🎁', '📦'
  ];

  const iconCategories = {
    finance: ['💰', '💸', '💼', '📈', '💍'],
    home: ['🏠', '⚡', '📱', '🔧', '🌱'],
    transport: ['🚗', '⛽', '🚌', '🚇', '🚕', '✈️'],
    food: ['🍽️', '🛒', '🍕', '☕', '🍺'],
    health: ['🏥', '💊', '🏋️'],
    entertainment: ['🎬', '🎮', '🎯', '🎵', '📺', '🎪'],
    education: ['📚', '🎓'],
    shopping: ['👕', '📦', '🎁'],
    travel: ['🏖️', '✈️'],
    pets: ['🐕', '🐱'],
    other: ['🎨', '💻']
  };

  res.json({
    success: true,
    icons: {
      all: availableIcons,
      categories: iconCategories
    }
  });
});

module.exports = router;