import { GeminiService } from '../../services/gemini/GeminiService.js';
import Database from '../../database/Database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Lee la API key por defecto desde el archivo
const defaultApiKeyPath = path.join(__dirname, '../../../apikey.txt');
const DEFAULT_API_KEY = fs.existsSync(defaultApiKeyPath) 
  ? fs.readFileSync(defaultApiKeyPath, 'utf-8').trim() 
  : '';

class GeminiManager {
  constructor() {
    this.instances = new Map(); // accountId -> GeminiService
    this.initialize();
  }

  async initialize() {
    try {
      await Database.initialize();
    } catch (error) {
      console.error('Error al inicializar la base de datos para GeminiManager:', error);
    }
  }

  /**
   * Obtiene o crea una instancia de GeminiService para un accountId específico
   * @param {string} accountId - ID de la cuenta del usuario
   * @returns {Promise<GeminiService>} - Instancia de GeminiService
   */
  async getOrCreateInstance(accountId) {
    if (this.instances.has(accountId)) {
      return this.instances.get(accountId);
    }

    // Verificar que la cuenta existe
    const account = await Database.getAccount(accountId);
    if (!account) {
      throw new Error(`No existe una cuenta con el ID: ${accountId}`);
    }

    // Verificar si ya existe una API key para esta cuenta
    const geminiKeyData = await Database.getGeminiKey(accountId);
    let apiKey;

    if (geminiKeyData) {
      apiKey = geminiKeyData.apiKey;
    } else {
      // Si no existe, usamos una API key por defecto y la guardamos
      apiKey = DEFAULT_API_KEY;
      await Database.saveGeminiKey(accountId, apiKey);
    }

    const service = new GeminiService(apiKey);
    this.instances.set(accountId, service);
    console.log(`[Gemini: ${accountId}] Instancia inicializada`);
    
    return service;
  }

  /**
   * Procesa un mensaje usando la instancia de Gemini del usuario
   * @param {string} accountId - ID de la cuenta del usuario
   * @param {Object} messageData - Datos del mensaje a procesar
   * @returns {Promise<Object>} - Resultado del procesamiento
   */
  async processMessage(accountId, messageData) {
    const instance = await this.getOrCreateInstance(accountId);
    return await instance.processMessage(messageData);
  }

  /**
   * Actualiza la API key para un accountId específico
   * @param {string} accountId - ID de la cuenta del usuario
   * @param {string} apiKey - Nueva API key de Gemini
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async updateApiKey(accountId, apiKey) {
    if (!apiKey) {
      throw new Error('Se requiere una API key válida');
    }

    await Database.saveGeminiKey(accountId, apiKey);
    
    // Si ya existe una instancia, la actualizamos
    if (this.instances.has(accountId)) {
      this.instances.delete(accountId);
    }
    
    // Creamos una nueva instancia con la nueva API key
    const service = new GeminiService(apiKey);
    this.instances.set(accountId, service);
    
    return { success: true, message: 'API key actualizada correctamente' };
  }

  /**
   * Elimina la instancia y la API key de una cuenta
   * @param {string} accountId - ID de la cuenta del usuario
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async deleteInstance(accountId) {
    if (this.instances.has(accountId)) {
      this.instances.delete(accountId);
    }
    
    await Database.deleteGeminiKey(accountId);
    return { success: true, message: 'Instancia eliminada correctamente' };
  }
}

export default new GeminiManager(); 