const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const goalRoutes = require('./routes/goals');
const budgetRoutes = require('./routes/budgets');
const categoryRoutes = require('./routes/categories');
const recurringService = require('./services/recurringService');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Conectar ao MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI não encontrada no arquivo .env');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ Conectado ao MongoDB'))
.catch(err => {
  console.error('❌ Erro ao conectar MongoDB:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/budgets', budgetRoutes);
app.use('/api/categories', categoryRoutes);

// Rota de teste
app.get('/', (req, res) => {
  res.json({ message: '🚀 Finance API funcionando!' });
});

// Cron job para transações recorrentes - executa todo dia às 00:01
cron.schedule('1 0 * * *', () => {
  console.log('🔄 Executando processamento de transações recorrentes...');
  recurringService.processRecurringTransactions();
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});