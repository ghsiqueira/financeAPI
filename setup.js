const mongoose = require('mongoose');
const Category = require('./models/Category');
require('dotenv').config();

// Categorias padrão do sistema
const defaultCategories = [
  // Receitas
  { name: 'Salário', icon: '💼', color: '#4CAF50', type: 'income', isDefault: true },
  { name: 'Freelance', icon: '💻', color: '#2196F3', type: 'income', isDefault: true },
  { name: 'Investimentos', icon: '📈', color: '#FF9800', type: 'income', isDefault: true },
  { name: 'Bonificação', icon: '🎁', color: '#9C27B0', type: 'income', isDefault: true },
  { name: 'Venda', icon: '💰', color: '#607D8B', type: 'income', isDefault: true },
  
  // Despesas
  { name: 'Alimentação', icon: '🍽️', color: '#FF5722', type: 'expense', isDefault: true },
  { name: 'Transporte', icon: '🚗', color: '#9C27B0', type: 'expense', isDefault: true },
  { name: 'Moradia', icon: '🏠', color: '#795548', type: 'expense', isDefault: true },
  { name: 'Saúde', icon: '🏥', color: '#F44336', type: 'expense', isDefault: true },
  { name: 'Educação', icon: '📚', color: '#3F51B5', type: 'expense', isDefault: true },
  { name: 'Lazer', icon: '🎬', color: '#E91E63', type: 'expense', isDefault: true },
  { name: 'Roupas', icon: '👕', color: '#00BCD4', type: 'expense', isDefault: true },
  { name: 'Tecnologia', icon: '📱', color: '#009688', type: 'expense', isDefault: true },
  { name: 'Combustível', icon: '⛽', color: '#FF9800', type: 'expense', isDefault: true },
  { name: 'Serviços', icon: '🔧', color: '#607D8B', type: 'expense', isDefault: true },
  { name: 'Outros', icon: '💰', color: '#607D8B', type: 'expense', isDefault: true }
];

async function setupDatabase() {
  try {
    console.log('🚀 Iniciando configuração da base de dados...');
    
    // Verificar se a variável de ambiente existe
    if (!process.env.MONGODB_URI) {
      console.error('❌ MONGODB_URI não encontrada no arquivo .env');
      console.log('💡 Certifique-se de ter um arquivo .env com:');
      console.log('   MONGODB_URI=sua_string_de_conexao_aqui');
      process.exit(1);
    }
    
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGODB_URI);

    console.log('✅ Conectado ao MongoDB');

    // Verificar se as categorias padrão já existem
    const existingCategories = await Category.find({ isDefault: true });
    
    if (existingCategories.length > 0) {
      console.log(`⚠️ ${existingCategories.length} categorias padrão já existem`);
      console.log('Deseja recriar todas as categorias? (isso removerá as existentes)');
      
      // Em produção, você pode querer um prompt aqui
      // Para este script, vamos apenas pular se já existirem
      console.log('📋 Pulando criação de categorias padrão (já existem)');
    } else {
      // Criar categorias padrão
      console.log('📂 Criando categorias padrão...');
      
      await Category.insertMany(defaultCategories.map(cat => ({
        ...cat,
        userId: null // null indica categoria do sistema
      })));

      console.log(`✅ ${defaultCategories.length} categorias padrão criadas`);
    }

    // Criar índices se necessário
    console.log('🗂️ Criando índices...');
    
    // Índice para orçamentos únicos por usuário/categoria/período
    await mongoose.connection.collection('budgets').createIndex(
      { userId: 1, category: 1, month: 1, year: 1 }, 
      { unique: true }
    );

    // Índice para transações por usuário e data
    await mongoose.connection.collection('transactions').createIndex(
      { userId: 1, date: -1 }
    );

    // Índice para transações recorrentes
    await mongoose.connection.collection('transactions').createIndex(
      { isRecurring: 1, recurringDay: 1 }
    );

    console.log('✅ Índices criados');

    console.log('🎉 Configuração da base de dados concluída!');
    console.log('\n📊 Resumo:');
    console.log(`   • ${defaultCategories.filter(c => c.type === 'income').length} categorias de receita`);
    console.log(`   • ${defaultCategories.filter(c => c.type === 'expense').length} categorias de despesa`);
    console.log(`   • Base de dados configurada e pronta para uso`);
    console.log('\n🚀 Você pode agora iniciar o servidor com: npm run dev');

  } catch (error) {
    console.error('❌ Erro na configuração:', error);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Desconectado do MongoDB');
  }
}

// Executar setup se chamado diretamente
if (require.main === module) {
  setupDatabase();
}

module.exports = { setupDatabase, defaultCategories };