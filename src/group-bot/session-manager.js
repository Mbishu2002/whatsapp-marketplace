/**
 * WhatsApp Session Manager
 * 
 * Manages multiple WhatsApp Web.js client sessions using MongoDB for persistence
 * Supports both QR code and pairing code authentication
 */

const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const { connectToMongoDB, mongoose } = require('../database/mongodb');

const activeSessions = new Map();
const pairingCodes = new Map();

let store = null;

async function getStore() {
  if (!store) {
    await connectToMongoDB();
    store = new MongoStore({ mongoose });
  }
  return store;
}

async function createSession(clientId, phoneNumber) {
  await getStore();

  if (activeSessions.has(clientId)) {
    return activeSessions.get(clientId);
    }
    
    const client = new Client({
      authStrategy: new RemoteAuth({
      store,
      clientId,
      backupSyncIntervalMs: 300000
      }),
      puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true
    }
  });

  activeSessions.set(clientId, client);

  // Wait for QR, then request pairing code
  client.on('qr', async () => {
    setTimeout(async () => {
      try {
        const pairingCode = await client.requestPairingCode(phoneNumber);
        pairingCodes.set(clientId, pairingCode);
        } catch (err) {
        pairingCodes.set(clientId, null);
      }
    }, 2000);
    });
    
    client.initialize();
    return client;
}

function getPairingCode(clientId) {
  return pairingCodes.get(clientId) || null;
}

async function closeSession(clientId) {
  const client = activeSessions.get(clientId);
  if (client) {
    await client.destroy();
    activeSessions.delete(clientId);
    pairingCodes.delete(clientId);
  }
}

module.exports = {
  createSession,
  getPairingCode,
  closeSession,
  activeSessions
};
