import { GeminiService } from '../../services/gemini/GeminiService.js';
import Database from '../../database/Database.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultApiKeyPath = path.join(__dirname, '../../../apikey.txt');
const DEFAULT_API_KEY = existsSync(defaultApiKeyPath) ? readFileSync(defaultApiKeyPath, 'utf-8').trim() : '';

class GeminiManager {
  constructor() {
    this.instances = new Map();
    Database.initialize().catch(() => {});
  }

  async getOrCreateInstance(accountId) {
    if (this.instances.has(accountId)) return this.instances.get(accountId);

    const account = await Database.getAccount(accountId);
    if (!account) throw new Error(`No existe una cuenta con el ID: ${accountId}`);

    const geminiKeyData = await Database.getGeminiKey(accountId);
    const apiKey = geminiKeyData?.apiKey || DEFAULT_API_KEY;
    await Database.saveGeminiKey(accountId, apiKey);

    const service = new GeminiService(apiKey);
    this.instances.set(accountId, service);
    return service;
  }

  async processMessage(accountId, messageData) {
    const { sessionId, chatId, platform = sessionId.includes('whatsapp') ? 'whatsapp' : 'telegram' } = messageData;
    
    // Obtener historial de chat
    const chatHistory = await Database.getChatHistory(accountId, chatId, platform);
    
    // Crear contexto basado en el historial
    let contextPrompt = '';
    if (chatHistory && chatHistory.length > 0) {
      contextPrompt = chatHistory
        .reverse()   // Invertir para tener orden cronológico
        .map(entry => {
          // Incluir el contextPrompt original en la concatenación del historial
          let entryContext = '';
          if (entry.contextPrompt) {
            entryContext = `Contexto anterior: ${entry.contextPrompt}\n`;
          }
          return `${entryContext}Usuario: ${entry.userMessage || ''}\nAsistente: ${entry.geminiResponse || ''}\n`;
        })
        .join('\n');
    }
    
    // Adjuntar contextPrompt al messageData
    const messageWithContext = {
      ...messageData,
      contextPrompt
    };
    
    // Procesar mensaje con el servicio de Gemini
    const geminiInstance = await this.getOrCreateInstance(accountId);
    const response = await geminiInstance.processMessage(messageWithContext);
    
    // Guardar mensaje y respuesta en el historial
    if (response.status === 'success' && response.results.text) {
      await Database.saveChatMessage(accountId, chatId, platform, {
        message: messageData.message,
        geminiResponse: response.results.text.content,
        contextPrompt: messageWithContext.contextPrompt
      });
    }
    
    return response;
  }

  async updateApiKey(accountId, apiKey) {
    if (!apiKey) throw new Error('Se requiere una API key válida');
    await Database.saveGeminiKey(accountId, apiKey);
    this.instances.delete(accountId);
    this.instances.set(accountId, new GeminiService(apiKey));
    return { success: true, message: 'API key actualizada correctamente' };
  }

  async deleteInstance(accountId) {
    this.instances.delete(accountId);
    await Database.deleteGeminiKey(accountId);
    return { success: true, message: 'Instancia eliminada correctamente' };
  }
}

export default new GeminiManager();