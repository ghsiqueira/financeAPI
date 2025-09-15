const nodemailer = require('nodemailer');
require('dotenv').config();

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransporter({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT),
      secure: process.env.MAIL_ENCRYPTION === 'ssl',
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD
      }
    });
  }

  // Enviar email de recuperação de senha
  async sendPasswordResetEmail(email, resetToken, userName) {
    try {
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
      
      const mailOptions = {
        from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
        to: email,
        subject: 'Recuperação de Senha - Finance App',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">💰 Finance App</h1>
              <p style="color: white; margin: 10px 0 0 0;">Recuperação de Senha</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Olá, ${userName}!</h2>
              
              <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
                Recebemos uma solicitação para redefinir a senha da sua conta. 
                Se você não fez esta solicitação, pode ignorar este email com segurança.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" 
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; 
                          padding: 15px 30px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          display: inline-block;
                          font-weight: bold;">
                  Redefinir Senha
                </a>
              </div>
              
              <p style="color: #777; font-size: 14px; line-height: 1.6;">
                <strong>⚠️ Importante:</strong><br>
                • Este link expira em 1 hora<br>
                • Use apenas se você solicitou a recuperação<br>
                • Nunca compartilhe este link com outras pessoas
              </p>
              
              <hr style="border: none; border-top: 1px solid #ddd; margin: 25px 0;">
              
              <p style="color: #999; font-size: 12px; text-align: center;">
                Se o botão não funcionar, copie e cole este link no navegador:<br>
                <span style="word-break: break-all;">${resetUrl}</span>
              </p>
            </div>
            
            <div style="background: #333; padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © 2024 Finance App - Controle suas finanças com inteligência
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de recuperação enviado:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar email:', error);
      throw error;
    }
  }

  // Enviar email de boas-vindas
  async sendWelcomeEmail(email, userName) {
    try {
      const mailOptions = {
        from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
        to: email,
        subject: 'Bem-vindo ao Finance App! 🎉',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">💰 Finance App</h1>
              <p style="color: white; margin: 10px 0 0 0;">Bem-vindo à bordo!</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px 20px;">
              <h2 style="color: #333; margin-bottom: 20px;">Olá, ${userName}! 🎉</h2>
              
              <p style="color: #555; line-height: 1.6; margin-bottom: 25px;">
                Que alegria ter você conosco! Sua conta foi criada com sucesso e você já pode começar a controlar suas finanças de forma inteligente.
              </p>
              
              <div style="background: white; border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 0 8px 8px 0;">
                <h3 style="color: #333; margin: 0 0 15px 0;">🚀 O que você pode fazer:</h3>
                <ul style="color: #555; margin: 0; padding-left: 20px;">
                  <li style="margin-bottom: 8px;">💳 Registrar suas transações diárias</li>
                  <li style="margin-bottom: 8px;">🎯 Criar metas de economia</li>
                  <li style="margin-bottom: 8px;">💰 Definir orçamentos mensais</li>
                  <li style="margin-bottom: 8px;">📊 Acompanhar relatórios detalhados</li>
                  <li style="margin-bottom: 8px;">🔄 Configurar transações recorrentes</li>
                </ul>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <p style="color: #777; margin-bottom: 15px;">Comece agora mesmo:</p>
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" 
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                          color: white; 
                          padding: 15px 30px; 
                          text-decoration: none; 
                          border-radius: 8px; 
                          display: inline-block;
                          font-weight: bold;">
                  Acessar App
                </a>
              </div>
              
              <p style="color: #777; font-size: 14px; line-height: 1.6; text-align: center;">
                💡 <strong>Dica:</strong> Comece registrando algumas transações do mês atual para ter uma visão completa dos seus gastos!
              </p>
            </div>
            
            <div style="background: #333; padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © 2024 Finance App - Seu parceiro financeiro
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de boas-vindas enviado:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar email de boas-vindas:', error);
      throw error;
    }
  }

  // Enviar email de notificação de meta atingida
  async sendGoalAchievedEmail(email, userName, goalTitle, goalAmount) {
    try {
      const mailOptions = {
        from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
        to: email,
        subject: '🎉 Parabéns! Meta atingida - Finance App',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); padding: 40px 20px; text-align: center;">
              <h1 style="color: white; margin: 0;">🎯 Meta Atingida!</h1>
              <p style="color: white; margin: 10px 0 0 0;">Finance App</p>
            </div>
            
            <div style="background: #f8f9fa; padding: 30px 20px; text-align: center;">
              <h2 style="color: #333; margin-bottom: 20px;">Parabéns, ${userName}! 🎉</h2>
              
              <div style="background: linear-gradient(135deg, #4CAF50 0%, #45a049 100%); color: white; padding: 30px; border-radius: 12px; margin: 25px 0;">
                <h3 style="margin: 0 0 10px 0; font-size: 24px;">🏆</h3>
                <h3 style="margin: 0 0 10px 0;">${goalTitle}</h3>
                <p style="margin: 0; font-size: 18px; font-weight: bold;">R$ ${goalAmount.toFixed(2)}</p>
              </div>
              
              <p style="color: #555; line-height: 1.6; margin: 25px 0;">
                Você conseguiu! Sua dedicação e disciplina financeira deram resultado. 
                Esta conquista é prova de que você está no caminho certo para a independência financeira.
              </p>
              
              <p style="color: #777; font-size: 14px; margin-top: 30px;">
                Continue assim e defina novas metas ainda mais ambiciosas! 💪
              </p>
            </div>
            
            <div style="background: #333; padding: 20px; text-align: center;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                © 2024 Finance App - Comemore suas vitórias financeiras!
              </p>
            </div>
          </div>
        `
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log('✅ Email de meta atingida enviado:', result.messageId);
      return result;
    } catch (error) {
      console.error('❌ Erro ao enviar email de meta atingida:', error);
      throw error;
    }
  }

  // Testar conexão do email
  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('✅ Servidor de email conectado e funcionando');
      return true;
    } catch (error) {
      console.error('❌ Erro na conexão com servidor de email:', error);
      return false;
    }
  }
}

module.exports = new EmailService();