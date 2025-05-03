import TelegramManager from '../controllers/telegram/TelegramManager.js';
import WhatsAppManager from '../controllers/whatsapp/WhatsappManager.js';
import telegramRoutes from './routes/telegram/telegram.routes.js';
import whatsappRoutes from './routes/whatsapp/whatsapp.routes.js';
import geminiRoutes from './routes/gemini/gemini.routes.js';
import Database from '../database/Database.js';
import bodyParser from 'body-parser';
import express from 'express';

const app = express();
app.use(bodyParser.json({ limit: '20mb' }));

app.use('/api/telegram', telegramRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/gemini', geminiRoutes);

app.post('/api/dev/create-account', async (req, res) => {
  try {
    const result = await Database.createAccount();
    return res.status(201).json({
      success: true,
      accountId: result.accountId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(2511, () => {
  console.log(`Servidor escuchando en el puerto 2511`);
});