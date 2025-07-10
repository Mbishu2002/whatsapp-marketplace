/**
 * WhatsApp Marketplace Server
 * 
 * This is the main entry point for the WhatsApp marketplace application.
 * It initializes and starts both the group bot and search bot.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const bodyParser = require('body-parser');
const path = require('path');

// Import bots
let groupBot, searchBot;

try {
  groupBot = require('./src/group-bot');
  console.log('Group bot loaded successfully');
} catch (error) {
  console.error('Failed to load group bot:', error.message);
}

try {
  searchBot = require('./src/search-bot');
  console.log('Search bot loaded successfully');
} catch (error) {
  console.error('Failed to load search bot:', error.message);
}

// Create Express app
const app = express();
app.use(bodyParser.json());

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`[REQ] ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[RES] ${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'src/public')));

// Admin routes
const adminRoutes = require('./src/admin/group-management');
app.use('/api/admin', adminRoutes);

// Import payment routes for Fapshi webhook and payment endpoints
const paymentRoutes = require('./src/routes/payment-routes');
app.use('/api/payment', paymentRoutes); // Mount at /api/payment

// Mount search bot routes if available
if (searchBot && searchBot.router) {
  // Mount the search bot's router at the root path
  // This makes routes like /webhook accessible
  app.use('/', searchBot.router);
  console.log('Search bot routes mounted successfully');
}

// Mount group bot routes if available
if (groupBot && groupBot.router) {
  // Mount the group bot's router
  app.use('/', groupBot.router);
  console.log('Group bot routes mounted successfully');
}

// Set up webhook message processing for WhatsApp Cloud API
if (searchBot) {
  app.post('/webhook', async (req, res) => {
    // Return a '200 OK' response immediately to acknowledge receipt
    res.status(200).send('EVENT_RECEIVED');
    
    try {
      // Process the message asynchronously
      const body = req.body;
      
      // Check if this is a WhatsApp API event
      if (body.object) {
        // Iterate over each entry
        if (body.entry && body.entry.length > 0) {
          body.entry.forEach(async (entry) => {
            // Handle changes
            if (entry.changes && entry.changes.length > 0) {
              const change = entry.changes[0];
              
              // Check if this is a message
              if (change.value && change.value.messages && change.value.messages.length > 0) {
                const message = change.value.messages[0];
                const phoneNumber = message.from;
                
                // Process the message using the search bot
                await searchBot.processWebhookMessage(phoneNumber, message);
              }
            }
          });
        }
      }
    } catch (error) {
      console.error('Error processing webhook:', error);
    }
  });
} else {
  console.warn('Search bot not available or missing router. WhatsApp webhook functionality will be limited.');
  
  // Fallback webhook verification endpoint if search bot is not available
  const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;
  
  app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    if (mode && token && mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      console.log('WEBHOOK_VERIFIED (fallback)'); 
      res.status(200).send(challenge);
    } else if (mode && token) {
      res.sendStatus(403);
    } else {
      res.sendStatus(404);
    }
  });
  
  app.post('/webhook', (req, res) => {
    res.status(503).send('Search bot service unavailable');
  });
}

// Bot info API endpoint
app.get('/api/bot-info', (req, res) => {
  res.json({
    phone: process.env.BOT_PHONE_NUMBER || '+1234567890',
    status: groupBot && groupBot.client ? 'online' : 'offline'
  });
});

// Pairing code API endpoint (primary authentication method)
app.get('/api/pairing-code', (req, res) => {
  if (groupBot && groupBot.getPairingCode) {
    res.json(groupBot.getPairingCode());
  } else {
    res.status(503).json({
      error: 'Group bot not available or pairing code authentication not supported',
      authenticated: false
    });
  }
});

// Authentication status API endpoint
app.get('/api/auth-status', (req, res) => {
  if (groupBot && groupBot.getAuthStatus) {
    res.json(groupBot.getAuthStatus());
  } else {
    res.status(503).json({
      authenticated: false,
      error: 'Group bot not available'
    });
  }
});

// Basic routes
app.get('/', (req, res) => {
  res.send('WhatsApp Marketplace Server is running');
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    groupBot: groupBot ? 'loaded' : 'not loaded',
    searchBot: searchBot ? 'loaded' : 'not loaded',
    openRouter: process.env.USE_OPENROUTER === 'true' ? 'enabled' : 'disabled'
  });
});

// Search bot webhook routes (if search bot is loaded)
if (searchBot && searchBot.setupRoutes) {
  searchBot.setupRoutes(app);
}

// Start server
const PORT = process.env.PORT || 3000;
const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`OpenRouter integration: ${process.env.USE_OPENROUTER === 'true' ? 'enabled' : 'disabled'}`);
});

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  
  // Close bots if they have cleanup methods
  if (groupBot && groupBot.client && groupBot.client.destroy) {
    await groupBot.client.destroy();
  }
  
  server.close(() => {
    console.log('Server shut down');
    process.exit(0);
  });
});
