import express from 'express';
import GeminiManager from '../../../controllers/gemini/GeminiManager.js';

const router = express.Router();
const geminiManager = new GeminiManager();

/**
 * @route POST /api/gemini/process
 * @description Procesa un mensaje con múltiples tipos de contenido en paralelo
 * @body {
 *   sessionId: string,
 *   chatId: string,
 *   message: string (opcional),
 *   image: object (opcional),
 *   audio: object (opcional),
 *   video: object (opcional),
 *   sticker: object (opcional),
 *   document: object (opcional)
 * }
 * @returns {Object} Resultados del procesamiento
 */
router.post('/process', geminiManager.processMessage.bind(geminiManager));

export default router;