const Transaction = require('../models/Transaction');
const Budget = require('../models/Budget');

class RecurringService {
  // Processar todas as transações recorrentes
  async processRecurringTransactions() {
    try {
      const today = new Date();
      const currentDay = today.getDate();

      console.log(`🔄 Processando transações recorrentes para o dia ${currentDay}`);

      // Buscar todas as transações recorrentes que devem ser executadas hoje
      const recurringTransactions = await Transaction.find({
        isRecurring: true,
        recurringDay: currentDay
      }).populate(['category', 'budgetId', 'userId']);

      if (recurringTransactions.length === 0) {
        console.log('✅ Nenhuma transação recorrente encontrada para hoje');
        return;
      }

      const results = {
        processed: 0,
        errors: 0,
        details: []
      };

      for (const originalTransaction of recurringTransactions) {
        try {
          // Verificar se já foi processada hoje
          const alreadyProcessed = await this.wasProcessedToday(originalTransaction);
          
          if (alreadyProcessed) {
            console.log(`⏭️ Transação recorrente ${originalTransaction._id} já foi processada hoje`);
            continue;
          }

          // Criar nova transação baseada na recorrente
          const newTransaction = new Transaction({
            userId: originalTransaction.userId._id,
            description: `${originalTransaction.description} (Recorrente)`,
            amount: originalTransaction.amount,
            type: originalTransaction.type,
            category: originalTransaction.category._id,
            date: new Date(),
            isRecurring: false, // A nova transação não é recorrente
            budgetId: originalTransaction.budgetId?._id
          });

          await newTransaction.save();

          // Se for despesa e tiver orçamento, atualizar o valor gasto
          if (newTransaction.type === 'expense' && newTransaction.budgetId) {
            await Budget.findByIdAndUpdate(
              newTransaction.budgetId,
              { $inc: { spent: newTransaction.amount } }
            );
          }

          results.processed++;
          results.details.push({
            originalId: originalTransaction._id,
            newId: newTransaction._id,
            description: newTransaction.description,
            amount: newTransaction.amount,
            type: newTransaction.type,
            status: 'success'
          });

          console.log(`✅ Transação recorrente processada: ${newTransaction.description} - R$ ${newTransaction.amount}`);

        } catch (error) {
          results.errors++;
          results.details.push({
            originalId: originalTransaction._id,
            error: error.message,
            status: 'error'
          });
          console.error(`❌ Erro ao processar transação recorrente ${originalTransaction._id}:`, error);
        }
      }

      console.log(`✅ Processamento concluído: ${results.processed} sucessos, ${results.errors} erros`);
      return results;

    } catch (error) {
      console.error('❌ Erro no processamento geral de transações recorrentes:', error);
      throw error;
    }
  }

  // Verificar se uma transação recorrente já foi processada hoje
  async wasProcessedToday(recurringTransaction) {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);

    // Procurar por uma transação criada hoje baseada na recorrente
    const existingTransaction = await Transaction.findOne({
      userId: recurringTransaction.userId._id,
      description: { $regex: `^${recurringTransaction.description} \\(Recorrente\\)$` },
      amount: recurringTransaction.amount,
      type: recurringTransaction.type,
      category: recurringTransaction.category._id,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      isRecurring: false
    });

    return !!existingTransaction;
  }

  // Criar transação recorrente (método auxiliar)
  async createRecurringTransaction(transactionData, recurringDay) {
    try {
      const transaction = new Transaction({
        ...transactionData,
        isRecurring: true,
        recurringDay: recurringDay
      });

      await transaction.save();
      
      console.log(`📅 Transação recorrente criada: ${transaction.description} - Dia ${recurringDay}`);
      return transaction;
    } catch (error) {
      console.error('❌ Erro ao criar transação recorrente:', error);
      throw error;
    }
  }

  // Listar próximas transações recorrentes
  async getUpcomingRecurringTransactions(userId, days = 30) {
    try {
      const recurringTransactions = await Transaction.find({
        userId: userId,
        isRecurring: true
      }).populate(['category', 'budgetId']);

      const today = new Date();
      const currentDay = today.getDate();
      const upcoming = [];

      for (const transaction of recurringTransactions) {
        const recurringDay = transaction.recurringDay;
        
        // Calcular próximas datas nos próximos 'days' dias
        for (let i = 0; i <= days; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(today.getDate() + i);
          
          if (checkDate.getDate() === recurringDay) {
            // Verificar se não foi processada nesta data
            const wasProcessed = await this.wasProcessedOnDate(transaction, checkDate);
            
            if (!wasProcessed) {
              upcoming.push({
                ...transaction.toObject(),
                nextDate: checkDate,
                daysUntil: i
              });
            }
          }
        }
      }

      return upcoming.sort((a, b) => a.nextDate - b.nextDate);
    } catch (error) {
      console.error('❌ Erro ao obter próximas transações recorrentes:', error);
      throw error;
    }
  }

  // Verificar se foi processada em uma data específica
  async wasProcessedOnDate(recurringTransaction, date) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59);

    const existingTransaction = await Transaction.findOne({
      userId: recurringTransaction.userId,
      description: { $regex: `^${recurringTransaction.description} \\(Recorrente\\)$` },
      amount: recurringTransaction.amount,
      type: recurringTransaction.type,
      category: recurringTransaction.category._id,
      date: {
        $gte: startOfDay,
        $lte: endOfDay
      },
      isRecurring: false
    });

    return !!existingTransaction;
  }

  // Pausar transação recorrente
  async pauseRecurringTransaction(transactionId, userId) {
    try {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        userId: userId,
        isRecurring: true
      });

      if (!transaction) {
        throw new Error('Transação recorrente não encontrada');
      }

      // Adicionar campo para marcar como pausada
      transaction.isPaused = true;
      await transaction.save();

      console.log(`⏸️ Transação recorrente pausada: ${transaction.description}`);
      return transaction;
    } catch (error) {
      console.error('❌ Erro ao pausar transação recorrente:', error);
      throw error;
    }
  }

  // Reativar transação recorrente
  async resumeRecurringTransaction(transactionId, userId) {
    try {
      const transaction = await Transaction.findOne({
        _id: transactionId,
        userId: userId,
        isRecurring: true
      });

      if (!transaction) {
        throw new Error('Transação recorrente não encontrada');
      }

      transaction.isPaused = false;
      await transaction.save();

      console.log(`▶️ Transação recorrente reativada: ${transaction.description}`);
      return transaction;
    } catch (error) {
      console.error('❌ Erro ao reativar transação recorrente:', error);
      throw error;
    }
  }

  // Obter estatísticas de transações recorrentes
  async getRecurringStats(userId) {
    try {
      const stats = await Transaction.aggregate([
        {
          $match: {
            userId: userId,
            isRecurring: true
          }
        },
        {
          $group: {
            _id: '$type',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        }
      ]);

      const result = {
        income: { count: 0, totalAmount: 0 },
        expense: { count: 0, totalAmount: 0 },
        total: { count: 0, totalAmount: 0 }
      };

      stats.forEach(stat => {
        result[stat._id] = {
          count: stat.count,
          totalAmount: stat.totalAmount
        };
        result.total.count += stat.count;
        result.total.totalAmount += Math.abs(stat.totalAmount);
      });

      // Projeção mensal
      result.monthlyProjection = {
        income: result.income.totalAmount,
        expense: result.expense.totalAmount,
        net: result.income.totalAmount - result.expense.totalAmount
      };

      return result;
    } catch (error) {
      console.error('❌ Erro ao obter estatísticas de transações recorrentes:', error);
      throw error;
    }
  }
}

module.exports = new RecurringService();