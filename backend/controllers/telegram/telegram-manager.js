import { TelegramService } from '../../services/telegram/index.js';
import Database from '../../database/database.js';

class TelegramManager {
  constructor() {
    this.sessions = new Map();
    this.loadSavedSessions();
  }

  async createSession(sessionId, apiId, apiHash, phoneNumber) {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Ya existe una sesión con el ID: ${sessionId}`);
    }

    const service = new TelegramService(sessionId, apiId, apiHash, phoneNumber);
    const result = await service.initialize();
    await Database.saveSession(sessionId, service.getSessionString(), apiId, apiHash, phoneNumber, 'telegram');

    this.sessions.set(sessionId, service);
    console.log(`[Telegram: ${sessionId}] Iniciada, pendiente de verificación`);
    return { success: true, requiresPhoneCode: true, sessionId, result };
  }

  async verifySession(sessionId, phoneCode) {
    const session = this.getSession(sessionId);
    const result = await session.verifyPhoneCode(phoneCode);
    await session.getChats();
    return { success: true, sessionId, result };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No existe sesión con el ID: ${sessionId}`);
    }
    return session;
  }

  getSessionString(sessionId) {
    const session = this.getSession(sessionId);
    const sessionString = session.getSessionString();
    return sessionString;
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map((sessionId) => ({ sessionId }));
  }

  async loadSavedSessions() {
    try {
      await Database.initialize();
      const sessions = await Database.listSessions('telegram');
      for (const session of sessions) {
        try {
          const sessionData = await Database.getSession(session.sessionId, 'telegram');
          if (sessionData) {
            const service = new TelegramService(
              sessionData.sessionId,
              sessionData.apiId,
              sessionData.apiHash,
              sessionData.phoneNumber
            );
            const result = await service.initialize();
            if (result.success && !result.requiresPhoneCode) {
              this.sessions.set(sessionData.sessionId, service);
              console.log(`[Telegram: ${sessionData.sessionId}] Sesión restaurada correctamente`);
            }
          }
        } catch (error) {
          console.error(`Error al restaurar sesión ${session.sessionId}:`, error);
        }
      }
    } catch (error) {
      console.error('Error al cargar sesiones:', error);
    }
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    }
    try {
      await session.client.connect();
      await session.logout();
      await Database.deleteSession(sessionId, 'telegram');
      await session.client.destroy();
      this.sessions.delete(sessionId);
      return { success: true };
    } catch (error) {
      console.error(`Error al eliminar sesión ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendMessage(sessionId, chatId, message) {
    const session = this.getSession(sessionId);
    return await session.sendMessage(chatId, message);
  }

}

export default new TelegramManager();