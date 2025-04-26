import { makeWASocket, useMultiFileAuthState } from 'baileys';
import { existsSync, mkdirSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';
import Database from '../../database/Database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionPath = path.join(__dirname, '../../database/WhatsappSessions');

const logger = {
  child: () => logger,
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  trace: () => {},
};

class WhatsAppService {
  constructor(sessionId, authMethod = 'qr', phoneNumber = '') {
    this.sessionId = sessionId;
    this.authMethod = authMethod;
    this.phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    this.sock = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.isInitialized = false;
    this.isReconnecting = false;
    this.sessionDir = path.join(sessionPath, this.sessionId);
  }

  async initialize() {
    if (this.isInitialized) return { success: true };
    if (!existsSync(sessionPath)) mkdirSync(sessionPath, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);

    this.sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger,
      browser: ['Windows', 'Chrome', '22.04.4'],
    });
  
    this.sock.ev.on('creds.update', saveCreds);
    this.setupEventHandlers();
    const isExistingSession = existsSync(this.sessionDir) && state.creds.registered;
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Timeout inicializando sesión ${this.sessionId}`));
      }, 30000);
    });
  
    let lastConnectionTime = 0;
    const connectionPromise = new Promise((resolve, reject) => {
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr, isNewLogin } = update;
        const now = Date.now();
  
        if (connection === 'open' && now - lastConnectionTime < 1000) {
          return;
        }
        lastConnectionTime = now;
  
        if (connection === 'open') {
          this.isInitialized = true;
          this.isReconnecting = false;
          console.log(`Conectado a sesión ${this.sessionId}${isNewLogin ? ' (nuevo login)' : ''}`);
          resolve({ success: true });
        } else if (connection === 'close') {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode === 401) {
            console.log(`Sesión ${this.sessionId} cerrada desde el dispositivo. Ejecutando logout...`);
            try {
              await this.logout();
              reject(new Error('Sesión cerrada desde el dispositivo'));
            } catch (error) {
              console.error(`Error en logout de sesión ${this.sessionId}:`, error);
              reject(error);
            }
          } else if (statusCode === 515 && !this.isReconnecting) {
            console.log(`Reconectando sesión ${this.sessionId}...`);
            this.isReconnecting = true;
            try {
              const result = await this.initialize();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          } else {
            console.log(`Conexión cerrada para sesión ${this.sessionId}. Código: ${statusCode || 'desconocido'}`);
            reject(new Error(`Conexión cerrada. Código: ${statusCode || 'desconocido'}`));
          }
        } else if (!isExistingSession && connection === 'connecting' && this.authMethod === 'pairing' && !state.creds.registered && !this.isReconnecting) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          try {
            this.pairingCode = await this.sock.requestPairingCode(this.phoneNumber);
            console.log(`Código de emparejamiento para sesión ${this.sessionId}: ${this.pairingCode}`);
            resolve({ success: true, pairingCode: this.pairingCode });
          } catch (error) {
            reject(error);
          }
        } else if (!isExistingSession && this.authMethod === 'qr' && qr && !state.creds.registered && !this.isReconnecting) {
          this.qrCode = qr;
          console.log(`QR generado para sesión ${this.sessionId}`);
          qrcode.generate(qr, { small: true });
          resolve({ success: true, qrCode: this.qrCode });
        }
    });
    });
  
    return Promise.race([connectionPromise, timeoutPromise]);
  }

  getSessionPath() {
    return this.sessionDir;
  }

  async logout() {
    if (!this.sock || !this.isInitialized) throw new Error(`Sesión ${this.sessionId} no inicializada`);
    this.sock.end();
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
      console.log(`Archivos de sesión ${this.sessionId} eliminados`);
      Database.deleteSession(this.sessionId, 'whatsapp')
    }
    this.isInitialized = false;
    this.isReconnecting = false;
    return { success: true };
  }

  setupEventHandlers() {
    if (!this.sock) { return; }
    
    // Manejador de mensajes entrantes
    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (type !== 'notify') return;
        
        for (const msg of messages) {
          const message = msg.message;
          if (!message) continue;
          
          const chatId = msg.key.remoteJid;
          
          // Extraer texto del mensaje, considerando múltiples posibles ubicaciones
          let messageText = null;
          if (message.conversation) {
            messageText = message.conversation;
          } else if (message.extendedTextMessage && message.extendedTextMessage.text) {
            messageText = message.extendedTextMessage.text;
          } else if (message.imageMessage && message.imageMessage.caption) {
            messageText = message.imageMessage.caption;
          } else if (message.videoMessage && message.videoMessage.caption) {
            messageText = message.videoMessage.caption;
          } else if (message.documentMessage && message.documentMessage.caption) {
            messageText = message.documentMessage.caption;
          }
          
          let image = null;
          let audio = null;
          let video = null;
          let sticker = null;
          let document = null;
          
          // Procesar mensajes con imagen
          if (message.imageMessage) {
            image = {
              id: msg.key.id,
              mimetype: message.imageMessage.mimetype,
              caption: message.imageMessage.caption,
              url: message.imageMessage.url,
              mediaKey: message.imageMessage.mediaKey,
              fileLength: message.imageMessage.fileLength,
              height: message.imageMessage.height,
              width: message.imageMessage.width
            };
          }
          
          // Procesar mensajes con video
          else if (message.videoMessage) {
            video = {
              id: msg.key.id,
              mimetype: message.videoMessage.mimetype,
              caption: message.videoMessage.caption,
              url: message.videoMessage.url,
              mediaKey: message.videoMessage.mediaKey,
              fileLength: message.videoMessage.fileLength,
              seconds: message.videoMessage.seconds,
              height: message.videoMessage.height,
              width: message.videoMessage.width
            };
          }
          
          // Procesar mensajes con audio
          else if (message.audioMessage) {
            audio = {
              id: msg.key.id,
              mimetype: message.audioMessage.mimetype,
              url: message.audioMessage.url,
              mediaKey: message.audioMessage.mediaKey,
              fileLength: message.audioMessage.fileLength,
              seconds: message.audioMessage.seconds,
              ptt: message.audioMessage.ptt
            };
          }
          
          // Procesar mensajes con sticker
          else if (message.stickerMessage) {
            sticker = {
              id: msg.key.id,
              mimetype: message.stickerMessage.mimetype,
              url: message.stickerMessage.url,
              mediaKey: message.stickerMessage.mediaKey,
              fileLength: message.stickerMessage.fileLength,
              height: message.stickerMessage.height,
              width: message.stickerMessage.width
            };
          }
          
          // Procesar mensajes con documentos
          else if (message.documentMessage) {
            document = {
              id: msg.key.id,
              mimetype: message.documentMessage.mimetype,
              title: message.documentMessage.title,
              fileName: message.documentMessage.fileName,
              url: message.documentMessage.url,
              mediaKey: message.documentMessage.mediaKey,
              fileLength: message.documentMessage.fileLength
            };
          }
          
          // Construir objeto de mensaje
          if (chatId) {
            const messageData = {
              sessionId: this.sessionId,
              chatId: chatId,
              message: messageText,
              image: image,
              audio: audio,
              video: video,
              sticker: sticker,
              document: document
            };
            console.log(JSON.stringify(messageData));
          }
        }
      } catch (handlerError) {
        console.error(`[WhatsApp: ${this.sessionId}] Error en el manejador de eventos:`, handlerError);
      }
    });
  }

  async sendMessage(chatId, message) {
    if (!this.isInitialized) throw new Error(`Sesión ${this.sessionId} no inicializada`);
    
    // Formatear el número de teléfono para WhatsApp
    let formattedPhone = chatId.replace(/[^0-9]/g, '');
    if (!formattedPhone.includes('@')) {
      formattedPhone = formattedPhone + '@s.whatsapp.net';
    }
    
    // Enviar mensaje utilizando la API actualizada de Baileys
    const result = await this.sock.sendMessage(formattedPhone, { 
      text: message 
    });
    
    return { success: true, messageId: result.key.id };
  }
}

export { WhatsAppService };