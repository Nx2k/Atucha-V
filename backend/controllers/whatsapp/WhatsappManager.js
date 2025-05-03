import { WhatsAppService } from '../../services/whatsapp/WhatsappService.js';
import Database from '../../database/Database.js';

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
    this.sessions.set(sessionId, service);
    return { success: true, sessionId, authMethod, ...result };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`No existe sesión con el ID: ${sessionId}`);
    return session;
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
        if (result?.success) this.sessions.set(sessionId, service);
      }
    }
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    await session.logout();
    await Database.deleteSession(sessionId, 'whatsapp');
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async sendMessage(sessionId, phoneNumber, message) {
    return (await this.getSession(sessionId)).sendMessage(phoneNumber, message);
  }
}

export default new WhatsAppManager();