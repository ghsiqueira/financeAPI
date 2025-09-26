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

    // Remover duplicatas e validar ícones
    const uniqueCategories = [];
    const seenNames = new Set();

    for (const category of categories) {
      const categoryName = category.name.toLowerCase().trim();
      
      // Validar se tem ícone válido (não vazio e não é '?')
      const hasValidIcon = category.icon && 
                          category.icon.trim() !== '' && 
                          category.icon !== '?';
      
      const hasValidColor = category.color && category.color.trim() !== '';
      
      // Só adiciona se não for duplicada e tiver dados válidos
      if (!seenNames.has(categoryName) && hasValidIcon && hasValidColor) {
        seenNames.add(categoryName);
        
        // Contar uso de cada categoria
        const transactionCount = await Transaction.countDocuments({
          category: category._id,
          userId: req.user._id
        });

        const budgetCount = await Budget.countDocuments({
          category: category._id,
          userId: req.user._id
        });

        uniqueCategories.push({
          ...category.toObject(),
          usage: {
            transactions: transactionCount,
            budgets: budgetCount,
            total: transactionCount + budgetCount
          }
        });
      }
    }

    res.json({
      success: true,
      categories: uniqueCategories,
      data: uniqueCategories
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

// Rota para limpar categorias duplicadas (executar uma vez)
router.post('/cleanup-duplicates', auth, async (req, res) => {
  try {
    console.log('🧹 Iniciando limpeza de categorias duplicadas...');
    
    const categories = await Category.find({ 
      userId: req.user._id 
    });
    
    const uniqueMap = new Map();
    const toDelete = [];

    for (const category of categories) {
      const key = category.name.toLowerCase().trim();
      
      if (!uniqueMap.has(key)) {
        // Primeira ocorrência - verificar se tem ícone válido
        if (category.icon && category.icon !== '?' && category.icon.trim() !== '') {
          uniqueMap.set(key, category._id);
        } else {
          // Se não tem ícone válido, também marca para deletar
          toDelete.push(category._id);
        }
      } else {
        // Duplicata - marcar para deletar
        toDelete.push(category._id);
      }
    }

    // Deletar duplicatas e categorias sem ícone válido
    let deletedCount = 0;
    if (toDelete.length > 0) {
      const result = await Category.deleteMany({ 
        _id: { $in: toDelete } 
      });
      deletedCount = result.deletedCount;
    }

    console.log(`✅ Limpeza concluída: ${deletedCount} categorias removidas`);

    res.json({
      success: true,
      message: `${deletedCount} categorias duplicadas/inválidas removidas`,
      data: { 
        deleted: deletedCount,
        remaining: uniqueMap.size
      }
    });
  } catch (error) {
    console.error('Erro ao limpar duplicatas:', error);
    res.status(500).json({
      success: false,
      message: 'Erro ao limpar duplicatas'
    });
  }
});

// DEBUG: Ver todas as categorias (SEM autenticação - apenas para desenvolvimento)
router.get('/debug/all-public', async (req, res) => {
  try {
    const categories = await Category.find({});

    res.json({
      success: true,
      total: categories.length,
      categories: categories.map(cat => ({
        id: cat._id,
        name: cat.name,
        icon: cat.icon,
        iconCode: cat.icon ? cat.icon.charCodeAt(0) : null,
        color: cat.color,
        type: cat.type,
        isDefault: cat.isDefault,
        userId: cat.userId
      }))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/debug/fix-all-icons', async (req, res) => {
  try {
    const iconMap = {
      'alimentação': '🍽️',
      'transporte': '🚗',
      'moradia': '🏠',
      'saúde': '🏥',
      'educação': '📚',
      'lazer': '🎬',
      'vestuário': '👕',
      'compras': '🛒',
      'beleza & cuidados': '💄',
      'academia': '🏋️',
      'combustível': '⛽',
      'farmácia': '💊',
      'contas & impostos': '📋',
      'viagem': '✈️',
      'pets': '🐕',
      'assinaturas': '📱',
      'salário': '💼',
      'freelance': '💻',
      'investimentos': '📈',
      'bonus': '🎁',
      'vendas': '💵',
      'aluguel recebido': '🏘️',
      'restituição': '↩️',
      'outros': '💰',
      'transferência': '🔄',
      'categoria teste': '🧪'
    };

    const categories = await Category.find({});
    let updated = 0;

    for (const category of categories) {
      const nameKey = category.name.toLowerCase().trim();
      
      // Verificar se o ícone é um nome do Ionicons (texto sem emoji)
      const isTextIcon = category.icon && /^[a-z-]+$/i.test(category.icon);
      
      if (!category.icon || category.icon === '?' || category.icon.trim() === '' || isTextIcon) {
        const newIcon = iconMap[nameKey] || (category.type === 'income' ? '💵' : '💰');
        
        await Category.findByIdAndUpdate(category._id, {
          icon: newIcon
        });
        
        updated++;
      }
    }

    res.json({
      success: true,
      message: `${updated} categorias atualizadas com ícones emoji`,
      updated,
      details: 'Ícones do Ionicons convertidos para emojis'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;