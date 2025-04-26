import { StringSession } from "telegram/sessions/index.js";
import { NewMessage } from "telegram/events/index.js";
import { Api, TelegramClient } from "telegram";
import Database from '../../database/Database.js';

class TelegramService {
  constructor(sessionId, apiId, apiHash, phoneNumber) {
    this.sessionId = sessionId;
    this.apiId = apiId;
    this.apiHash = apiHash;
    this.phoneNumber = phoneNumber;
    this.client = null;
    this.isInitialized = false;
    this.phoneCodeHash = null;
    this.sessionString = "";
  }

  async initialize() {
    if (this.isInitialized) { return { success: true } }

    const savedSession = await Database.getSession(this.sessionId).catch(err => {
      console.error('Error al obtener sesión:', err);
      return null
    });

    if (savedSession && savedSession.sessionString) {
      this.sessionString = savedSession.sessionString;
      this.apiId = savedSession.apiId;
      this.apiHash = savedSession.apiHash;
      this.phoneNumber = savedSession.phoneNumber
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
      return { success: true }
    }

    try {
      const { phoneCodeHash } = await this.client.sendCode({
        apiId: parseInt(this.apiId),
        apiHash: this.apiHash,
      },
        this.phoneNumber);
      this.phoneCodeHash = phoneCodeHash;
      console.log(`Código de verificación solicitado para ${this.phoneNumber}`);
      return { success: true, requiresPhoneCode: true };
    } catch (error) {
      console.error("Error al solicitar código:", error);
      throw error;
    }
  }

  async verifyPhoneCode(phoneCode) {
    if (!this.client) { throw new Error("Cliente no inicializado") }
    try {
      await this.client.invoke(
        new Api.auth.SignIn({
          phoneNumber: this.phoneNumber,
          phoneCodeHash: this.phoneCodeHash,
          phoneCode: phoneCode
        })
      );

      this.isInitialized = true;
      this.sessionString = this.client.session.save();
      await Database.saveSession(this.sessionId, this.sessionString, this.apiId, this.apiHash, this.phoneNumber);
      console.log(`[Telegram: ${this.sessionId}] Sesión de Telegram verificada`);
      this.setupEventHandlers();
      return { success: true };
    } catch (error) {
      console.error(`[Telegram: ${this.sessionId || this.phoneNumber}] Falló la verificación:`, error);
      throw error;
    }
  }

  getSessionString() {
    return this.sessionString;
  }

  async logout() {
    if (!this.client || !this.isInitialized) {throw new Error("Cliente no inicializado o sesión no verificada")}
    try {
      await this.client.invoke(new Api.auth.LogOut());
      this.isInitialized = false;
      this.sessionString = "";
      this.client.session.delete();
      return { success: true };
    } catch (error) {console.error(`[Telegram: ${this.sessionId}] Error al cerrar sesión:`, error);
      throw error}
  }

  setupEventHandlers() {
    if (!this.client) { return }
    this.client.addEventHandler(async (event) => {
      try {
        const message = event.message;
        const chatId = event.chatId?.toString();
        const messageText = message?.text || null;
        let image = null
        let audio = null
        let video = null
        let sticker = null
        let document = null

        if (message.media) {
          if (message.media.className === "MessageMediaPhoto") {
            image = {
              id: message.media.photo.id,
              accessHash: message.media.photo.accessHash,
              fileReference: message.media.photo.fileReference,
              date: message.media.photo.date,
              sizes: message.media.photo.sizes
            };
          } else if (message.media.className === "MessageMediaDocument") {
            const doc = message.media.document;
            const attributes = doc.attributes || [];
            const isAudio = attributes.some(attr => attr.className === "DocumentAttributeAudio") || doc.mimeType === "audio/ogg";
            const isVideo = attributes.some(attr => attr.className === "DocumentAttributeVideo");
            const isSticker = attributes.some(attr => attr.className === "DocumentAttributeSticker") || doc.mimeType === "application/x-tgsticker" || doc.mimeType === "image/webp";
            
            if (isAudio) {
              audio = {
                id: doc.id,
                accessHash: doc.accessHash,
                fileReference: doc.fileReference,
                date: doc.date,
                mimeType: doc.mimeType,
                size: doc.size,
                duration: attributes.find(attr => attr.className === "DocumentAttributeAudio")?.duration
              };
            } else if (isVideo) {
              video = {
                id: doc.id,
                accessHash: doc.accessHash,
                fileReference: doc.fileReference,
                date: doc.date,
                mimeType: doc.mimeType,
                size: doc.size,
                duration: attributes.find(attr => attr.className === "DocumentAttributeVideo")?.duration,
                width: attributes.find(attr => attr.className === "DocumentAttributeVideo")?.w,
                height: attributes.find(attr => attr.className === "DocumentAttributeVideo")?.h
              };
            } else if (isSticker) {
              sticker = {
                id: doc.id,
                accessHash: doc.accessHash,
                fileReference: doc.fileReference,
                date: doc.date,
                mimeType: doc.mimeType,
                size: doc.size,
                stickerSet: attributes.find(attr => attr.className === "DocumentAttributeSticker")?.stickerset
              };
            } else {
              document = {
                id: doc.id,
                accessHash: doc.accessHash,
                fileReference: doc.fileReference,
                date: doc.date,
                mimeType: doc.mimeType,
                size: doc.size,
                fileName: attributes.find(attr => attr.className === "DocumentAttributeFilename")?.fileName
              };
            }
          }
        }

        if (chatId && message) {
          const messageData = {
            sessionId: this.sessionId,
            chatId: chatId,
            message: messageText,
            image: image,
            audio: audio,
            video: video,
            sticker: sticker,
            document : document
          };
          console.log(JSON.stringify(messageData));
        }
      } catch (handlerError) {
        console.error(`[Telegram: ${this.sessionId}] Error en el manejador de eventos:`, handlerError);
      }
    }, new NewMessage({}));
  }

  async getChats() {
    if (!this.isInitialized) { throw new Error("Sesión no verificada") }
    const results = [];
    let userDialogs = [];
    let processedChatCount = 0;

    try {
      const allDialogs = await this.client.getDialogs({});
      userDialogs = allDialogs.filter(dialog => dialog.isUser);
    } catch (error) {
      console.log(`[Telegram: ${this.sessionId}] Recuperados ${processedChatCount} chats`);
      return [];
    }

    for (const dialog of userDialogs) {
      processedChatCount++;
      try {
        const messages = [];
        const iterator = this.client.iterMessages(dialog.inputEntity, { limit: 100 });
        for await (const message of iterator) { messages.push(message) }

        results.push({
          dialog: {
            id: dialog.id,
            name: dialog.name,
            username: dialog.entity?.username,
            isUser: dialog.isUser,
            inputEntity: dialog.inputEntity
          },
          history: messages.reverse(),
        });
      } catch (histError) {
        results.push({
          dialog: {
            id: dialog.id,
            name: dialog.name,
            username: dialog.entity?.username,
            isUser: dialog.isUser,
            inputEntity: dialog.inputEntity
          },
          history: [],
          error: `Fallo al obtener historial: ${histError.message}`
        });
      }
    }
    console.log(`[Telegram: ${this.sessionId}] Recuperados ${processedChatCount} chats`);
    return results;
  }

  async sendMessage(chatId, message) {
    if (!this.isInitialized) { throw new Error("Sesión no verificada") }
    try {
      const peer = await this.client.getInputEntity(chatId);
      const randomDelay = Math.floor(Math.random() * 5001) + 5000;
      try {
        await this.client.invoke(
          new Api.messages.SetTyping({
            peer: peer,
            action: new Api.SendMessageTypingAction({})
          }))
      } catch (typingError) { }

      await sleep(randomDelay);
      const result = await this.client.sendMessage(peer, { message: message });
      return { success: true, messageId: result.id, date: result.date };
    } catch (error) {
      console.error(`[Telegram: ${this.sessionId}] Error al procesar envío a ${chatId}:`, error);
      return { success: false, error: error.message };
    }
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export { TelegramService };
