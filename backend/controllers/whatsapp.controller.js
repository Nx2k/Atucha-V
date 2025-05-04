import { WhatsAppService } from '../services/WhatsappService.js';
import Database from '../database/Database.js';

class WhatsAppManager {
  constructor() {
    this.sessions = new Map();
    this.loadSavedSessions();
  }

  async createSession(sessionId, authMethod, phoneNumber = '', accountId) {
    if (this.sessions.has(sessionId)) throw new Error(`Ya existe una sesión con el ID: ${sessionId}`);
    if (authMethod === 'pairing' && !phoneNumber) throw new Error('phoneNumber requerido para pairing');

    const account = await Database.getAccount(accountId);
    if (!account) throw new Error(`No existe una cuenta con el ID: ${accountId}`);

    const service = new WhatsAppService(sessionId, authMethod, phoneNumber);
    const result = await service.initialize();
    await Database.saveSession(sessionId, service.getSessionPath(), '', '', phoneNumber, 'whatsapp', authMethod, accountId);
    this.sessions.set(sessionId, { service, accountId });
    return { success: true, sessionId, authMethod, ...result };
  }

  getSession(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (!sessionObj) throw new Error(`No existe sesión con el ID: ${sessionId}`);
    return sessionObj;
  }

  async getSessionAccountId(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (sessionObj?.accountId) return sessionObj.accountId;
    
    const accountId = await Database.getSessionAccountId(sessionId, 'whatsapp');
    if (accountId) return accountId;
    
    const sessionData = await Database.getSession(sessionId, 'whatsapp');
    if (sessionData?.accountId) {
      await Database.setSessionAccountId(sessionId, 'whatsapp', sessionData.accountId);
      if (this.sessions.has(sessionId)) {
        const sessionObj = this.sessions.get(sessionId);
        this.sessions.set(sessionId, { ...sessionObj, accountId: sessionData.accountId });
      }
      return sessionData.accountId;
    }
    
    return null;
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map(sessionId => ({ sessionId }));
  }

  async loadSavedSessions() {
    await Database.initialize().catch(() => {});
    const sessions = await Database.listSessions('whatsapp').catch(() => []);
    for (const { sessionId } of sessions) {
      const sessionData = await Database.getSession(sessionId, 'whatsapp').catch(() => null);
      if (sessionData?.sessionPath) {
        const service = new WhatsAppService(sessionData.sessionId, sessionData.authMethod, sessionData.phoneNumber);
        const result = await service.initialize().catch(() => null);
        if (result?.success) {
          this.sessions.set(sessionId, { service, accountId: sessionData.accountId });
        }
      }
    }
  }

  async deleteSession(sessionId) {
    const sessionObj = this.sessions.get(sessionId);
    if (!sessionObj) return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    await sessionObj.service.logout();
    await Database.deleteSession(sessionId, 'whatsapp');
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async sendMessage(sessionId, phoneNumber, message) {
    return (await this.getSession(sessionId)).service.sendMessage(phoneNumber, message);
  }
}

export default new WhatsAppManager();