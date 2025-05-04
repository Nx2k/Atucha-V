import express from 'express';
import GeminiManager from '../../controllers/gemini.controller.js';
import Database from '../../database/Database.js';

const router = express.Router();

// Obtener la API key actual de Gemini para una cuenta
router.get('/:accountId/key', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Verificar que la cuenta existe
    const account = await Database.getAccount(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `No existe una cuenta con el ID: ${accountId}`
      });
    }
    
    const geminiKeyData = await Database.getGeminiKey(accountId);
    if (!geminiKeyData) {
      return res.status(404).json({
        success: false,
        error: 'No hay API key de Gemini configurada para esta cuenta'
      });
    }
    
    return res.status(200).json({
      success: true,
      accountId,
      apiKey: geminiKeyData.apiKey
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Actualizar la API key de Gemini para una cuenta
router.post('/:accountId/key', async (req, res) => {
  try {
    const { accountId } = req.params;
    const { apiKey } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: 'Se requiere una API key'
      });
    }
    
    // Verificar que la cuenta existe
    const account = await Database.getAccount(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `No existe una cuenta con el ID: ${accountId}`
      });
    }
    
    const result = await GeminiManager.updateApiKey(accountId, apiKey);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Verificar si una cuenta tiene una instancia de Gemini activa
router.get('/:accountId/status', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Verificar que la cuenta existe
    const account = await Database.getAccount(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `No existe una cuenta con el ID: ${accountId}`
      });
    }
    
    const geminiKeyData = await Database.getGeminiKey(accountId);
    const hasInstance = geminiKeyData !== null;
    
    return res.status(200).json({
      success: true,
      accountId,
      hasInstance,
      createdAt: geminiKeyData ? geminiKeyData.createdAt : null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Eliminar la API key de Gemini para una cuenta
router.delete('/:accountId/key', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Verificar que la cuenta existe
    const account = await Database.getAccount(accountId);
    if (!account) {
      return res.status(404).json({
        success: false,
        error: `No existe una cuenta con el ID: ${accountId}`
      });
    }
    
    const result = await GeminiManager.deleteInstance(accountId);
    return res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;