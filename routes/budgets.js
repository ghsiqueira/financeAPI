const express = require('express');
const { body, validationResult } = require('express-validator');
const Budget = require('../models/Budget');
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ ROTAS ESPECÍFICAS PRIMEIRO - ADICIONADAS
// Obter orçamentos atuais (para HomeScreen)
router.get('/current', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();
    
    const budgets = await Budget.find({ 
      userId: req.user._id,
      month: currentMonth,
      year: currentYear,
      isActive: true
    })
    .populate('category')
    .sort({ createdAt: -1 })
    .limit(limit);

    // Calcular informações adicionais para cada orçamento
    const budgetsWithInfo = budgets.map(budget => {
      const usage = budget.monthlyLimit > 0 ? (budget.spent / budget.monthlyLimit) * 100 : 0;
      const remaining = Math.max(0, budget.monthlyLimit - budget.spent);
      const isOverBudget = budget.spent > budget.monthlyLimit;
      
      return {
        ...budget.toObject(),
        usage: Math.min(usage, 100),
        remaining,
        isOverBudget,
        overage: isOverBudget ? budget.spent - budget.monthlyLimit : 0
      };
    });

    res.json({
      success: true,
      data: budgetsWithInfo
    });
  } catch (error) {
    console.error('Erro nos orçamentos atuais:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Criar orçamento
router.post('/', auth, [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('category').isMongoId().withMessage('Categoria inválida'),
  body('monthlyLimit').isFloat({ min: 0.01 }).withMessage('Limite mensal deve ser maior que 0'),
  body('month').isInt({ min: 1, max: 12 }).withMessage('Mês deve estar entre 1 e 12'),
  body('year').isInt({ min: 2020 }).withMessage('Ano inválido')
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

    const { name, category, monthlyLimit, month, year } = req.body;

    // Verificar se já existe um orçamento para esta categoria neste mês/ano
    const existingBudget = await Budget.findOne({
      userId: req.user._id,
      category,
      month,
      year
    });

    if (existingBudget) {
      return res.status(400).json({
        success: false,
        message: 'Já existe um orçamento para esta categoria neste período'
      });
    }

    const budget = new Budget({
      userId: req.user._id,
      name,
      category,
      monthlyLimit,
      month,
      year
    });

    await budget.save();
    await budget.populate('category');

    res.status(201).json({
      success: true,
      message: 'Orçamento criado com sucesso',
      data: budget
    });
  } catch (error) {
    console.error('Erro ao criar orçamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar orçamentos
router.get('/', auth, async (req, res) => {
  try {
    const { month, year, isActive, page = 1, limit = 20 } = req.query;
    
    const filters = { userId: req.user._id };
    
    if (month) filters.month = parseInt(month);
    if (year) filters.year = parseInt(year);
    if (isActive !== undefined) filters.isActive = isActive === 'true';

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const budgets = await Budget.find(filters)
      .populate('category')
      .sort({ year: -1, month: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Budget.countDocuments(filters);

    // Calcular informações adicionais para cada orçamento
    const budgetsWithInfo = budgets.map(budget => {
      const usage = budget.monthlyLimit > 0 ? (budget.spent / budget.monthlyLimit) * 100 : 0;
      const remaining = Math.max(0, budget.monthlyLimit - budget.spent);
      const isOverBudget = budget.spent > budget.monthlyLimit;
      
      return {
        ...budget.toObject(),
        usage: Math.min(usage, 100),
        remaining,
        isOverBudget,
        overage: isOverBudget ? budget.spent - budget.monthlyLimit : 0
      };
    });

    res.json({
      success: true,
      data: {
        data: budgetsWithInfo,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / parseInt(limit)),
          total
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar orçamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTAS DINÂMICAS POR ÚLTIMO
// Obter orçamento por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate('category');

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado'
      });
    }

    // Calcular informações adicionais
    const usage = budget.monthlyLimit > 0 ? (budget.spent / budget.monthlyLimit) * 100 : 0;
    const remaining = Math.max(0, budget.monthlyLimit - budget.spent);
    const isOverBudget = budget.spent > budget.monthlyLimit;

    // Obter transações relacionadas a este orçamento
    const transactions = await Transaction.find({
      budgetId: budget._id,
      userId: req.user._id
    })
    .populate('category')
    .sort({ date: -1 })
    .limit(10);

    res.json({
      success: true,
      data: {
        ...budget.toObject(),
        usage: Math.min(usage, 100),
        remaining,
        isOverBudget,
        overage: isOverBudget ? budget.spent - budget.monthlyLimit : 0,
        recentTransactions: transactions
      }
    });
  } catch (error) {
    console.error('Erro ao obter orçamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar orçamento
router.put('/:id', auth, [
  body('name').optional().notEmpty().withMessage('Nome não pode estar vazio'),
  body('monthlyLimit').optional().isFloat({ min: 0.01 }).withMessage('Limite mensal deve ser maior que 0'),
  body('month').optional().isInt({ min: 1, max: 12 }).withMessage('Mês deve estar entre 1 e 12'),
  body('year').optional().isInt({ min: 2020 }).withMessage('Ano inválido'),
  body('isActive').optional().isBoolean()
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

    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado'
      });
    }

    // Se estiver alterando categoria, mês ou ano, verificar duplicatas
    if (req.body.category || req.body.month || req.body.year) {
      const category = req.body.category || budget.category;
      const month = req.body.month || budget.month;
      const year = req.body.year || budget.year;

      const existingBudget = await Budget.findOne({
        _id: { $ne: req.params.id },
        userId: req.user._id,
        category,
        month,
        year
      });

      if (existingBudget) {
        return res.status(400).json({
          success: false,
          message: 'Já existe um orçamento para esta categoria neste período'
        });
      }
    }

    const updatedBudget = await Budget.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate('category');

    res.json({
      success: true,
      message: 'Orçamento atualizado com sucesso',
      data: updatedBudget
    });
  } catch (error) {
    console.error('Erro ao atualizar orçamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar orçamento
router.delete('/:id', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado'
      });
    }

    // Remover referência do orçamento das transações
    await Transaction.updateMany(
      { budgetId: req.params.id },
      { $unset: { budgetId: "" } }
    );

    await Budget.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Orçamento deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar orçamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter resumo dos orçamentos do mês atual
router.get('/current/summary', auth, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const budgets = await Budget.find({
      userId: req.user._id,
      month: currentMonth,
      year: currentYear,
      isActive: true
    }).populate('category');

    let totalBudget = 0;
    let totalSpent = 0;
    let overBudgetCount = 0;
    
    const budgetSummary = budgets.map(budget => {
      const usage = budget.monthlyLimit > 0 ? (budget.spent / budget.monthlyLimit) * 100 : 0;
      const remaining = Math.max(0, budget.monthlyLimit - budget.spent);
      const isOverBudget = budget.spent > budget.monthlyLimit;
      
      totalBudget += budget.monthlyLimit;
      totalSpent += budget.spent;
      if (isOverBudget) overBudgetCount++;

      return {
        ...budget.toObject(),
        usage: Math.min(usage, 100),
        remaining,
        isOverBudget,
        overage: isOverBudget ? budget.spent - budget.monthlyLimit : 0
      };
    });

    const totalUsage = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0;
    const totalRemaining = Math.max(0, totalBudget - totalSpent);

    res.json({
      success: true,
      summary: {
        budgets: budgetSummary,
        totals: {
          budget: totalBudget,
          spent: totalSpent,
          remaining: totalRemaining,
          usage: totalUsage,
          overBudgetCount,
          totalBudgets: budgets.length
        },
        period: {
          month: currentMonth,
          year: currentYear
        }
      }
    });
  } catch (error) {
    console.error('Erro ao obter resumo dos orçamentos:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Recalcular valores gastos de um orçamento
router.patch('/:id/recalculate', auth, async (req, res) => {
  try {
    const budget = await Budget.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!budget) {
      return res.status(404).json({
        success: false,
        message: 'Orçamento não encontrado'
      });
    }

    // Calcular total gasto baseado nas transações
    const startDate = new Date(budget.year, budget.month - 1, 1);
    const endDate = new Date(budget.year, budget.month, 0, 23, 59, 59);

    const totalSpent = await Transaction.aggregate([
      {
        $match: {
          budgetId: budget._id,
          userId: req.user._id,
          type: 'expense',
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);

    const newSpentAmount = totalSpent.length > 0 ? totalSpent[0].total : 0;

    budget.spent = newSpentAmount;
    budget.updatedAt = new Date();
    await budget.save();

    res.json({
      success: true,
      message: 'Valores recalculados com sucesso',
      data: {
        ...budget.toObject(),
        oldSpent: budget.spent,
        newSpent: newSpentAmount
      }
    });
  } catch (error) {
    console.error('Erro ao recalcular orçamento:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;