import TelegramManager from '../controllers/telegram/telegram-manager.js'
import telegramRoutes from './routes/telegram/routes.js'
import Database from '../database/database.js'
import bodyParser from 'body-parser';
import express from 'express';

const app = express();
app.use(bodyParser.json());

// Montar las rutas
app.use('/api/telegram', telegramRoutes);

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});