import { GeminiService } from '../services/GeminiService.js';
import Database from '../database/Database.js';
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultApiKeyPath = path.join(__dirname, '../../apikey.txt');
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
        .reverse()
        .map(entry => {
          let entryContext = '';
          if (entry.contextPrompt) {
            entryContext = `Contexto anterior: ${entry.contextPrompt}\n`;
          }
          const userMessages = entry.userMessages?.length > 0 
            ? `Usuario: ${entry.userMessages.join('\n')}`
            : `Usuario: ${entry.userMessage || ''}`;
          return `${entryContext}${userMessages}\nAsistente: ${entry.geminiResponse || ''}\n`;
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
        messages: messageData.texts || [],
        images: messageData.images || [],
        audios: messageData.audios || [],
        videos: messageData.videos || [],
        stickers: messageData.stickers || [],
        documents: messageData.documents || [],
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