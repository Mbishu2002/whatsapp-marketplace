/**
 * OpenRouter Integration for WhatsApp Marketplace
 * 
 * This module exports the OpenRouter agent functionality
 * and provides integration with the existing WhatsApp bots.
 */

const agent = require('./agent');
const systemPrompt = require('./system-prompt');
const client = require('./client');

module.exports = {
  // Export agent functionality
  processMessage: agent.processMessage,
  extractProductListing: agent.extractProductListing,
  processSearchQuery: agent.processSearchQuery,
  getUserSession: agent.getUserSession,
  
  // Export system prompt generators
  getBaseSystemPrompt: systemPrompt.getBaseSystemPrompt,
  getContextAwareSystemPrompt: systemPrompt.getContextAwareSystemPrompt,
  getListingExtractionPrompt: systemPrompt.getListingExtractionPrompt,
  getSearchHandlingPrompt: systemPrompt.getSearchHandlingPrompt,
  
  // Export OpenRouter client functions
  sendMessage: client.sendMessage,
  streamResponse: client.streamResponse
};
