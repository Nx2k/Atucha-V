import { TelegramService } from '../services/TelegramService.js';
import Database from '../database/Database.js';

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
    this.sessions.set(sessionId, { service, accountId });
    return { success: true, requiresPhoneCode: true, sessionId, result };
  }

  async verifySession(sessionId, phoneCode) {
    const sessionObj = this.getSession(sessionId);
    const result = await sessionObj.service.verifyPhoneCode(phoneCode);
    await sessionObj.service.getChats();
    return { success: true, sessionId, result };
  }

  getSession(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (!sessionObj) throw new Error(`No existe sesión con el ID: ${sessionId}`);
    return sessionObj;
  }

  async getSessionAccountId(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (sessionObj?.accountId) return sessionObj.accountId;
    
    const accountId = await Database.getSessionAccountId(sessionId, 'telegram');
    if (accountId) return accountId;
    
    const sessionData = await Database.getSession(sessionId, 'telegram');
    if (sessionData?.accountId) {
      await Database.setSessionAccountId(sessionId, 'telegram', sessionData.accountId);
      if (this.sessions.has(sessionId)) {
        const sessionObj = this.sessions.get(sessionId);
        this.sessions.set(sessionId, { ...sessionObj, accountId: sessionData.accountId });
      }
      return sessionData.accountId;
    }
    
    return null;
  }

  getSessionString(sessionId) {
    return this.getSession(sessionId).service.getSessionString();
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
        if (result?.success && !result.requiresPhoneCode) {
          this.sessions.set(sessionId, { service, accountId: sessionData.accountId });
        }
      }
    }
  }

  async deleteSession(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (!sessionObj) return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    await sessionObj.service.client.connect();
    await sessionObj.service.logout();
    await Database.deleteSession(sessionId, 'telegram');
    await sessionObj.service.client.destroy();
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async sendMessage(sessionId, chatId, message) {
    return (await this.getSession(sessionId)).service.sendMessage(chatId, message);
  }
}

export default new TelegramManager();