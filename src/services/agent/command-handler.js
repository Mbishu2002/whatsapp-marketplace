/**
 * Command Handler for WhatsApp Bot
 * 
 * This module handles command processing for the WhatsApp bot.
 * It routes commands to their appropriate handlers.
 */

const { handleSubscriptionCommands } = require('../../search-bot/commands/subscription');
const { handleBoostCommands } = require('../../search-bot/commands/boost');
const { handleFapshiCommands } = require('../../search-bot/commands/fapshi');

/**
 * Process a command message
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {string} text - Message text
 * @returns {boolean} - True if command was handled, false otherwise
 */
async function processCommand(client, message, text) {
  // Check if message starts with a command prefix
  if (!text.startsWith('!')) {
    return false;
  }
  
  // Extract command and arguments
  const parts = text.slice(1).split(' ');
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  // Route command to appropriate handler
  switch (command) {
    case 'subscription':
    case 'subscribe':
      await handleSubscriptionCommands(client, message, args);
      return true;
      
    case 'boost':
      await handleBoostCommands(client, message, args);
      return true;

    case 'fapshi':
      await handleFapshiCommands(client, message, args);
      return true;
      
    // Add more command handlers here
      
    default:
      return false;
  }
}

module.exports = {
  processCommand
};
