/**
 * WhatsApp Session Manager
 * 
 * Manages multiple WhatsApp Web.js client sessions using MongoDB for persistence
 * Supports both QR code and pairing code authentication
 */

const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const { connectToMongoDB, mongoose } = require('../database/mongodb');
const qrcode = require('qrcode-terminal');

// Store active clients and authentication data
const activeClients = new Map();
const qrCodes = new Map();
const authStatus = new Map();
const pairingCodes = new Map();

// MongoDB store for sessions
let store = null;

/**
 * Initialize the MongoDB store
 * @returns {Promise<MongoStore>} The initialized MongoDB store
 */
async function initializeStore() {
  if (store) return store;
  
  try {
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Create and return the store
    store = new MongoStore({ mongoose });
    return store;
  } catch (error) {
    console.error('Failed to initialize MongoDB store:', error);
    throw error;
  }
}

/**
 * Create a new WhatsApp client session
 * @param {string} clientId - Unique identifier for this client session
 * @param {Object} options - Additional options for the client
 * @returns {Promise<Client>} The initialized WhatsApp client
 */
async function createSession(clientId, options = {}) {
  try {
    // Check if session already exists
    if (activeClients.has(clientId)) {
      console.log(`Session ${clientId} already exists, returning existing client`);
      return activeClients.get(clientId);
    }
    
    // Initialize store if needed
    const sessionStore = await initializeStore();
    
    // Create client with RemoteAuth
    const client = new Client({
      authStrategy: new RemoteAuth({
        store: sessionStore,
        clientId: clientId,
        backupSyncIntervalMs: 300000 // Backup every 5 minutes
      }),
      puppeteer: {
        args: ['--no-sandbox'],
      },
      qrMaxRetries: 5,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
      ...options
    });
    
    // Set up event handlers
    client.on('qr', async (qr) => {
      console.log(`QR RECEIVED for session ${clientId}. Using pairing code authentication only.`);
      // Store the QR code internally but don't display it
      qrCodes.set(clientId, qr);
      authStatus.set(clientId, false);
      // Only generate pairing code if phoneNumber is provided in options
      const phoneNumber = options.phoneNumber;
      if (phoneNumber) {
        try {
          console.log(`Requesting pairing code for session ${clientId} (phone: ${phoneNumber})`);
          const pairingCode = await client.requestPairingCode(phoneNumber);
          console.log(`✅ PAIRING CODE GENERATED for session ${clientId}: ${pairingCode}`);
          console.log(`📱 Open WhatsApp on your phone > Settings > Linked Devices > Link a Device`);
          console.log(`📝 When prompted for the pairing code, enter: ${pairingCode}`);
          pairingCodes.set(clientId, pairingCode);
        } catch (error) {
          console.error(`Failed to generate pairing code for session ${clientId}:`, error);
        }
      } else {
        console.error('No phone number provided for pairing code authentication. Cannot generate pairing code.');
      }
    });
    
    client.on('ready', () => {
      console.log(`Client ${clientId} is ready!`);
      authStatus.set(clientId, true);
      qrCodes.delete(clientId);
      pairingCodes.delete(clientId);
    });
    
    client.on('authenticated', () => {
      console.log(`Client ${clientId} authenticated`);
      authStatus.set(clientId, true);
      qrCodes.delete(clientId);
      pairingCodes.delete(clientId);
    });
    
    client.on('auth_failure', (msg) => {
      console.error(`Authentication failure for client ${clientId}:`, msg);
      authStatus.set(clientId, false);
    });
    
    client.on('remote_session_saved', () => {
      console.log(`Session ${clientId} saved to MongoDB`);
    });
    
    client.on('disconnected', async (reason) => {
      console.log(`Client ${clientId} was disconnected:`, reason);
      authStatus.set(clientId, false);
      // Remove session from MongoDB
      if (store && typeof store.delete === 'function') {
        try {
          await store.delete({ session: clientId });
          console.log(`Session document for ${clientId} deleted from MongoDB after disconnect.`);
        } catch (err) {
          console.error(`Failed to delete session document for ${clientId} after disconnect:`, err);
        }
      }
    });
    
    // Initialize the client
    console.log(`Initializing WhatsApp client ${clientId}...`);
    client.initialize();
    
    // Store the client
    activeClients.set(clientId, client);
    
    return client;
  } catch (error) {
    console.error(`Error creating session ${clientId}:`, error);
    throw error;
  }
}

/**
 * Get an existing client session
 * @param {string} clientId - The client ID to retrieve
 * @returns {Client|null} The WhatsApp client or null if not found
 */
function getSession(clientId) {
  return activeClients.get(clientId) || null;
}

/**
 * Get all active sessions
 * @returns {Map<string, Client>} Map of all active clients
 */
function getAllSessions() {
  return activeClients;
}

/**
 * Get QR code for a session
 * @param {string} clientId - The client ID
 * @returns {string|null} The QR code or null if not available
 */
function getSessionQR(clientId) {
  return qrCodes.get(clientId) || null;
}

/**
 * Request a pairing code for phone number authentication
 * @param {string} clientId - The client ID
 * @param {string} phoneNumber - Phone number in international format without symbols (e.g., 12025550108)
 * @returns {Promise<string|null>} The pairing code or null if failed
 */
async function requestPairingCode(clientId, phoneNumber) {
  try {
    const client = activeClients.get(clientId);
    if (!client) {
      console.error(`Client ${clientId} not found`);
      return null;
    }
    
    // Request pairing code from WhatsApp
    const pairingCode = await client.requestPairingCode(phoneNumber);
    console.log(`Pairing code for ${clientId} (${phoneNumber}): ${pairingCode}`);
    
    // Store the pairing code
    pairingCodes.set(clientId, pairingCode);
    
    return pairingCode;
  } catch (error) {
    console.error(`Error requesting pairing code for ${clientId}:`, error);
    return null;
  }
}

/**
 * Get pairing code for a session
 * @param {string} clientId - The client ID
 * @returns {string|null} The pairing code or null if not available
 */
function getSessionPairingCode(clientId) {
  return pairingCodes.get(clientId) || null;
}

/**
 * Get authentication status for a session
 * @param {string} clientId - The client ID
 * @returns {boolean} Whether the session is authenticated
 */
function getSessionStatus(clientId) {
  return authStatus.get(clientId) || false;
}

/**
 * Close a client session
 * @param {string} clientId - The client ID to close
 * @returns {Promise<boolean>} Whether the session was closed successfully
 */
async function closeSession(clientId) {
  try {
    const client = activeClients.get(clientId);
    if (!client) return false;
    
    // Destroy the client
    await client.destroy();
    
    // Remove from maps
    activeClients.delete(clientId);
    qrCodes.delete(clientId);
    authStatus.delete(clientId);
    
    // Remove session from MongoDB
    if (store && typeof store.delete === 'function') {
      try {
        await store.delete({ session: clientId });
        console.log(`Session document for ${clientId} deleted from MongoDB after close.`);
      } catch (err) {
        console.error(`Failed to delete session document for ${clientId} after close:`, err);
      }
    }
    console.log(`Session ${clientId} closed successfully`);
    return true;
  } catch (error) {
    console.error(`Error closing session ${clientId}:`, error);
    return false;
  }
}

module.exports = {
  createSession,
  getSession,
  getAllSessions,
  getSessionQR,
  getSessionStatus,
  closeSession,
  requestPairingCode,
  getSessionPairingCode
};
