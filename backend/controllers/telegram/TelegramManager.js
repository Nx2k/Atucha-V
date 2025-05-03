import { TelegramService } from '../../services/telegram/TelegramService.js';
import Database from '../../database/Database.js';

class TelegramManager {
  constructor() {
    this.sessions = new Map();
    this.loadSavedSessions();
  }

  async createSession(sessionId, apiId, apiHash, phoneNumber, accountId) {
    if (this.sessions.has(sessionId)) throw new Error(`Ya existe una sesión con el ID: ${sessionId}`);
    const account = await Database.getAccount(accountId);
    if (!account) throw new Error(`No existe una cuenta con el ID: ${accountId}`);

    const service = new TelegramService(sessionId, apiId, apiHash, phoneNumber);
    const result = await service.initialize();
    await Database.saveSession(sessionId, service.getSessionString(), apiId, apiHash, phoneNumber, 'telegram', '', accountId);
    this.sessions.set(sessionId, service);
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
    if (!session) throw new Error(`No existe sesión con el ID: ${sessionId}`);
    return session;
  }

  getSessionString(sessionId) {
    return this.getSession(sessionId).getSessionString();
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map(sessionId => ({ sessionId }));
  }

  async loadSavedSessions() {
    await Database.initialize().catch(() => {});
    const sessions = await Database.listSessions('telegram').catch(() => []);
    for (const { sessionId } of sessions) {
      const sessionData = await Database.getSession(sessionId, 'telegram').catch(() => null);
      if (sessionData) {
        const service = new TelegramService(sessionData.sessionId, sessionData.apiId, sessionData.apiHash, sessionData.phoneNumber);
        const result = await service.initialize().catch(() => null);
        if (result?.success && !result.requiresPhoneCode) this.sessions.set(sessionId, service);
      }
    }
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    await session.client.connect();
    await session.logout();
    await Database.deleteSession(sessionId, 'telegram');
    await session.client.destroy();
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async sendMessage(sessionId, chatId, message) {
    return (await this.getSession(sessionId)).sendMessage(chatId, message);
  }
}

export default new TelegramManager();