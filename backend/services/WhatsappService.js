import { makeWASocket, useMultiFileAuthState, downloadMediaMessage } from 'baileys';
import { existsSync, mkdirSync, rmSync, createWriteStream, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';
import crypto from 'crypto';
import Database from '../database/Database.js';
import GeminiManager from '../controllers/gemini.controller.js';
import WhatsAppManager from '../controllers/whatsapp.controller.js';
import MessagePackager from '../modules/MessagePackager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionPath = path.join(__dirname, '../database/WhatsappSessions');
const mediaDir = path.join(__dirname, '../database/media');

const logger = {
  child: () => logger,
  info: () => {},
  warn: () => {},
  debug: () => {},
  error: () => {},
  trace: () => {},
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class WhatsAppService {
  constructor(sessionId, authMethod = 'qr', phoneNumber = '') {
    this.sessionId = sessionId;
    this.authMethod = authMethod;
    this.phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
    this.sessionDir = path.join(sessionPath, sessionId);
    this.sock = null;
    this.qrCode = null;
    this.pairingCode = null;
    this.isInitialized = false;
    this.isReconnecting = false;
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
    let lastConnectionTime = 0;

    return Promise.race([
      new Promise((resolve, reject) => {
        this.sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr, isNewLogin }) => {
          const now = Date.now();
          if (connection === 'open' && now - lastConnectionTime < 1000) return;
          lastConnectionTime = now;

          if (connection === 'open' || this.isReconnecting) {
            this.isInitialized = true;
            this.isReconnecting = false;
            resolve({ success: true });
          } else if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            if (statusCode === 401) {
              await this.logout();
              reject(new Error('Sesión cerrada desde el dispositivo'));
            } else if (statusCode === 515 && !this.isReconnecting) {
              this.isReconnecting = true;
              resolve(await this.initialize());
            } else {
              reject(new Error(`Conexión cerrada. Código: ${statusCode || 'desconocido'}`));
            }
          } else if (!isExistingSession && connection === 'connecting' && this.authMethod === 'pairing' && !state.creds.registered && !this.isReconnecting) {
            await sleep(1000);
            this.pairingCode = await this.sock.requestPairingCode(this.phoneNumber);
            resolve({ success: true, pairingCode: this.pairingCode });
          } else if (!isExistingSession && this.authMethod === 'qr' && qr && !state.creds.registered && !this.isReconnecting) {
            this.qrCode = qr;
            qrcode.generate(qr, { small: true });
            resolve({ success: true, qrCode: this.qrCode });
          }
        });
      }),
      sleep(30000).then(() => Promise.reject(new Error(`Timeout inicializando sesión ${this.sessionId}`)))
    ]);
  }

  getSessionPath() {
    return this.sessionDir;
  }

  async logout() {
    if (!this.sock || !this.isInitialized) throw new Error(`Sesión ${this.sessionId} no inicializada`);
    this.sock.end();
    if (existsSync(this.sessionDir)) {
      rmSync(this.sessionDir, { recursive: true, force: true });
      Database.deleteSession(this.sessionId, 'whatsapp');
    }
    this.isInitialized = false;
    this.isReconnecting = false;
    return { success: true };
  }

  setupEventHandlers() {
    if (!this.sock) return;

    this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        const message = msg.message;
        if (!message) continue;

        const chatId = msg.key.remoteJid;
        
        // Filtrar mensajes de grupos (los IDs de grupos terminan en @g.us)
        if (chatId.endsWith('@g.us')) {
          continue; // Ignorar mensajes de grupos
        }
        
        const messageText = message.conversation ||
          message.extendedTextMessage?.text ||
          message.imageMessage?.caption ||
          message.videoMessage?.caption ||
          message.documentMessage?.caption;

        if (!messageText && !message.imageMessage && !message.audioMessage &&
            !message.videoMessage && !message.stickerMessage && !message.documentMessage) {
          continue;
        }

        if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });

        const generateRandomFilename = extension => `${crypto.randomBytes(16).toString('hex')}.${extension}`;

        const downloadMedia = async (msg, mimeType) => {
          const extension = mimeType.split('/')[1];
          const fileName = generateRandomFilename(extension);
          const filePath = path.join(mediaDir, fileName);

          const stream = await downloadMediaMessage(msg, 'stream', {}, { logger, reuploadRequest: this.sock.updateMediaMessage });
          return new Promise((resolve, reject) => {
            const writeStream = createWriteStream(filePath);
            let fileSize = 0;

            stream.on('data', chunk => fileSize += chunk.length);
            stream.on('error', reject);
            writeStream.on('finish', () => existsSync(filePath) && fileSize > 0 ? resolve(filePath) : reject(new Error('Archivo vacío')));
            writeStream.on('error', reject);
            stream.pipe(writeStream);
          }).catch(() => null);
        };

        const media = {
          image: message.imageMessage ? await downloadMedia(msg, message.imageMessage.mimetype) : null,
          video: message.videoMessage ? await downloadMedia(msg, message.videoMessage.mimetype) : null,
          audio: message.audioMessage ? await downloadMedia(msg, message.audioMessage.mimetype) : null,
          sticker: message.stickerMessage ? await downloadMedia(msg, message.stickerMessage.mimetype) : null,
          document: message.documentMessage ? await downloadMedia(msg, message.documentMessage.mimetype) : null
        };

        if (chatId) {
          const messageData = { sessionId: this.sessionId, chatId, message: messageText, ...media };
          const cleanupMediaFiles = () => Object.values(media).filter(Boolean).forEach(file => {
            try { if (existsSync(file)) unlinkSync(file); } catch {}
          });

          try {
            // Obtener accountId desde WhatsAppManager
            const accountId = await WhatsAppManager.getSessionAccountId(this.sessionId);
            if (accountId) {
              const packagedMessage = await MessagePackager.packageMessage(accountId, chatId, 'whatsapp', messageData);
              if (packagedMessage.texts.length > 0 || packagedMessage.images.length > 0 || packagedMessage.audios.length > 0 ||
                  packagedMessage.videos.length > 0 || packagedMessage.stickers.length > 0 || packagedMessage.documents.length > 0) {
                const geminiResponse = await GeminiManager.processMessage(accountId, packagedMessage);
                // Limpiar archivos multimedia originales
                cleanupMediaFiles();
                // Limpiar archivos multimedia empaquetados
                Object.entries({
                  images: packagedMessage.images,
                  audios: packagedMessage.audios,
                  videos: packagedMessage.videos,
                  stickers: packagedMessage.stickers,
                  documents: packagedMessage.documents
                }).forEach(([_, paths]) => 
                  paths.forEach(file => {
                    try { if (existsSync(file)) unlinkSync(file); } catch {}
                  })
                );
                
                if (geminiResponse?.status === 'success' && geminiResponse.results.text) {
                  await this.sendMessage(chatId, geminiResponse.results.text.content);
                }
              } else {
                cleanupMediaFiles();
              }
            } else {
              cleanupMediaFiles();
            }
          } catch (error) {
            cleanupMediaFiles();
          }
        }
      }
    });
  }

  async sendMessage(chatId, message) {
    if (!this.isInitialized) throw new Error(`Sesión ${this.sessionId} no inicializada`);

    // No enviar mensajes a grupos
    if (chatId.endsWith('@g.us')) {
      return { success: false, error: 'No se permiten mensajes a grupos' };
    }

    const formattedPhone = chatId.includes('@') ? chatId : `${chatId.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
    const randomDelay = 5000 + Math.floor(Math.random() * 5001);

    try {
      await this.sock.sendPresenceUpdate('composing', formattedPhone);
      await sleep(randomDelay);
      await this.sock.sendPresenceUpdate('paused', formattedPhone);
      const result = await this.sock.sendMessage(formattedPhone, { text: message });
      return { success: true, messageId: result.key.id };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export { WhatsAppService };