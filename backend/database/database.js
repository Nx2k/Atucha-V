import sqlite3 from 'sqlite3';
import crypto from 'crypto';
import Redis from 'ioredis';

const db = new sqlite3.Database('../database/sessions.db', err => {
  if (err) process.exit(1);
});

// Inicializar conexión Redis
const redis = new Redis();

const initializeDatabase = () => new Promise((resolve, reject) => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        accountId TEXT PRIMARY KEY,
        tier TEXT DEFAULT 'free',
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, err => err && reject(err));

    db.run(`
      CREATE TABLE IF NOT EXISTS gemini_keys (
        accountId TEXT PRIMARY KEY,
        apiKey TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES accounts(accountId)
      )
    `, err => err && reject(err));

    db.run(`
      CREATE TABLE IF NOT EXISTS telegram_sessions (
        sessionId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        sessionString TEXT NOT NULL,
        apiId TEXT NOT NULL,
        apiHash TEXT NOT NULL,
        phoneNumber TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES accounts(accountId)
      )
    `, err => err && reject(err));

    db.run(`
      CREATE TABLE IF NOT EXISTS whatsapp_sessions (
        sessionId TEXT PRIMARY KEY,
        accountId TEXT NOT NULL,
        sessionPath TEXT NOT NULL,
        phoneNumber TEXT NOT NULL,
        authMethod TEXT NOT NULL,
        platform TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (accountId) REFERENCES accounts(accountId)
      )
    `, err => err && reject(err));

    resolve();
  });
});

const Database = {
  async initialize() {
    await initializeDatabase();
  },

  async createAccount() {
    const accountId = crypto.randomUUID();
    await new Promise((resolve, reject) => {
      db.run(`INSERT INTO accounts (accountId, tier) VALUES (?, ?)`, [accountId, 'free'], err => err ? reject(err) : resolve());
    });
    return { accountId };
  },

  async getAccount(accountId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM accounts WHERE accountId = ?`, [accountId], (err, data) => err ? reject(err) : resolve(data));
    });
  },

  async saveSession(sessionId, sessionData, apiId, apiHash, phoneNumber, platform = 'telegram', authMethod = '', accountId) {
    const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
    const query = platform === 'whatsapp'
      ? `INSERT OR REPLACE INTO ${table} (sessionId, accountId, sessionPath, phoneNumber, authMethod, platform) VALUES (?, ?, ?, ?, ?, ?)`
      : `INSERT OR REPLACE INTO ${table} (sessionId, accountId, sessionString, apiId, apiHash, phoneNumber) VALUES (?, ?, ?, ?, ?, ?)`;
    const params = platform === 'whatsapp'
      ? [sessionId, accountId, sessionData, phoneNumber, authMethod, 'whatsapp']
      : [sessionId, accountId, sessionData, apiId, apiHash, phoneNumber];

    await new Promise((resolve, reject) => {
      db.run(query, params, err => err ? reject(err) : resolve());
    });
    
    // Guardar el mapeo de sessionId a accountId en Redis
    await this.setSessionAccountId(sessionId, platform, accountId);
  },

  async getSession(sessionId, platform = 'telegram') {
    const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM ${table} WHERE sessionId = ?`, [sessionId], (err, data) => err ? reject(err) : resolve(data));
    });
  },

  async listSessions(platform = 'telegram') {
    const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
    return new Promise((resolve, reject) => {
      db.all(`SELECT sessionId FROM ${table}`, (err, sessions) => err ? reject(err) : resolve(sessions));
    });
  },

  async deleteSession(sessionId, platform = 'telegram') {
    const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM ${table} WHERE sessionId = ?`, [sessionId], err => err ? reject(err) : resolve());
    });
    
    // Eliminar el mapeo de sessionId a accountId en Redis
    await redis.del(`session:account:${sessionId}:${platform}`);
  },

  async saveGeminiKey(accountId, apiKey) {
    await new Promise((resolve, reject) => {
      db.run(`INSERT OR REPLACE INTO gemini_keys (accountId, apiKey) VALUES (?, ?)`, [accountId, apiKey], err => err ? reject(err) : resolve());
    });
  },

  async getGeminiKey(accountId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM gemini_keys WHERE accountId = ?`, [accountId], (err, data) => err ? reject(err) : resolve(data));
    });
  },

  async deleteGeminiKey(accountId) {
    await new Promise((resolve, reject) => {
      db.run(`DELETE FROM gemini_keys WHERE accountId = ?`, [accountId], err => err ? reject(err) : resolve());
    });
  },

  // Métodos para Redis - Gestión de mapeo sessionId -> accountId
  async getSessionAccountId(sessionId, platform) {
    return redis.get(`session:account:${sessionId}:${platform}`);
  },

  async setSessionAccountId(sessionId, platform, accountId) {
    return redis.set(`session:account:${sessionId}:${platform}`, accountId);
  },

  // Métodos para el historial de chat
  async getChatHistory(accountId, chatId, platform) {
    const historyKey = `chat:historial:${accountId}:${chatId}:${platform}`;
    const history = await redis.lrange(historyKey, 0, -1);
    return history.map(item => JSON.parse(item));
  },

  async saveChatMessage(accountId, chatId, platform, messageData) {
    const historyKey = `chat:historial:${accountId}:${chatId}:${platform}`;
    await redis.lpush(historyKey, JSON.stringify({
      userMessage: messageData.message,
      geminiResponse: messageData.geminiResponse,
      contextPrompt: messageData.contextPrompt,
      timestamp: new Date().toISOString()
    }));
    // Establecer TTL de 4 horas (14400 segundos)
    await redis.expire(historyKey, 14400);
  },

  async deleteChatHistory(accountId, chatId, platform) {
    const historyKey = `chat:historial:${accountId}:${chatId}:${platform}`;
    return redis.del(historyKey);
  }
};

export default Database;