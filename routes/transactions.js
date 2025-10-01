const express = require('express');
const { body, validationResult, query } = require('express-validator');
const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');
const auth = require('../middleware/auth');

const router = express.Router();

// ✅ ROTAS ESPECÍFICAS PRIMEIRO - ADICIONADAS
// Obter resumo financeiro
router.get('/summary', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const matchFilter = { userId: req.user._id };
    
    // Apenas adiciona filtro de data se mês e ano forem fornecidos
    if (month && year) {
      const currentMonth = parseInt(month);
      const currentYear = parseInt(year);
      const startDate = new Date(currentYear, currentMonth - 1, 1);
      const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);
      
      matchFilter.date = { $gte: startDate, $lte: endDate };
    }

    const summary = await Transaction.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      income: 0,
      expense: 0,
      incomeCount: 0,
      expenseCount: 0,
      balance: 0
    };

    summary.forEach(item => {
      if (item._id === 'income') {
        result.income = item.total;
        result.incomeCount = item.count;
      } else {
        result.expense = item.total;
        result.expenseCount = item.count;
      }
    });

    result.balance = result.income - result.expense;

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro no summary:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter transações recentes
router.get('/recent', auth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;
    
    const transactions = await Transaction.find({ userId: req.user._id })
      .populate('category')
      .populate('budgetId')
      .sort({ date: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: transactions
    });
  } catch (error) {
    console.error('Erro nas transações recentes:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Criar transação
router.post('/', auth, [
  body('description').notEmpty().withMessage('Descrição é obrigatória'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que 0'),
  body('type').isIn(['income', 'expense']).withMessage('Tipo deve ser income ou expense'),
  body('category').isMongoId().withMessage('Categoria inválida'),
  body('date').optional().isISO8601().withMessage('Data inválida'),
  body('isRecurring').optional().isBoolean(),
  body('recurringDay').optional().isInt({ min: 1, max: 31 }),
  body('budgetId').optional().isMongoId()
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

    const transactionData = {
      ...req.body,
      userId: req.user._id
    };

    // Validar dia recorrente se for transação recorrente
    if (transactionData.isRecurring && !transactionData.recurringDay) {
      return res.status(400).json({
        success: false,
        message: 'Dia recorrente é obrigatório para transações recorrentes'
      });
    }

    const transaction = new Transaction(transactionData);
    await transaction.save();

    // Se for despesa e tiver orçamento, atualizar o valor gasto
    if (transaction.type === 'expense' && transaction.budgetId) {
      await Budget.findByIdAndUpdate(
        transaction.budgetId,
        { $inc: { spent: transaction.amount } }
      );
    }

    await transaction.populate(['category', 'budgetId']);

    res.status(201).json({
      success: true,
      message: 'Transação criada com sucesso',
      data: transaction
    });
  } catch (error) {
    console.error('Erro ao criar transação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Listar transações com filtros
router.get('/', auth, [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('type').optional().isIn(['income', 'expense']),
  query('category').optional().isMongoId(),
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601(),
  query('isRecurring').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros inválidos',
        errors: errors.array()
      });
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters = { userId: req.user._id };
    
    if (req.query.type) filters.type = req.query.type;
    if (req.query.category) filters.category = req.query.category;
    if (req.query.isRecurring !== undefined) filters.isRecurring = req.query.isRecurring;
    
    if (req.query.startDate && req.query.endDate) {
      filters.date = {
        $gte: new Date(req.query.startDate),
        $lte: new Date(req.query.endDate)
      };
    }

    const transactions = await Transaction.find(filters)
      .populate('category')
      .populate('budgetId')
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Transaction.countDocuments(filters);

    res.json({
      success: true,
      data: {
        data: transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
        }
      }
    });
  } catch (error) {
    console.error('Erro ao listar transações:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// ✅ ROTAS DINÂMICAS POR ÚLTIMO
// Obter transação por ID
router.get('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    }).populate(['category', 'budgetId']);

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transação não encontrada'
      });
    }

    res.json({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Erro ao obter transação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Atualizar transação
router.put('/:id', auth, [
  body('description').optional().notEmpty().withMessage('Descrição não pode estar vazia'),
  body('amount').optional().isFloat({ min: 0.01 }).withMessage('Valor deve ser maior que 0'),
  body('type').optional().isIn(['income', 'expense']).withMessage('Tipo deve ser income ou expense'),
  body('category').optional().isMongoId().withMessage('Categoria inválida'),
  body('date').optional().isISO8601().withMessage('Data inválida'),
  body('isRecurring').optional().isBoolean(),
  body('recurringDay').optional().isInt({ min: 1, max: 31 }),
  body('budgetId').optional().isMongoId()
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

    const oldTransaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!oldTransaction) {
      return res.status(404).json({
        success: false,
        message: 'Transação não encontrada'
      });
    }

    // Reverter valor do orçamento anterior se necessário
    if (oldTransaction.type === 'expense' && oldTransaction.budgetId) {
      await Budget.findByIdAndUpdate(
        oldTransaction.budgetId,
        { $inc: { spent: -oldTransaction.amount } }
      );
    }

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      req.params.id,
      { ...req.body, updatedAt: new Date() },
      { new: true }
    ).populate(['category', 'budgetId']);

    // Aplicar valor ao novo orçamento se necessário
    if (updatedTransaction.type === 'expense' && updatedTransaction.budgetId) {
      await Budget.findByIdAndUpdate(
        updatedTransaction.budgetId,
        { $inc: { spent: updatedTransaction.amount } }
      );
    }

    res.json({
      success: true,
      message: 'Transação atualizada com sucesso',
      data: updatedTransaction
    });
  } catch (error) {
    console.error('Erro ao atualizar transação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Deletar transação
router.delete('/:id', auth, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Transação não encontrada'
      });
    }

    // Reverter valor do orçamento se necessário
    if (transaction.type === 'expense' && transaction.budgetId) {
      await Budget.findByIdAndUpdate(
        transaction.budgetId,
        { $inc: { spent: -transaction.amount } }
      );
    }

    await Transaction.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Transação deletada com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar transação:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Manter a rota de overview que já existia
router.get('/summary/overview', auth, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate && endDate) {
      dateFilter.date = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const summary = await Transaction.aggregate([
      {
        $match: {
          userId: req.user._id,
          ...dateFilter
        }
      },
      {
        $group: {
          _id: '$type',
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const result = {
      income: 0,
      expense: 0,
      incomeCount: 0,
      expenseCount: 0,
      balance: 0
    };

    summary.forEach(item => {
      if (item._id === 'income') {
        result.income = item.total;
        result.incomeCount = item.count;
      } else {
        result.expense = item.total;
        result.expenseCount = item.count;
      }
    });

    result.balance = result.income - result.expense;

    res.json({
      success: true,
      summary: result
    });
  } catch (error) {
    console.error('Erro ao obter resumo:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;