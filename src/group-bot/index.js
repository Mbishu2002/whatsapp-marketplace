const { Client, RemoteAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const supabase = require('../database/supabase');
const { users, listings } = require('../database/schema');
const listingParser = require('./listing-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import session manager for multi-session support
const sessionManager = require('./session-manager');

// Import WhatsApp routes
const whatsappRoutes = require('./routes');

// Import MongoDB modules for session storage
const { MongoStore } = require('wwebjs-mongo');
const { connectToMongoDB, mongoose } = require('../database/mongodb');

// Create Express router
const router = express.Router();

// Use WhatsApp routes
router.use('/api/whatsapp', whatsappRoutes);

// Import OpenRouter agent if available
let openRouterAgent;
try {
  openRouterAgent = require('../services/openrouter');
} catch (error) {
  console.log('OpenRouter agent not available, using built-in listing parser only');
}

// Configuration
const USE_OPENROUTER = process.env.USE_OPENROUTER === 'true' && openRouterAgent;

// Configuration for message filtering
const ONLY_PROCESS_OWN_MESSAGES = process.env.ONLY_PROCESS_OWN_MESSAGES === 'true';

// Store the latest pairing code and authentication status
let latestPairingCode = null;
let isAuthenticated = false;

// In-memory session cache
const sessionCache = {};

// Initialize WhatsApp Web client with RemoteAuth
let client;

// Function to initialize the client with MongoDB store
async function initializeClient() {
  try {
    // Connect to MongoDB first
    await connectToMongoDB();
    
    // Create a MongoDB store for WhatsApp sessions
    const store = new MongoStore({ mongoose: mongoose });
    
    // Initialize the WhatsApp client with RemoteAuth
    client = new Client({
      authStrategy: new RemoteAuth({
        store: store,
        clientId: 'group-bot',
        backupSyncIntervalMs: 300000 // Backup every 5 minutes
      }),
      puppeteer: {
        args: ['--no-sandbox'],
      },
      qrMaxRetries: 5,
      takeoverOnConflict: true,
      takeoverTimeoutMs: 10000,
    });
    
    // Set up event handlers
    setupEventHandlers();
    
    // Initialize the client
    console.log('Initializing WhatsApp Web client with MongoDB session storage...');
    client.initialize();
    
    return client;
  } catch (error) {
    console.error('Failed to initialize WhatsApp client with MongoDB:', error);
    throw error;
  }
}

// Set up event handlers
function setupEventHandlers() {
  client.on('authenticated', () => {
    console.log('Group bot authenticated');
    isAuthenticated = true;
    latestPairingCode = null; // Clear pairing code once authenticated
  });

  client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
  });
  
  // Add remote auth specific events
  client.on('remote_session_saved', () => {
    console.log('Session saved to MongoDB');
  });
  
  // Listen for all messages
  client.on('message', onMessage);

  // Listen for messages created by the bot's own account
  client.on('message_create', (message) => {
    console.log('Message created by bot account:', message.body);
    onMessage(message);
  });
}

// Track groups we're monitoring
const monitoredGroups = new Set();

/**
 * Load monitored groups from the database
 */
async function loadMonitoredGroups() {
  try {
    console.log('Loading monitored groups from database...');
    const { data, error } = await supabase
      .from('groups')
      .select('id, name, category');
    
    if (error) {
      console.error('Error loading monitored groups:', error);
      return;
    }
    
    // Add each group to the in-memory set
    if (data && data.length > 0) {
      data.forEach(group => {
        monitoredGroups.add(group.id);
        console.log(`Loaded group: ${group.name} (${group.id})`);
      });
      console.log(`Loaded ${data.length} monitored groups`);
    } else {
      console.log('No monitored groups found in database');
    }
  } catch (err) {
    console.error('Error loading monitored groups:', err);
  }
}

/**
 * Add a group to be monitored for listings
 * @param {string} groupId - The WhatsApp group ID
 * @param {string} groupName - The name of the group
 * @param {string} category - Optional category for the group
 */
async function addMonitoredGroup(groupId, groupName, category = null) {
  try {
    // Add to database if not exists
    const { data, error } = await supabase
      .from('groups')
      .upsert([
        { 
          id: groupId, 
          name: groupName,
          category
        }
      ], { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select();
    
    if (error) throw error;
    
    // Add to in-memory set
    monitoredGroups.add(groupId);
    console.log(`Now monitoring group: ${groupName} (${groupId})`);
    
    return data[0];
  } catch (err) {
    console.error('Error adding monitored group:', err);
    throw err;
  }
}

/**
 * Process a message from a monitored group
 * @param {Object} message - The WhatsApp message object
 */
async function processGroupMessage(message) {
  try {
    // Skip if not from a monitored group
    if (!message.from.endsWith('@g.us') || !monitoredGroups.has(message.from)) {
      return;
    }
    
    // Get the chat to access group info
    const chat = await message.getChat();
    
    // Process message to check if it contains a product listing
    const listing = await processMessage(message);
    if (!listing) return;
    
    console.log(`Potential listing detected in ${chat.name}`);
    
    // Get contact info of sender
    const contact = await message.getContact();
    const phoneNumber = contact.number;
    const name = contact.name || contact.pushname || phoneNumber;
    
    // Create or get user
    let user = await users.getByPhone(supabase, phoneNumber);
    if (!user) {
      user = await users.create(supabase, {
        phone: phoneNumber,
        name: name
      });
    }
    
    // Create the listing
    const listingData = await listings.create(supabase, {
      title: listing.title,
      description: listing.description,
      price: listing.price,
      currency: listing.currency || 'FCFA',
      location: listing.location,
      category: listing.category,
      seller_id: user.id,
      group_id: chat.id._serialized,
      status: 'active'
    });
    
    console.log(`Created new listing: ${listing.title} (${listing.id})`);
    
    // Handle media if present (multiple images/videos)
    let mediaUrls = [];
    if (message.hasMedia) {
      try {
        // Collect all media messages from the same sender in the group within a short time window (5 seconds)
        const messages = await chat.fetchMessages({ limit: 20 });
        const now = Date.now();
        const senderId = contact.id._serialized;
        // Filter messages: from same sender, has media, within 5 seconds of the current message
        const relatedMediaMessages = messages.filter(m =>
          m.hasMedia &&
          m.author === senderId &&
          Math.abs(m.timestamp * 1000 - message.timestamp * 1000) < 5000
        );
        // Always include the current message
        if (!relatedMediaMessages.find(m => m.id._serialized === message.id._serialized)) {
          relatedMediaMessages.push(message);
        }
        for (const msg of relatedMediaMessages) {
          const media = await msg.downloadMedia();
          const fileName = `listing_${listingData.id}_${Date.now()}.${media.mimetype.split('/')[1]}`;
          // Upload to Supabase storage directly from memory
          const { data, error } = await supabase.storage
            .from('listing-images')
            .upload(`${listingData.id}/${fileName}`, Buffer.from(media.data, 'base64'), {
              contentType: media.mimetype
            });
          if (error) {
            console.error('Error uploading image to Supabase:', error);
          } else {
            const imageUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/listing-images/${data.path}`;
            mediaUrls.push(imageUrl);
          }
        }
        // Update listing with all media URLs
        if (mediaUrls.length > 0) {
          await listings.update(supabase, listingData.id, { media_urls: mediaUrls });
        }
      } catch (mediaError) {
        console.error('Error handling media:', mediaError);
      }
    }
    
    return listing;
  } catch (err) {
    console.error('Error processing group message:', err);
  }
}

/**
 * Process a message to check if it contains a product listing
 * @param {Object} message - The WhatsApp message object
 * @returns {Promise<Object|null>} The extracted listing or null if not a listing
 */
async function processMessage(message) {
  try {
    const chat = await message.getChat();
    
    // Only process messages from groups
    if (!chat.isGroup) return null;
    
    let listing = null;
    
    // Try to use OpenRouter for advanced extraction if available
    if (USE_OPENROUTER && openRouterAgent) {
      try {
        listing = await openRouterAgent.extractProductListing(message.body);
        console.log('Used OpenRouter for listing extraction');
      } catch (aiError) {
        console.error('Error using AI for listing extraction:', aiError);
        // Fallback to built-in parser
        listing = await listingParser.extractListingDetails(message.body);
      }
    } else {
      // Check if it's a listing first
      const isListing = await listingParser.isProductListing(message.body);
      if (!isListing) return null;
      
      // Use built-in parser
      listing = await listingParser.extractListingDetails(message.body);
    }
    
    // If not a listing or extraction failed, return null
    if (!listing) return null;
    
    // Get contact info of the sender
    const contact = await message.getContact();
    const phoneNumber = contact.number;
    const name = contact.name || contact.pushname || phoneNumber;
    
    // Add sender info to the listing
    listing.sellerPhone = phoneNumber;
    listing.sellerName = name;
    listing.groupId = chat.id._serialized;
    listing.groupName = chat.name;
    listing.messageId = message.id._serialized;
    
    return listing;
  } catch (error) {
    console.error('Error processing message:', error);
    return null;
  }
}

// Command handler for group registration
async function handleCommands(message) {
  try {
    // Check if it's a command (starts with !)
    if (!message.body.startsWith('!')) {
      console.log('Not a command, skipping command handler');
      return false;
    }
    
    console.log(`Command received: ${message.body}`);
    
    const command = message.body.split(' ')[0].toLowerCase();
    const args = message.body.split(' ').slice(1);
    console.log(`Parsed command: ${command}, args:`, args);
    
    // Get the chat to access group info
    const chat = await message.getChat();
    
    // Only process commands in groups
    if (!chat.isGroup) {
      await message.reply('Commands can only be used in groups.');
      return true;
    }
    
    // Handle !register command
    if (command === '!register') {
      console.log('Register command detected!');
      const category = args.join(' ') || 'general';
      console.log(`Registering group with category: ${category}`);
      
      try {
        console.log('Group details:', { 
          id: chat.id._serialized, 
          name: chat.name, 
          participants: chat.participants ? chat.participants.length : 'unknown' 
        });
        
        // Add the group to monitored groups
        console.log('Calling addMonitoredGroup...');
        await addMonitoredGroup(chat.id._serialized, chat.name, category);
        console.log('addMonitoredGroup completed successfully');
        
        // Send confirmation message
        console.log('Sending confirmation message to chat...');
        await chat.sendMessage(`✅ This group has been registered as a marketplace for category: *${category}*\n\nThe bot will now monitor messages for product listings.`);
        console.log('Confirmation message sent');
        
        console.log(`Group registered: ${chat.name} (${chat.id._serialized}) - Category: ${category}`);
        return true;
      } catch (error) {
        console.error('Error registering group:', error);
        console.error('Error details:', error.stack);
        try {
          await chat.sendMessage('❌ Error registering this group. Please try again later.');
          console.log('Error message sent to chat');
        } catch (sendError) {
          console.error('Failed to send error message:', sendError);
        }
        return true;
      }
    }
    
    // Handle !status command
    if (command === '!status') {
      const isMonitored = monitoredGroups.has(chat.id._serialized);
      
      if (isMonitored) {
        await chat.sendMessage('✅ This group is currently being monitored for marketplace listings.');
      } else {
        await chat.sendMessage('❌ This group is not registered. Use !register [category] to start monitoring.');
      }
      
      return true;
    }
    
    // Handle !help command
    if (command === '!help') {
      await chat.sendMessage(`*WhatsApp Marketplace Bot Commands*\n\n!register [category] - Register this group for marketplace listings\n!status - Check if this group is being monitored\n!addstatus [message] - Add the message to your WhatsApp status\n!help - Show this help message`);
      return true;
    }
    
    // Handle !addstatus command
    if (command === '!addstatus') {
      const statusMessage = args.join(' ');
      
      if (!statusMessage) {
        await chat.sendMessage('❌ Please provide a message to add to your status. Example: !addstatus Check out this great deal!');
        return true;
      }
      
      try {
        console.log('Attempting to send status update to status@broadcast...');
        
        // Try to send message to status@broadcast
        await client.sendMessage('status@broadcast', statusMessage);
        
        await chat.sendMessage('✅ Attempted to add your message to WhatsApp status!');
        console.log(`Status message sent to status@broadcast: ${statusMessage}`);
        return true;
      } catch (error) {
        console.error('Error updating status:', error);
        await chat.sendMessage('❌ Failed to update your WhatsApp status. Please try again later.');
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error handling command:', error);
    return false;
  }
}

// Message handler pipeline
async function onMessage(message) {
  try {
    console.log('Message received:', message.body);
    console.log('Message from:', message.from);
    console.log('Message type:', message.type);
    console.log('Message has media:', message.hasMedia);
    console.log('Message fromMe:', message.fromMe);
    
    // Get the chat to check if it's a group
    const chat = await message.getChat();
    console.log('Message from chat:', chat.name, 'isGroup:', chat.isGroup);
    
    // Log group ID for registration purposes
    if (chat.isGroup) {
      console.log('GROUP ID FOR REGISTRATION:', chat.id._serialized);
      console.log('GROUP NAME FOR REGISTRATION:', chat.name);
      console.log('GROUP PARTICIPANTS:', chat.participants.length);
      console.log('IS BOT ADMIN:', chat.isAdmin);
    }
    
    // Skip processing if we only want to process our own messages and this is not from us
    if (ONLY_PROCESS_OWN_MESSAGES && !message.fromMe) {
      console.log('Skipping message: Not from bot account and ONLY_PROCESS_OWN_MESSAGES is enabled');
      return;
    }
    
    // First check if it's a command
    console.log('Checking if message is a command...');
    const isCommand = await handleCommands(message);
    console.log('Is command result:', isCommand);
    
    if (isCommand) {
      console.log('Command processed, skipping listing processing');
      return;
    }
    
    // If not a command, process as a potential listing
    console.log('Processing message as potential listing...');
    await processGroupMessage(message);
  } catch (error) {
    console.error('Error in message handler:', error);
  }
}

// These event handlers are now set up in the setupEventHandlers function

// Initialize and export the client
async function initialize() {
  try {
    // If client is already initialized, return it
    if (client) return client;
    
    // Otherwise initialize with MongoDB
    return await initializeClient();
  } catch (error) {
    console.error('Error initializing WhatsApp client:', error);
    throw error;
  }
}

// Initialize the client immediately
initialize().catch(err => {
  console.error('Failed to initialize WhatsApp client:', err);
});

/**
 * Request a pairing code for phone number authentication
 * @param {string} phoneNumber - Phone number in international format without symbols
 * @returns {Promise<string|null>} The pairing code or null if failed
 */
async function requestPairingCode(phoneNumber) {
  try {
    if (!client) {
      console.error('Client not initialized');
      return null;
    }
    
    if (isAuthenticated) {
      console.log('Already authenticated, no need for pairing code');
      return null;
    }
    
    // Request pairing code from WhatsApp
    latestPairingCode = await client.requestPairingCode(phoneNumber);
    console.log(`Pairing code generated: ${latestPairingCode}`);
    
    return latestPairingCode;
  } catch (error) {
    console.error('Error requesting pairing code:', error);
    return null;
  }
}

/**
 * Get the authentication status
 * @returns {Object} Object containing authentication status
 */
function getAuthStatus() {
  return {
    authenticated: isAuthenticated
  };
}

// API endpoints for pairing code authentication
router.get('/api/group-bot/pairing-code', (req, res) => {
  console.log('Pairing code endpoint called, code available:', !!latestPairingCode, 'Authenticated:', isAuthenticated);
  if (latestPairingCode) {
    res.json({ 
      pairingCode: latestPairingCode, 
      authenticated: false,
      instructions: [
        "Open WhatsApp on your phone",
        "Go to Settings > Linked Devices > Link a Device",
        `When prompted, enter the pairing code: ${latestPairingCode}`
      ]
    });
  } else if (isAuthenticated) {
    res.json({ authenticated: true, message: 'Already authenticated' });
  } else {
    res.json({ waiting: true, message: 'No pairing code available. Request one first.' });
  }
});

router.post('/api/group-bot/request-pairing-code', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    
    // Format phone number (remove any non-numeric characters)
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    
    // Request pairing code
    const pairingCode = await requestPairingCode(formattedPhone);
    
    if (!pairingCode) {
      return res.status(500).json({ error: 'Failed to generate pairing code' });
    }
    
    res.json({ pairingCode });
  } catch (error) {
    console.error('Error requesting pairing code:', error);
    res.status(500).json({ error: 'Failed to request pairing code' });
  }
});

module.exports = {
  initialize,
  client,
  addMonitoredGroup,
  requestPairingCode,
  getAuthStatus,
  router,
  sessionManager
};
