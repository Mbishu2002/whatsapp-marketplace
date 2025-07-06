/**
 * OpenRouter Agent for WhatsApp Marketplace
 * 
 * This module implements the core agent functionality using OpenRouter
 * to power intelligent marketplace interactions.
 */

const { sendMessage, streamResponse } = require('./client');
const {
  getBaseSystemPrompt,
  getContextAwareSystemPrompt,
  getListingExtractionPrompt,
  getSearchHandlingPrompt
} = require('./system-prompt');
const { extractEntities } = require('../agent/entity-extractor');
const { generateResponse } = require('../agent/response-generator');

// For error handling and fallbacks
const axios = require('axios');

// In-memory session storage (replace with database in production)
const sessions = new Map();

/**
 * Get or create a user session
 * @param {string} userId - The user's WhatsApp ID
 * @returns {Object} The user session
 */
function getUserSession(userId) {
  if (!sessions.has(userId)) {
    sessions.set(userId, {
      userId,
      currentState: 'initial',
      conversationHistory: [],
      lastInteraction: Date.now()
    });
  }
  
  const session = sessions.get(userId);
  session.lastInteraction = Date.now();
  return session;
}

/**
 * Process a user message with the OpenRouter agent
 * @param {string} userId - The user's WhatsApp ID
 * @param {string} message - The user's message
 * @returns {Promise<Object>} The agent's response
 */
async function processMessage(userId, message) {
  const session = getUserSession(userId);
  session.lastMessage = message;
  
  // Add user message to conversation history
  session.conversationHistory.push({
    role: 'user',
    content: message
  });
  
  // Keep conversation history within a reasonable size
  if (session.conversationHistory.length > 20) {
    session.conversationHistory = session.conversationHistory.slice(-20);
  }
  
  // Create messages array for OpenRouter
  const messages = [
    {
      role: 'system',
      content: getContextAwareSystemPrompt(session)
    },
    ...session.conversationHistory
  ];
  
  try {
    // Send message to OpenRouter
    const response = await sendMessage(messages);
    const assistantMessage = response.choices[0].message.content;
    
    // Try to parse the LLM's reply as JSON
    let extracted;
    try {
      extracted = JSON.parse(assistantMessage);
    } catch (jsonErr) {
      // Fallback to entity extractor if not valid JSON
      extracted = extractEntities(assistantMessage);
      extracted.reply = assistantMessage;
    }
    
    // Add assistant response to conversation history
    session.conversationHistory.push({
      role: 'assistant',
      content: extracted.reply || assistantMessage
    });
    
    // Update session state based on intent
    if (extracted.intent) {
      session.currentState = mapIntentToState(extracted.intent);
    }
    
    // Process the response to determine next state and actions
    const processedResponse = processAgentResponse(session, extracted.reply || assistantMessage, extracted);
    
    return processedResponse;
  } catch (error) {
    console.error('Error processing message with OpenRouter agent:', error);
    
    // Fallback to the built-in agent if OpenRouter fails
    try {
      const extracted = extractEntities(message);
      const whatsappResponse = generateResponse('initial', extracted, 
        "I'm having trouble connecting to my advanced AI. Let me help you with basic functionality.");
      
      return {
        ...whatsappResponse,
        state: 'initial',
        intent: extracted.intent,
        entities: extracted.entities
      };
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError);
      return {
        text: "I'm sorry, I encountered an error. Please try again later.",
        state: session.currentState || 'initial'
      };
    }
  }
}

/**
 * Extract product listing from a message
 * @param {string} message - The message containing product information
 * @returns {Promise<Object>} Extracted product listing
 */
async function extractProductListing(message) {
  try {
    const messages = [
      {
        role: 'system',
        content: getListingExtractionPrompt()
      },
      {
        role: 'user',
        content: message
      }
    ];
    
    const response = await sendMessage(messages);
    const assistantMessage = response.choices[0].message.content;
    
    // Try to parse the response as JSON
    try {
      // Look for JSON structure in the response
      const jsonMatch = assistantMessage.match(/```json\n([\s\S]*?)\n```/) || 
                       assistantMessage.match(/{[\s\S]*?}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/```json\n|```/g, '');
        return JSON.parse(jsonStr);
      }
      
      // If no JSON structure found, use entity extractor as fallback
      return extractEntities(message);
    } catch (parseError) {
      console.error('Error parsing listing extraction response:', parseError);
      // Fallback to our existing entity extractor
      return extractEntities(message);
    }
  } catch (error) {
    console.error('Error extracting product listing with OpenRouter:', error);
    // Fallback to our existing entity extractor
    return extractEntities(message);
  }
}

/**
 * Process search query from a message
 * @param {string} message - The message containing search query
 * @returns {Promise<Object>} Extracted search parameters
 */
async function processSearchQuery(message) {
  try {
    const messages = [
      {
        role: 'system',
        content: getSearchHandlingPrompt()
      },
      {
        role: 'user',
        content: message
      }
    ];
    
    const response = await sendMessage(messages);
    const assistantMessage = response.choices[0].message.content;
    
    // Try to parse the response as JSON
    try {
      // Look for JSON structure in the response
      const jsonMatch = assistantMessage.match(/```json\n([\s\S]*?)\n```/) || 
                       assistantMessage.match(/{[\s\S]*?}/);
      
      if (jsonMatch) {
        const jsonStr = jsonMatch[0].replace(/```json\n|```/g, '');
        return JSON.parse(jsonStr);
      }
      
      // If no JSON structure found, use entity extractor as fallback
      const entities = extractEntities(message);
      return {
        query: entities.query || null,
        category: entities.category || null,
        location: entities.location || null,
        minPrice: entities.minPrice || null,
        maxPrice: entities.maxPrice || null,
        exactPrice: entities.exactPrice || null,
        sortBy: null
      };
    } catch (parseError) {
      console.error('Error parsing search query response:', parseError);
      // Fallback to our existing entity extractor
      const entities = extractEntities(message);
      return {
        query: entities.query || null,
        category: entities.category || null,
        location: entities.location || null,
        minPrice: entities.minPrice || null,
        maxPrice: entities.maxPrice || null,
        exactPrice: entities.exactPrice || null,
        sortBy: null
      };
    }
  } catch (error) {
    console.error('Error processing search query with OpenRouter:', error);
    // Fallback to our existing entity extractor
    const entities = extractEntities(message);
    return {
      query: entities.query || null,
      category: entities.category || null,
      location: entities.location || null,
      minPrice: entities.minPrice || null,
      maxPrice: entities.maxPrice || null,
      exactPrice: entities.exactPrice || null,
      sortBy: null
    };
  }
}

/**
 * Map intent to conversation state
 * @param {string} intent - The detected intent
 * @returns {string} The corresponding conversation state
 */
function mapIntentToState(intent) {
  const stateMap = {
    'search': 'searching',
    'select_product': 'viewing_product',
    'checkout': 'checkout',
    'submit_rating': 'rating',
    'help': 'help',
    'contact_seller': 'contacting',
    'track_order': 'tracking'
  };
  
  return stateMap[intent] || 'initial';
}

/**
 * Process the agent's response to determine next state and actions
 * @param {Object} session - The user session
 * @param {string} response - The agent's response
 * @param {Object} extracted - Already extracted entities and intent (optional)
 * @returns {Object} Processed response with next state and actions
 */
function processAgentResponse(session, response, extracted = null) {
  // Extract entities and intent if not provided
  if (!extracted) {
    extracted = extractEntities(response);
  }
  
  // Update session state based on intent
  if (extracted.intent) {
    session.currentState = mapIntentToState(extracted.intent);
  }
  
  // Conversational fallback if intent is search and no products/entities
  if (
    extracted.intent === 'search' &&
    (!extracted.entities || Object.keys(extracted.entities).length === 0 || (typeof extracted.entities.productId !== 'undefined' && !extracted.entities.productId))
  ) {
    return {
      text: extracted.reply || "Sorry, I couldn't find any products matching your request right now. Please try a different search or check back later!",
      state: session.currentState,
      intent: extracted.intent,
      entities: extracted.entities || {}
    };
  }
  
  // Update session with extracted product ID if available
  if (extracted.entities && typeof extracted.entities.productId !== 'undefined' && extracted.entities.productId) {
    session.activeProductId = extracted.entities.productId;
  }
  
  // Generate appropriate WhatsApp response format
  const whatsappResponse = generateResponse(session.currentState, extracted, response);
  
  return {
    ...whatsappResponse,
    state: session.currentState,
    intent: extracted.intent,
    entities: extracted.entities
  };
}

module.exports = {
  processMessage,
  extractProductListing,
  processSearchQuery,
  getUserSession
};
