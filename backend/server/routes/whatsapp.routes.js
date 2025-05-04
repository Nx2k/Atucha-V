import WhatsAppManager from '../../controllers/whatsapp.controller.js';
import express from 'express';

const router = express.Router();

// GET: Listar todas las sesiones activas
router.get('/sessions', (req, res) => {
  const sessions = WhatsAppManager.listSessions();
  res.status(200).json({ success: true, sessions });
});

// POST: Crear una nueva sesión
router.post('/sessions', async (req, res) => {
    try {
      const { sessionId, authMethod, phoneNumber, accountId } = req.body;
      if (!sessionId || !authMethod || !['qr', 'pairing'].includes(authMethod) || !accountId) {
        return res.status(400).json({
          success: false,
          error: 'Faltan parámetros o authMethod inválido (qr/pairing)',
        });
      }
      if (authMethod === 'pairing' && !phoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'phoneNumber requerido para pairing',
        });
      }
      const result = await WhatsAppManager.createSession(sessionId, authMethod, phoneNumber, accountId);
      return res.status(202).json({
        success: true,
        message: `Sesión ${sessionId} iniciada`,
        sessionId,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

// POST: Enviar mensaje desde una sesión
router.post('/sessions/:sessionId/send', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { chatId, message } = req.body;
    if (!chatId || !message) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren chatId y message',
      });
    }
    const result = await WhatsAppManager.sendMessage(sessionId, chatId, message);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// POST: Eliminar una sesión específica
router.post('/sessions/:sessionId/delete', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await WhatsAppManager.deleteSession(sessionId);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;