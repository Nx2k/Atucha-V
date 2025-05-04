import Redis from 'ioredis';

const redis = new Redis();
const WINDOW_TIME = 15000; // 10 segundos

class MessagePackager {
  constructor() {
    this.timeouts = new Map();
    this.messages = new Map();
  }

  async packageMessage(accountId, chatId, platform, messageData) {
    const key = `${accountId}:${chatId}:${platform}`;
    
    // Inicializar mensaje si no existe
    if (!this.messages.has(key)) {
      this.messages.set(key, {
        texts: [],
        images: [],
        audios: [],
        videos: [],
        stickers: [],
        documents: [],
        sessionId: messageData.sessionId,
        chatId,
        platform
      });
    }

    // Agregar mensaje al paquete
    const pkg = this.messages.get(key);
    if (messageData.message) pkg.texts.push(messageData.message);
    if (messageData.image) pkg.images.push(messageData.image);
    if (messageData.audio) pkg.audios.push(messageData.audio);
    if (messageData.video) pkg.videos.push(messageData.video);
    if (messageData.sticker) pkg.stickers.push(messageData.sticker);
    if (messageData.document) pkg.documents.push(messageData.document);

    // Cancelar timeout anterior
    if (this.timeouts.has(key)) {
      clearTimeout(this.timeouts.get(key));
    }

    // Crear nuevo timeout
    return new Promise(resolve => {
      const timeout = setTimeout(async () => {
        // Procesar paquete
        const finalPkg = { ...pkg };
        this.messages.delete(key);
        this.timeouts.delete(key);

        // Guardar en historial
        if (finalPkg.texts.length > 0 || finalPkg.images.length > 0 || finalPkg.audios.length > 0 ||
            finalPkg.videos.length > 0 || finalPkg.stickers.length > 0 || finalPkg.documents.length > 0) {
          await redis.lpush(`chat:historial:${accountId}:${chatId}:${platform}`, JSON.stringify({
            userMessages: finalPkg.texts,
            images: finalPkg.images,
            audios: finalPkg.audios,
            videos: finalPkg.videos,
            stickers: finalPkg.stickers,
            documents: finalPkg.documents,
            timestamp: new Date().toISOString()
          }));
          await redis.expire(`chat:historial:${accountId}:${chatId}:${platform}`, 14400);
        }

        resolve(finalPkg);
      }, WINDOW_TIME);

      this.timeouts.set(key, timeout);
    });
  }
}

export default new MessagePackager();