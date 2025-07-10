/**
 * WhatsApp Group Bot API Routes
 * 
 * Provides endpoints for managing WhatsApp sessions and authentication
 */

const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const sessionManager = require('./session-manager');

// Only the /pair endpoint is provided as requested
router.post('/pair', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    const formattedPhone = phoneNumber.replace(/[^\d]/g, '');
    const clientId = uuidv4();

    await sessionManager.createSession(clientId, formattedPhone);

    // Wait for pairing code to be generated (polling)
    const waitForPairingCode = () => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for pairing code')), 60000);
      const check = () => {
        const code = sessionManager.getPairingCode(clientId);
        if (code) {
          clearTimeout(timeout);
          resolve(code);
        } else {
          setTimeout(check, 1000);
        }
      };
      check();
    });

    const pairingCode = await waitForPairingCode();

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
    res.status(500).json({ error: error.message || 'Failed to generate pairing code' });
  }
});

module.exports = router;
