import TelegramManager from '../../controllers/telegram.controller.js'
import express from 'express';

const router = express.Router();

// Endpoint para ver todas las sesiones activas
router.get('/sessions', (req, res) => {
  const sessions = TelegramManager.listSessions();
  res.status(200).json({
    success: true,
    sessions: sessions
  });
});

// Endpoint para crear una nueva sesión
router.post('/sessions', async (req, res) => {
  try {
    const { sessionId, apiId, apiHash, phoneNumber, accountId } = req.body;
    
    if (!sessionId || !apiId || !apiHash || !phoneNumber || !accountId) {
      return res.status(400).json({
        success: false,
        error: "Faltan parámetros requeridos"
      });
    }
    
    await TelegramManager.createSession(
      sessionId,
      apiId,
      apiHash,
      phoneNumber,
      accountId
    );
    
    return res.status(202).json({
      success: true,
      message: `Sesión ${sessionId} iniciada, requiere verificación`,
      requiresPhoneCode: true,
      sessionId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para verificar una sesión con phoneCode
router.post('/sessions/:sessionId/verify', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { phoneCode } = req.body;
    
    if (!phoneCode) {
      return res.status(400).json({
        success: false,
        error: "Se requiere phoneCode"
      });
    }
    
    await TelegramManager.verifySession(sessionId, phoneCode);
    return res.status(200).json({
      success: true,
      message: `Sesión ${sessionId} verificada correctamente`
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para enviar mensajes desde una sesión específica
router.post('/sessions/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { chatId, message } = req.body;
    
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        error: "Se requieren chatId y message"
      });
    }
    
    const result = await TelegramManager.sendMessage(sessionId, parseInt(chatId), message);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint para eliminar una sesión específica
router.post('/sessions/:sessionId/delete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await TelegramManager.deleteSession(sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message})}
});

export default router;