/**
 * WhatsApp Group Bot API Routes
 * 
 * Provides endpoints for managing WhatsApp sessions and authentication
 */

const express = require('express');
const router = express.Router();
const sessionManager = require('./session-manager');

/**
 * Create or get a WhatsApp session
 * GET /api/whatsapp/session/:clientId
 */
router.get('/session/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    // Create or get session
    await sessionManager.createSession(clientId);
    
    // Get authentication status
    const isAuthenticated = sessionManager.getSessionStatus(clientId);
    
    res.json({
      clientId,
      authenticated: isAuthenticated
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: 'Failed to create WhatsApp session' });
  }
});

/**
 * Request a pairing code for phone authentication (primary authentication method)
 * POST /api/whatsapp/session/:clientId/pair
 * Body: { phoneNumber: "12025550108" }
 */
router.post('/session/:clientId/pair', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Format phone number (remove any non-numeric characters)
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    // Request pairing code
    const pairingCode = await sessionManager.requestPairingCode(clientId, formattedPhone);
    
    if (!pairingCode) {
      return res.status(500).json({ error: 'Failed to generate pairing code' });
    }
    
    res.json({ 
      clientId, 
      pairingCode,
      instructions: [
        "Open WhatsApp on your phone",
        "Go to Settings > Linked Devices > Link a Device",
        `When prompted, enter the pairing code: ${pairingCode}`
      ]
    });
  } catch (error) {
    console.error('Error requesting pairing code:', error);
    res.status(500).json({ error: 'Failed to request pairing code' });
  }
});

/**
 * Get pairing code for a session
 * GET /api/whatsapp/session/:clientId/pairing-code
 */
router.get('/session/:clientId/pairing-code', (req, res) => {
  try {
    const { clientId } = req.params;
    const pairingCode = sessionManager.getSessionPairingCode(clientId);
    const isAuthenticated = sessionManager.getSessionStatus(clientId);
    
    if (pairingCode) {
      return res.json({ 
        clientId, 
        pairingCode,
        authenticated: false,
        instructions: [
          "Open WhatsApp on your phone",
          "Go to Settings > Linked Devices > Link a Device",
          `When prompted, enter the pairing code: ${pairingCode}`
        ]
      });
    }
    
    if (isAuthenticated) {
      return res.json({ clientId, authenticated: true, message: 'Already authenticated' });
    }
    
    return res.json({ 
      clientId,
      authenticated: false,
      message: 'No pairing code available. Request one first.',
      requestEndpoint: `/api/whatsapp/session/${clientId}/pair`
    });
  } catch (error) {
    console.error('Error getting pairing code:', error);
    res.status(500).json({ error: 'Failed to get pairing code' });
  }
});

/**
 * Get session status
 * GET /api/whatsapp/session/:clientId/status
 */
router.get('/session/:clientId/status', (req, res) => {
  try {
    const { clientId } = req.params;
    const isAuthenticated = sessionManager.getSessionStatus(clientId);
    
    res.json({
      clientId,
      authenticated: isAuthenticated
    });
  } catch (error) {
    console.error('Error getting session status:', error);
    res.status(500).json({ error: 'Failed to get session status' });
  }
});

/**
 * Close a session
 * DELETE /api/whatsapp/session/:clientId
 */
router.delete('/session/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    await sessionManager.closeSession(clientId);
    
    res.json({ success: true, message: `Session ${clientId} closed` });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(500).json({ error: 'Failed to close session' });
  }
});

/**
 * List all active sessions
 * GET /api/whatsapp/sessions
 */
router.get('/sessions', (req, res) => {
  try {
    const sessions = sessionManager.getAllSessions();
    res.json({ sessions });
  } catch (error) {
    console.error('Error listing sessions:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
});

module.exports = router;
