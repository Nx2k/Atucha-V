import { WhatsAppService } from '../../services/whatsapp/WhatsappService.js';
import Database from '../../database/Database.js';

class WhatsAppManager {
  constructor() {
    this.sessions = new Map();
    this.loadSavedSessions();
  }

  async createSession(sessionId, authMethod, phoneNumber = '') {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Ya existe una sesión con el ID: ${sessionId}`);
    }
    if (authMethod === 'pairing' && !phoneNumber) {
      throw new Error('phoneNumber requerido para pairing');
    }

    const service = new WhatsAppService(sessionId, authMethod, phoneNumber);
    const result = await service.initialize();
    await Database.saveSession(sessionId, service.getSessionPath(), '', '', phoneNumber, 'whatsapp', authMethod);
    this.sessions.set(sessionId, service);

    console.log(`[WhatsApp: ${sessionId}] Iniciada con ${authMethod}`);
    return {
      success: true,
      sessionId,
      authMethod,
      ...result,
    };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`No existe sesión con el ID: ${sessionId}`);
    }
    return session;
  }

  listSessions() {
    return Array.from(this.sessions.keys()).map((sessionId) => ({ sessionId }));
  }

  async loadSavedSessions() {
    try {
      await Database.initialize();
      const sessions = await Database.listSessions('whatsapp');
      console.log(`Sesiones encontradas en la base de datos: ${sessions.length}`, sessions);
      
      for (const session of sessions) {
        try {
          const sessionData = await Database.getSession(session.sessionId, 'whatsapp');
          console.log(`Intentando inicializar sesión ${session.sessionId}:`);
          
          if (sessionData && sessionData.sessionPath) {
            const service = new WhatsAppService(
              sessionData.sessionId,
              sessionData.authMethod,
              sessionData.phoneNumber
            );
            const result = await service.initialize();
            if (result.success) {
              this.sessions.set(sessionData.sessionId, service);
              console.log(`Conectado a sesión ${sessionData.sessionId}`);
            } else {
              console.error(`Fallo al inicializar sesión ${session.sessionId}: Resultado no exitoso`, result);
            }
          } else {
            console.error(`Datos inválidos para sesión ${session.sessionId}:`, sessionData);
          }
        } catch (error) {
          console.error(`Error al inicializar sesión ${session.sessionId}:`, error.message);
        }
      }
    } catch (error) {
      console.error('Error al cargar sesiones:', error.message);
    }
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, error: `No existe sesión con el ID: ${sessionId}` };
    }
    try {
      await session.logout();
      await Database.deleteSession(sessionId, 'whatsapp');
      this.sessions.delete(sessionId);
      return { success: true };
    } catch (error) {
      console.error(`Error al eliminar sesión ${sessionId}:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendMessage(sessionId, phoneNumber, message) {
    const session = this.getSession(sessionId);
    return await session.sendMessage(phoneNumber, message);
  }
}

export default new WhatsAppManager();