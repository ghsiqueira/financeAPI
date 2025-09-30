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
const goalShareRoutes = require('./routes/goalShares');

// Carregar recurring service com debug
let recurringService = null;
try {
  recurringService = require('./services/recurringService');
  console.log('✅ Serviço de transações recorrentes carregado');
} catch (error) {
  console.log('⚠️ Serviço de transações recorrentes não encontrado:', error.message);
  console.log('💡 Isso é normal se o arquivo não existir ainda');
}

const app = express();
const PORT = process.env.PORT || 5000;

// Debug: Mostrar variáveis de ambiente importantes
console.log('🔍 DEBUG - Configurações:');
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   PORT:', PORT);
console.log('   MONGODB_URI existe:', !!process.env.MONGODB_URI);
console.log('   JWT_SECRET existe:', !!process.env.JWT_SECRET);

// Middleware de debug para todas as requisições
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`\n📥 [${timestamp}] ${req.method} ${req.path}`);
  console.log('   Headers:', JSON.stringify(req.headers, null, 2));
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('   Body:', JSON.stringify(req.body, null, 2));
  }
  
  if (req.query && Object.keys(req.query).length > 0) {
    console.log('   Query:', JSON.stringify(req.query, null, 2));
  }
  
  // Debug para response
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`📤 [${timestamp}] Response ${res.statusCode}:`, 
      typeof data === 'string' ? data.substring(0, 200) + '...' : JSON.stringify(data).substring(0, 200) + '...');
    originalSend.call(this, data);
  };
  
  next();
});

// Middleware básico
app.use(cors({
  origin: ['http://localhost:3000', 'http://10.0.2.2:5000'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Conectar ao MongoDB
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI não encontrada no arquivo .env');
  console.log('💡 Certifique-se de ter um arquivo .env com:');
  console.log('   MONGODB_URI=sua_string_de_conexao_aqui');
  process.exit(1);
}

// Debug: Tentar conectar ao MongoDB
console.log('🔄 Tentando conectar ao MongoDB...');
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Conectado ao MongoDB com sucesso');
  console.log('   Database:', mongoose.connection.name);
  console.log('   Host:', mongoose.connection.host);
  console.log('   Port:', mongoose.connection.port);
  
  // Listar collections existentes
  mongoose.connection.db.listCollections().toArray()
    .then(collections => {
      console.log('📦 Collections encontradas:', collections.map(c => c.name));
    })
    .catch(err => console.log('⚠️ Erro ao listar collections:', err.message));
})
.catch(err => {
  console.error('❌ Erro ao conectar ao MongoDB:', err.message);
  console.error('🔍 Detalhes do erro:', err);
  process.exit(1);
});

// Debug: Eventos do MongoDB
mongoose.connection.on('error', (err) => {
  console.error('❌ Erro de conexão MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB desconectado');
});

mongoose.connection.on('reconnected', () => {
  console.log('🔄 MongoDB reconectado');
});

// Rota de teste raiz
app.get('/', (req, res) => {
  const response = { 
    message: '🚀 Finance API funcionando!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    mongodb: mongoose.connection.readyState === 1 ? 'conectado' : 'desconectado'
  };
  console.log('🏠 Rota raiz acessada:', response);
  res.json(response);
});

// Rota de health check
app.get('/api/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    memory: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  };
  console.log('🏥 Health check:', health);
  res.json(health);
});

// Middleware de debug para rotas da API
app.use('/api/*', (req, res, next) => {
  console.log(`🛣️ Rota da API chamada: ${req.method} ${req.originalUrl}`);
  next();
});

// Routes com debug
console.log('📋 Registrando rotas...');

try {
  app.use('/api/auth', authRoutes);
  console.log('✅ Rotas de auth registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de auth:', error.message);
}

try {
  app.use('/api/transactions', transactionRoutes);
  console.log('✅ Rotas de transactions registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de transactions:', error.message);
}

try {
  app.use('/api/goals', goalRoutes);
  console.log('✅ Rotas de goals registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de goals:', error.message);
}

try {
  app.use('/api/budgets', budgetRoutes);
  console.log('✅ Rotas de budgets registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de budgets:', error.message);
}

try {
  app.use('/api/categories', categoryRoutes);
  console.log('✅ Rotas de categories registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de categories:', error.message);
}

// ✅ NOVO: Rotas de compartilhamento de metas
try {
  app.use('/api', goalShareRoutes);
  console.log('✅ Rotas de goal-shares registradas');
} catch (error) {
  console.error('❌ Erro ao registrar rotas de goal-shares:', error.message);
}

// Middleware para capturar rotas não encontradas
app.use('/api/*', (req, res) => {
  console.log(`❌ Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    success: false,
    message: `Rota não encontrada: ${req.method} ${req.originalUrl}`,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'POST /api/auth/login',
      'POST /api/auth/register',
      'GET /api/transactions',
      'GET /api/transactions/summary',
      'GET /api/transactions/recent',
      'GET /api/goals',
      'GET /api/goals/active',
      'POST /api/goals/:goalId/share',
      'GET /api/goals/:goalId/shares',
      'GET /api/goal-shares/pending',
      'GET /api/goal-shares/accepted',
      'POST /api/goal-shares/:shareId/accept',
      'POST /api/goal-shares/:shareId/reject',
      'DELETE /api/goal-shares/:shareId',
      'PATCH /api/goal-shares/:shareId/role',
      'GET /api/budgets',
      'GET /api/budgets/current',
      'GET /api/categories'
    ]
  });
});

// Middleware global de tratamento de erros
app.use((error, req, res, next) => {
  console.error('💥 Erro global capturado:');
  console.error('   URL:', req.originalUrl);
  console.error('   Método:', req.method);
  console.error('   Erro:', error.message);
  console.error('   Stack:', error.stack);
  
  res.status(500).json({
    success: false,
    message: 'Erro interno do servidor',
    error: process.env.NODE_ENV === 'development' ? {
      message: error.message,
      stack: error.stack
    } : undefined,
    timestamp: new Date().toISOString()
  });
});

// Cron job para transações recorrentes
if (recurringService) {
  console.log('⏰ Configurando cron job para transações recorrentes...');
  
  cron.schedule('1 0 * * *', async () => {
    const timestamp = new Date().toISOString();
    console.log(`\n🔄 [${timestamp}] Iniciando processamento de transações recorrentes...`);
    
    try {
      const startTime = Date.now();
      const result = await recurringService.processRecurringTransactions();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log(`✅ [${timestamp}] Processamento concluído com sucesso!`);
      console.log(`   Duração: ${duration}ms`);
      console.log(`   Resultado:`, result);
      
    } catch (error) {
      console.error(`❌ [${timestamp}] Erro no processamento de transações recorrentes:`);
      console.error('   Erro:', error.message);
      console.error('   Stack:', error.stack);
    }
  }, {
    scheduled: true,
    timezone: "America/Sao_Paulo"
  });
  
  console.log('✅ Cron job configurado para executar todo dia às 00:01 (horário de Brasília)');
  
  if (process.env.NODE_ENV === 'development') {
    app.get('/api/debug/test-recurring', async (req, res) => {
      console.log('🧪 Teste manual de transações recorrentes iniciado...');
      
      try {
        const startTime = Date.now();
        const result = await recurringService.processRecurringTransactions();
        const endTime = Date.now();
        
        console.log('✅ Teste de transações recorrentes concluído');
        
        res.json({
          success: true,
          message: 'Teste de transações recorrentes executado',
          result,
          duration: `${endTime - startTime}ms`,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('❌ Erro no teste de transações recorrentes:', error);
        
        res.status(500).json({
          success: false,
          message: 'Erro no teste de transações recorrentes',
          error: {
            message: error.message,
            name: error.name,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          },
          timestamp: new Date().toISOString()
        });
      }
    });
    
    console.log('🧪 Rota de teste adicionada: GET /api/debug/test-recurring');
  }
  
} else {
  console.log('⚠️ Cron job NÃO configurado - serviço de transações recorrentes não disponível');
}

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Recebido ${signal}. Fechando servidor graciosamente...`);
  
  mongoose.connection.close(() => {
    console.log('✅ Conexão MongoDB fechada');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  console.error('💥 Exceção não capturada:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Promise rejeitada não tratada:', reason);
  console.error('   Promise:', promise);
  process.exit(1);
});

// Iniciar servidor
const server = app.listen(PORT, () => {
  console.log('\n🚀 Servidor iniciado com sucesso!');
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Timestamp: ${new Date().toISOString()}`);
  console.log('\n📱 Para testar no Android Emulator use: http://10.0.2.2:5000');
  console.log('\n✨ API pronta para receber requisições!');
});

server.on('error', (error) => {
  console.error('❌ Erro do servidor:', error);
});

server.on('close', () => {
  console.log('🔐 Servidor fechado');
});

module.exports = app;