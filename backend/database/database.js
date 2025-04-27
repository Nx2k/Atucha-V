import sqlite3 from 'sqlite3';
import crypto from 'crypto';

const db = new sqlite3.Database('../database/sessions.db', (err) => {
  if (err) {
    console.error('Error al abrir la base de datos:', err.message);
    process.exit(1);
  }
  console.log('Base de datos conectada');
});

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Tabla de accounts
      db.run(
        `
        CREATE TABLE IF NOT EXISTS accounts (
          accountId TEXT NOT NULL,
          tier TEXT DEFAULT 'free',
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (accountId)
        )
        `,
        (err) => {
          if (err) reject(err);
        }
      );

      // Agregar tabla para las API keys de Gemini
      db.run(
        `
        CREATE TABLE IF NOT EXISTS gemini_keys (
          accountId TEXT NOT NULL,
          apiKey TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (accountId),
          FOREIGN KEY (accountId) REFERENCES accounts(accountId)
        )
        `,
        (err) => {
          if (err) reject(err);
        }
      );

      db.run(
        `
        CREATE TABLE IF NOT EXISTS telegram_sessions (
          sessionId TEXT NOT NULL,
          accountId TEXT NOT NULL,
          sessionString TEXT NOT NULL,
          apiId TEXT NOT NULL,
          apiHash TEXT NOT NULL,
          phoneNumber TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sessionId),
          FOREIGN KEY (accountId) REFERENCES accounts(accountId)
        )
        `,
        (err) => {
          if (err) reject(err);
        }
      );

      db.run(
        `
        CREATE TABLE IF NOT EXISTS whatsapp_sessions (
          sessionId TEXT NOT NULL,
          accountId TEXT NOT NULL,
          sessionPath TEXT NOT NULL,
          phoneNumber TEXT NOT NULL,
          authMethod TEXT NOT NULL,
          platform TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sessionId),
          FOREIGN KEY (accountId) REFERENCES accounts(accountId)
        )
        `,
        (err) => {
          if (err) reject(err);
        }
      );

      resolve();
    });
  });
};

const Database = {
  async initialize() {
    await initializeDatabase();
  },

  async createAccount() {
    return new Promise((resolve, reject) => {
      const accountId = crypto.randomUUID();
      db.run(
        `INSERT INTO accounts (accountId, tier) VALUES (?, ?)`,
        [accountId, 'free'],
        (err) => {
          if (err) {
            console.error('Error al crear cuenta:', err.message);
            reject(err);
          } else {
            resolve({ accountId });
          }
        }
      );
    });
  },

  async getAccount(accountId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM accounts WHERE accountId = ?`, [accountId], (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  },

  async saveSession(sessionId, sessionData, apiId, apiHash, phoneNumber, platform = 'telegram', authMethod = '', accountId) {
    return new Promise((resolve, reject) => {
      if (platform === 'whatsapp') {
        db.run(
          `INSERT OR REPLACE INTO whatsapp_sessions (sessionId, accountId, sessionPath, phoneNumber, authMethod, platform) VALUES (?, ?, ?, ?, ?, ?)`,
          [sessionId, accountId, sessionData, phoneNumber, authMethod, 'whatsapp'],
          (err) => {
            if (err) {
              console.error('Error al guardar sesión WhatsApp:', err.message);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      } else {
        db.run(
          `INSERT OR REPLACE INTO telegram_sessions (sessionId, accountId, sessionString, apiId, apiHash, phoneNumber) VALUES (?, ?, ?, ?, ?, ?)`,
          [sessionId, accountId, sessionData, apiId, apiHash, phoneNumber],
          (err) => {
            if (err) {
              console.error('Error al guardar sesión Telegram:', err.message);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      }
    });
  },

  async getSession(sessionId, platform = 'telegram') {
    return new Promise((resolve, reject) => {
      const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
      db.get(`SELECT * FROM ${table} WHERE sessionId = ?`, [sessionId], (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  },

  async listSessions(platform = 'telegram') {
    return new Promise((resolve, reject) => {
      const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
      db.all(`SELECT sessionId FROM ${table}`, (err, sessions) => {
        if (err) reject(err);
        else resolve(sessions);
      });
    });
  },

  async deleteSession(sessionId, platform = 'telegram') {
    return new Promise((resolve, reject) => {
      const table = platform === 'whatsapp' ? 'whatsapp_sessions' : 'telegram_sessions';
      db.run(`DELETE FROM ${table} WHERE sessionId = ?`, [sessionId], (err) => {
        if (err) {
          console.error('Error al eliminar sesión:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },

  async saveGeminiKey(accountId, apiKey) {
    return new Promise((resolve, reject) => {
      db.run(
        `INSERT OR REPLACE INTO gemini_keys (accountId, apiKey) VALUES (?, ?)`,
        [accountId, apiKey],
        (err) => {
          if (err) {
            console.error('Error al guardar API key de Gemini:', err.message);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  },

  async getGeminiKey(accountId) {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM gemini_keys WHERE accountId = ?`, [accountId], (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
  },

  async deleteGeminiKey(accountId) {
    return new Promise((resolve, reject) => {
      db.run(`DELETE FROM gemini_keys WHERE accountId = ?`, [accountId], (err) => {
        if (err) {
          console.error('Error al eliminar API key de Gemini:', err.message);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  },
};

export default Database;