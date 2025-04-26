import { GeminiService } from '../../services/gemini/GeminiService.js';

/**
 * Controlador para gestionar solicitudes al servicio de Gemini
 * @class GeminiManager
 */
class GeminiManager {
  constructor() {
    this.geminiService = new GeminiService();
  }

  /**
   * Procesa un mensaje entrante con múltiples tipos de contenido en paralelo
   * @param {Object} req - Objeto de solicitud Express
   * @param {Object} res - Objeto de respuesta Express
   */
  async processMessage(req, res) {
    try {
      // Obtener datos del mensaje del cuerpo de la solicitud
      const messageData = req.body;
      
      // Validar que el formato del mensaje sea válido
      if (!messageData || !messageData.sessionId || !messageData.chatId) {
        return res.status(400).json({
          status: "error",
          message: "Formato de mensaje inválido. Se requieren sessionId y chatId"
        });
      }
      
      // Verificar si al menos un tipo de contenido está presente
      const { message, image, audio, video, sticker, document } = messageData;
      if (!message && !image && !audio && !video && !sticker && !document) {
        return res.status(400).json({
          status: "error",
          message: "El mensaje debe contener al menos un tipo de contenido (texto, imagen, audio, video, sticker o documento)"
        });
      }
      
      // Procesar el mensaje con el servicio de Gemini
      const result = await this.geminiService.processMessage(messageData);
      
      // Devolver el resultado procesado
      return res.status(200).json(result);
    } catch (error) {
      console.error("Error al procesar mensaje con Gemini:", error);
      return res.status(500).json({
        status: "error",
        message: "Error al procesar el mensaje",
        error: error.message
      });
    }
  }
}

export default GeminiManager;
