const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Category = require('../models/Category');
const auth = require('../middleware/auth');

const router = express.Router();

// Função para gerar JWT
const generateToken = (userId) => {
  return jwt.sign(
    { userId }, 
    process.env.JWT_SECRET || 'sua_chave_secreta_super_segura_aqui_2024',
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Função para criar categorias padrão
const createDefaultCategories = async (userId) => {
  const defaultCategories = [
    // Receitas
    { name: 'Salário', icon: '💼', color: '#4CAF50', type: 'income', isDefault: true },
    { name: 'Freelance', icon: '💻', color: '#2196F3', type: 'income', isDefault: true },
    { name: 'Investimentos', icon: '📈', color: '#FF9800', type: 'income', isDefault: true },
    
    // Despesas
    { name: 'Alimentação', icon: '🍽️', color: '#FF5722', type: 'expense', isDefault: true },
    { name: 'Transporte', icon: '🚗', color: '#9C27B0', type: 'expense', isDefault: true },
    { name: 'Moradia', icon: '🏠', color: '#795548', type: 'expense', isDefault: true },
    { name: 'Saúde', icon: '🏥', color: '#F44336', type: 'expense', isDefault: true },
    { name: 'Educação', icon: '📚', color: '#3F51B5', type: 'expense', isDefault: true },
    { name: 'Lazer', icon: '🎬', color: '#E91E63', type: 'expense', isDefault: true },
    { name: 'Outros', icon: '💰', color: '#607D8B', type: 'expense', isDefault: true }
  ];

  const categories = defaultCategories.map(cat => ({
    ...cat,
    userId: userId
  }));

  await Category.insertMany(categories);
};

// Registro
router.post('/register', [
  body('name').notEmpty().withMessage('Nome é obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter pelo menos 6 caracteres')
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

    const { name, email, password } = req.body;

    // Verificar se usuário já existe
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Usuário já existe com este email'
      });
    }

    // Criar usuário
    const user = new User({ name, email, password });
    await user.save();

    // Criar categorias padrão
    await createDefaultCategories(user._id);

    // Gerar token
    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      message: 'Usuário criado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Erro no registro:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Login
router.post('/login', [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').notEmpty().withMessage('Senha é obrigatória')
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

    const { email, password } = req.body;

    // Encontrar usuário
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Verificar senha
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Credenciais inválidas'
      });
    }

    // Gerar token
    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login realizado com sucesso',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

// Obter perfil do usuário
router.get('/profile', auth, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        createdAt: req.user.createdAt
      }
    });
  } catch (error) {
    console.error('Erro ao obter perfil:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor'
    });
  }
});

module.exports = router;