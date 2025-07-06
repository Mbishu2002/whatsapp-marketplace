/**
 * WhatsApp Search Bot
 * 
 * This module implements the public-facing WhatsApp bot using the WhatsApp Cloud API.
 * It handles user queries, displays search results, and manages interactions with the marketplace.
 */

const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const { processMessage } = require('../services/agent');
const { processGroupCommand, isGroupCommand } = require('../services/agent/group-commands');
require('dotenv').config();

// Initialize Express router instead of a full app
const router = express.Router();

// This allows us to parse JSON in the router
// Note: The main app should also use bodyParser.json()

// WhatsApp API configuration
const WHATSAPP_API_TOKEN = process.env.WHATSAPP_API_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

if (!WHATSAPP_API_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_VERIFY_TOKEN) {
  console.error('Missing WhatsApp API configuration. Please check your .env file.');
  process.exit(1);
}

// Webhook verification endpoint
router.get('/webhook', (req, res) => {
  // Parse params from the webhook verification request
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === WHATSAPP_VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else {
    // Return a '404 Not Found' if mode or token are missing
    res.sendStatus(404);
  }
});

// Webhook for receiving messages
router.post('/webhook', async (req, res) => {
  console.log('--- Incoming webhook POST ---');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));
  // Return a '200 OK' response to all requests
  res.status(200).send('EVENT_RECEIVED');

  const body = req.body;

  // Check if this is an event from a WhatsApp API
  if (body.object) {
    // Iterate over each entry
    if (body.entry && body.entry.length > 0) {
      body.entry.forEach(async (entry) => {
        // Handle changes
        if (entry.changes && entry.changes.length > 0) {
          const change = entry.changes[0];
          console.log('Change:', JSON.stringify(change, null, 2));
          // Check if this is a message
          if (change.value && change.value.messages && change.value.messages.length > 0) {
            const message = change.value.messages[0];
            const phoneNumber = message.from;
            console.log(`Processing message from ${phoneNumber}:`, JSON.stringify(message, null, 2));
            // Process text messages
            if (message.type === 'text') {
              const messageText = message.text.body;
              console.log(`Received text message from ${phoneNumber}: ${messageText}`);
              try {
                if (isGroupCommand(messageText, phoneNumber)) {
                  const response = await processGroupCommand(phoneNumber, messageText);
                  console.log('Group command response:', JSON.stringify(response, null, 2));
                  if (response) {
                    await sendWhatsAppMessage(phoneNumber, response);
                  } else {
                    const response = await processMessage(phoneNumber, messageText);
                    console.log('Agent response (fallback):', JSON.stringify(response, null, 2));
                    await sendWhatsAppMessage(phoneNumber, response);
                  }
                } else {
                  const response = await processMessage(phoneNumber, messageText);
                  console.log('Agent response:', JSON.stringify(response, null, 2));
                  await sendWhatsAppMessage(phoneNumber, response);
                }
              } catch (error) {
                console.error('Error processing message:', error);
                await sendWhatsAppMessage(phoneNumber, {
                  text: "Sorry, I'm having trouble processing your request right now. Please try again later.",
                  actions: [
                    { type: 'button', text: '🔍 Search Products' },
                    { type: 'button', text: '❓ Help' }
                  ]
                });
              }
            } 
            // Handle button responses
            else if (message.type === 'interactive' && 
                     message.interactive.type === 'button_reply') {
              const buttonId = message.interactive.button_reply.id;
              const buttonText = message.interactive.button_reply.title;
              console.log(`Received button click from ${phoneNumber}: ${buttonText} (${buttonId})`);
              try {
                const response = await processMessage(phoneNumber, buttonText);
                console.log('Button response:', JSON.stringify(response, null, 2));
                await sendWhatsAppMessage(phoneNumber, response);
              } catch (error) {
                console.error('Error processing button click:', error);
                await sendWhatsAppMessage(phoneNumber, {
                  text: "Sorry, I'm having trouble processing your request right now. Please try again later.",
                  actions: [
                    { type: 'button', text: '🔍 Search Products' },
                    { type: 'button', text: '❓ Help' }
                  ]
                });
              }
            }
            // Handle other message types (media, location, etc.)
            else {
              console.log(`Received unsupported message type from ${phoneNumber}: ${message.type}`);
              await sendWhatsAppMessage(phoneNumber, {
                text: "Sorry, I can only process text messages right now. Please send your query as text.",
                actions: [
                  { type: 'button', text: '🔍 Search Products' },
                  { type: 'button', text: '📋 Register Group' },
                  { type: 'button', text: '❓ Help' }
                ]
              });
            }
          }
        }
      });
    }
  }
});

/**
 * Send a message to a WhatsApp user
 * @param {string} to - The recipient's phone number
 * @param {Object} responseObj - The response object from the agent
 */
async function sendWhatsAppMessage(to, responseObj) {
  try {
    // Support both 'text' and 'reply' fields for agent responses
    const text = responseObj?.text || responseObj?.reply;
    const actions = responseObj?.actions;

    // Prepare the message payload
    let messageData;

    // If we have actions, create an interactive message
    if (actions && actions.length > 0) {
      // WhatsApp only supports up to 3 buttons
      const buttons = actions.slice(0, 3).map((action, index) => ({
        type: 'reply',
        reply: {
          id: `btn_${index}`,
          title: action.text
        }
      }));

      messageData = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: text || "Sorry, I couldn't generate a response."
          },
          action: {
            buttons
          }
        }
      };
    } else {
      // Simple text message
      messageData = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          body: text || "Sorry, I couldn't generate a response."
        }
      };
    }

    // Send the message
    const apiResponse = await axios.post(
      `https://graph.facebook.com/v17.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      messageData,
      {
        headers: {
          'Authorization': `Bearer ${WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`Message sent to ${to}:`, apiResponse.data);
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
  }
}

/**
 * Initialize the search bot
 * This doesn't start a server, just sets up the necessary components
 */
function initialize() {
  console.log('Search bot initialized');
}

/**
 * Process a message from the webhook
 * @param {string} phoneNumber - The sender's phone number
 * @param {Object} message - The message object from WhatsApp
 */
async function processWebhookMessage(phoneNumber, message) {
  try {
    if (message.type === 'text') {
      const messageText = message.text.body;
      console.log(`Processing message from ${phoneNumber}: ${messageText}`);
      
      // Check if this is a group registration command
      if (isGroupCommand(messageText, phoneNumber)) {
        // Process group registration command
        const response = await processGroupCommand(phoneNumber, messageText);
        
        // Send the response back to the user
        if (response) {
          await sendWhatsAppMessage(phoneNumber, response);
          return;
        }
      }
      
      // Process the message using our agent system
      const response = await processMessage(phoneNumber, messageText);
      
      // Send the response back to the user
      await sendWhatsAppMessage(phoneNumber, response);
    } 
    else if (message.type === 'interactive' && message.interactive.type === 'button_reply') {
      const buttonText = message.interactive.button_reply.title;
      console.log(`Processing button click from ${phoneNumber}: ${buttonText}`);
      
      // Process the button click as a message
      const response = await processMessage(phoneNumber, buttonText);
      
      // Send the response back to the user
      await sendWhatsAppMessage(phoneNumber, response);
    }
    else {
      console.log(`Received unsupported message type from ${phoneNumber}: ${message.type}`);
      
      // Send a fallback message
      await sendWhatsAppMessage(phoneNumber, {
        text: "Sorry, I can only process text messages right now. Please send your query as text.",
        actions: [
          { type: 'button', text: '🔍 Search Products' },
          { type: 'button', text: '📋 Register Group' },
          { type: 'button', text: '❓ Help' }
        ]
      });
    }
  } catch (error) {
    console.error('Error processing webhook message:', error);
  }
}

module.exports = {
  initialize,
  router,
  processWebhookMessage,
  sendWhatsAppMessage
};
