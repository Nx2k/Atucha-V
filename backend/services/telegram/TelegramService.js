import { StringSession } from 'telegram/sessions/index.js';
import { NewMessage } from 'telegram/events/index.js';
import { Api, TelegramClient } from 'telegram';
import Database from '../../database/Database.js';
import GeminiManager from '../../controllers/gemini/GeminiManager.js';
import { existsSync, mkdirSync, writeFile, unlinkSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mediaDir = path.join(__dirname, '../../database/media');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class TelegramService {
  constructor(sessionId, apiId, apiHash, phoneNumber) {
    this.sessionId = sessionId;
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.phoneNumber = phoneNumber;
    this.client = null;
    this.isInitialized = false;
    this.phoneCodeHash = null;
    this.sessionString = '';
  }

  async initialize() {
    if (this.isInitialized) return { success: true };

    const savedSession = await Database.getSession(this.sessionId).catch(() => null);
    if (savedSession?.sessionString) {
      Object.assign(this, {
        sessionString: savedSession.sessionString,
        apiId: savedSession.apiId,
        apiHash: savedSession.apiHash,
        phoneNumber: savedSession.phoneNumber
      });
    }

    const stringSession = new StringSession(this.sessionString);
    this.client = new TelegramClient(stringSession, parseInt(this.apiId), this.apiHash, { connectionRetries: 5 });
    await this.client.connect();

    if (await this.client.isUserAuthorized()) {
      this.isInitialized = true;
      this.sessionString = this.client.session.save();
      await Database.saveSession(this.sessionId, this.sessionString, this.apiId, this.apiHash, this.phoneNumber);
      this.setupEventHandlers();
      await this.client.getDialogs({});
      return { success: true };
    }

    const { phoneCodeHash } = await this.client.sendCode({ apiId: parseInt(this.apiId), apiHash: this.apiHash }, this.phoneNumber);
    this.phoneCodeHash = phoneCodeHash;
    return { success: true, requiresPhoneCode: true };
  }

  async verifyPhoneCode(phoneCode) {
    if (!this.client) throw new Error('Cliente no inicializado');
    await this.client.invoke(new Api.auth.SignIn({ phoneNumber: this.phoneNumber, phoneCodeHash: this.phoneCodeHash, phoneCode }));
    this.isInitialized = true;
    this.sessionString = this.client.session.save();
    await Database.saveSession(this.sessionId, this.sessionString, this.apiId, this.apiHash, this.phoneNumber);
    this.setupEventHandlers();
    return { success: true };
  }

  getSessionString() {
    return this.sessionString;
  }

  async logout() {
    if (!this.client || !this.isInitialized) throw new Error('Cliente no inicializado o sesión no verificada');
    await this.client.invoke(new Api.auth.LogOut());
    this.isInitialized = false;
    this.sessionString = '';
    this.client.session.delete();
    return { success: true };
  }

  setupEventHandlers() {
    if (!this.client) return;
    this.client.addEventHandler(async event => {
      const message = event.message;
      const chatId = event.chatId?.toString();
      const messageText = message?.text || null;
      if (!chatId || !message) return;

      if (!existsSync(mediaDir)) mkdirSync(mediaDir, { recursive: true });

      const downloadMedia = async mediaDoc => {
        const mimeType = mediaDoc.mimeType || 'application/octet-stream';
        const extension = mimeType.split('/')[1] || 'bin';
        const fileName = `${crypto.randomBytes(16).toString('hex')}.${extension}`;
        const filePath = path.join(mediaDir, fileName);

        const buffer = await this.client.downloadMedia(mediaDoc, {});
        if (!buffer || buffer.length === 0) return null;

        await new Promise((resolve, reject) => writeFile(filePath, buffer, err => err ? reject(err) : resolve()));
        return existsSync(filePath) && statSync(filePath).size > 0 ? filePath : null;
      };

      const media = {
        image: message.media?.className === 'MessageMediaPhoto' ? await downloadMedia(message.media.photo) : null,
        audio: null,
        video: null,
        sticker: null,
        document: null
      };

      if (message.media?.className === 'MessageMediaDocument') {
        const doc = message.media.document;
        const attributes = doc.attributes || [];
        const isAudio = attributes.some(attr => attr.className === 'DocumentAttributeAudio') || doc.mimeType === 'audio/ogg';
        const isVideo = attributes.some(attr => attr.className === 'DocumentAttributeVideo');
        const isSticker = attributes.some(attr => attr.className === 'DocumentAttributeSticker') || ['application/x-tgsticker', 'image/webp'].includes(doc.mimeType);
        const docFilePath = await downloadMedia(doc);

        Object.assign(media, {
          audio: isAudio ? docFilePath : null,
          video: isVideo ? docFilePath : null,
          sticker: isSticker ? docFilePath : null,
          document: !isAudio && !isVideo && !isSticker ? docFilePath : null
        });
      }

      const messageData = { sessionId: this.sessionId, chatId, message: messageText, ...media };
      const cleanupMediaFiles = () => Object.values(media).filter(Boolean).forEach(file => { try { if (existsSync(file)) unlinkSync(file); } catch {} });

      const sessionData = await Database.getSession(this.sessionId, 'telegram');
      if (sessionData?.accountId) {
        try {
          const geminiResponse = await GeminiManager.processMessage(sessionData.accountId, messageData);
          cleanupMediaFiles();
          if (geminiResponse?.status === 'success' && geminiResponse.results.text) {
            await this.sendMessage(chatId, geminiResponse.results.text.content);
          }
        } catch {
          cleanupMediaFiles();
        }
      }
    }, new NewMessage({}));
  }

  async getChats() {
    if (!this.isInitialized) throw new Error('Sesión no verificada');
    const results = [];

    const allDialogs = await this.client.getDialogs({}).catch(() => []);
    const userDialogs = allDialogs.filter(dialog => dialog.isUser);

    for (const dialog of userDialogs) {
      const messages = [];
      try {
        for await (const message of this.client.iterMessages(dialog.inputEntity, { limit: 100 })) {
          messages.push(message);
        }
        results.push({
          dialog: {
            id: dialog.id,
            name: dialog.name,
            username: dialog.entity?.username,
            isUser: dialog.isUser,
            inputEntity: dialog.inputEntity
          },
          history: messages.reverse()
        });
      } catch (error) {
        results.push({
          dialog: {
            id: dialog.id,
            name: dialog.name,
            username: dialog.entity?.username,
            isUser: dialog.isUser,
            inputEntity: dialog.inputEntity
          },
          history: [],
          error: `Fallo al obtener historial: ${error.message}`
        });
      }
    }
    return results;
  }

  async sendMessage(chatId, message) {
    if (!this.isInitialized) throw new Error('Sesión no verificada');
    const peer = await this.client.getInputEntity(chatId);
    const randomDelay = 5000 + Math.floor(Math.random() * 5001);

    await this.client.invoke(new Api.messages.SetTyping({ peer, action: new Api.SendMessageTypingAction({}) })).catch(() => {});
    await sleep(randomDelay);
    const result = await this.client.sendMessage(peer, { message });
    return { success: true, messageId: result.id, date: result.date };
  }
}

export { TelegramService };