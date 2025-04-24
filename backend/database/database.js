import sqlite3 from 'sqlite3';

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
      db.run(
        `
        CREATE TABLE IF NOT EXISTS telegram_sessions (
          sessionId TEXT NOT NULL,
          sessionString TEXT NOT NULL,
          apiId TEXT NOT NULL,
          apiHash TEXT NOT NULL,
          phoneNumber TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sessionId)
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
          sessionPath TEXT NOT NULL,
          phoneNumber TEXT NOT NULL,
          authMethod TEXT NOT NULL,
          platform TEXT NOT NULL,
          createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (sessionId)
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

  async saveSession(sessionId, sessionData, apiId, apiHash, phoneNumber, platform = 'telegram', authMethod = '') {
    return new Promise((resolve, reject) => {
      if (platform === 'whatsapp') {
        db.run(
          `INSERT OR REPLACE INTO whatsapp_sessions (sessionId, sessionPath, phoneNumber, authMethod, platform) VALUES (?, ?, ?, ?, ?)`,
          [sessionId, sessionData, phoneNumber, authMethod, 'whatsapp'],
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
          `INSERT OR REPLACE INTO telegram_sessions (sessionId, sessionString, apiId, apiHash, phoneNumber) VALUES (?, ?, ?, ?, ?)`,
          [sessionId, sessionData, apiId, apiHash, phoneNumber],
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
};

export default Database;