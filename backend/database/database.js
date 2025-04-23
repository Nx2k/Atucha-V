import sqlite3 from 'sqlite3';

// Configura la base de datos SQLite
const db = new sqlite3.Database('../database/sessions.db', (err) => {
    if (err) {
        console.error('Error al abrir la base de datos de sesiones:', err.message);
        process.exit(1);
    } console.log('Base de datos de sesiones conectada')});

// Función para crear la tabla sessions
const initializeDatabase = () => {
    return new Promise((resolve, reject) => {
        db.run(`
            CREATE TABLE IF NOT EXISTS sessions (
            sessionId TEXT PRIMARY KEY,
            sessionString TEXT NOT NULL,
            apiId TEXT NOT NULL,
            apiHash TEXT NOT NULL,
            phoneNumber TEXT NOT NULL,
            createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            )`,
            (err) => { if (err) reject(err); else resolve() }
        )})};

// Funciones para interactuar con la base de datos
const Database = {
    async initialize() { await initializeDatabase() },

    // Guardar una sesión
    saveSession(sessionId, sessionString, apiId, apiHash, phoneNumber) {
        return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO sessions (sessionId, sessionString, apiId, apiHash, phoneNumber) VALUES (?, ?, ?, ?, ?)`,
        [sessionId, sessionString, apiId, apiHash, phoneNumber], (err) => {
            if (err) { console.error('Error al guardar sesión:', err.message); reject(err);
            } else {
                resolve()
            }})});
    },

    // Obtener una sesión por sessionId
    getSession(sessionId) {
        return new Promise((resolve, reject) => {
        db.get(`SELECT * FROM sessions WHERE sessionId = ?`, [sessionId], (err, data) => {
        if (err) reject(err); else resolve(data)})});
    },

    // Listar todas las sesiones
    listSessions() {
        return new Promise((resolve, reject) => {
        db.all(`SELECT sessionId FROM sessions`, (err, sessions) => {
        if (err) reject(err); else resolve(sessions)})});
    },

    // Eliminar una sesión
    deleteSession(sessionId) {
        return new Promise((resolve, reject) => {
        db.run(`DELETE FROM sessions WHERE sessionId = ?`, [sessionId], (err) => {
        if (err) { console.error('Error al eliminar sesión:', err.message); reject(err);
        } else {
            resolve();
        }})});
    }
};

export default Database;