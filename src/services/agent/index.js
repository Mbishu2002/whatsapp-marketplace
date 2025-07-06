/**
 * Agent Service for WhatsApp Marketplace
 * 
 * This module provides an intelligent agent service for handling
 * natural language extraction and responses in the WhatsApp marketplace.
 * 
 * It can use either the built-in agent system or the OpenRouter-powered agent
 * depending on configuration.
 */

const axios = require('axios');
const { extractEntities } = require('./entity-extractor');
const { generateResponse } = require('./response-generator');
const { searchWeb } = require('./web-search');

// Import OpenRouter agent
let openRouterAgent;
try {
  openRouterAgent = require('../openrouter');
} catch (error) {
  console.log('OpenRouter agent not available, using built-in agent only');
}

// Configuration
const USE_OPENROUTER = process.env.USE_OPENROUTER === 'true' && openRouterAgent;

// Agent states for conversation management
const AGENT_STATES = {
  INITIAL: 'initial',
  SEARCHING: 'searching',
  VIEWING_PRODUCT: 'viewing_product',
  CHECKOUT: 'checkout',
  RATING: 'rating',
  HELP: 'help'
};

// User session store (in-memory for now, should be moved to database for production)
const userSessions = new Map();

/**
 * Get or create a user session
 * @param {string} userId - The user's identifier (phone number)
 * @returns {Object} The user session object
 */
function getUserSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      state: AGENT_STATES.INITIAL,
      context: {},
      history: [],
      lastInteraction: Date.now()
    });
  }
  
  const session = userSessions.get(userId);
  session.lastInteraction = Date.now();
  return session;
}

/**
 * Process a user message with the agent
 * @param {string} userId - The user's WhatsApp ID
 * @param {string} message - The user's message
 * @returns {Promise<Object>} The agent's response
 */
async function processMessage(userId, message) {
  // Check if this is a command (starts with !)
  if (message.startsWith('!')) {
    try {
      // Import command handler
      const { processCommand } = require('./command-handler');
      
      // Create a mock client object that implements the sendMessage method
      const mockClient = {
        sendMessage: async (to, text) => {
          return {
            text,
            actions: []
          };
        }
      };
      
      // Create a mock message object
      const mockMessage = {
        from: userId,
        body: message
      };
      
      // Process the command
      const handled = await processCommand(mockClient, mockMessage, message);
      
      // If command was handled, return a dummy response (the actual response was sent by the command handler)
      if (handled) {
        return {
          text: '',
          actions: []
        };
      }
    } catch (error) {
      console.error('Error processing command:', error);
    }
  }
  
  // If OpenRouter is enabled, use the OpenRouter agent for message processing
  if (USE_OPENROUTER) {
    try {
      return await openRouterAgent.processMessage(userId, message);
    } catch (err) {
      console.error('Error processing message with OpenRouter agent:', err);
      // Fallback to built-in logic below
    }
  }
  
  // Get or create user session
  const session = getUserSession(userId);
  session.lastMessage = message;
  
  // Extract entities and intent from the message
  const extracted = extractEntities(message);
  const { intent, entities } = extracted;
  
  console.log(`Processing message from ${userId}: "${message}"`);
  
  // Update session context with extracted information
  session.context = {
    ...session.context,
    ...entities
  };
  
  let response;
  
  // Handle based on current state and intent
  switch (session.state) {
    case AGENT_STATES.INITIAL:
      // Handle initial state - typically search or help requests
      if (intent === 'search') {
        session.state = AGENT_STATES.SEARCHING;
        response = await handleSearchIntent(session, entities);
      } else if (intent === 'help') {
        response = await handleHelpIntent(session);
      } else {
        // Default welcome message with options
        response = {
          text: `👋 Welcome to WhatsApp Marketplace!\n\nYou can:\n• Search for products\n• View your orders\n• Rate sellers\n• Get help\n• Subscribe to premium features\n• Boost your listings\n\nWhat would you like to do?`,
          actions: [
            { type: 'button', text: '🔍 Search Products' },
            { type: 'button', text: '🛍️ My Orders' },
            { type: 'button', text: '⭐ Premium' }
          ]
        };
      }
      break;
      
    case AGENT_STATES.SEARCHING:
      // Handle search refinement or product selection
      if (intent === 'select_product' && entities.productId) {
        session.state = AGENT_STATES.VIEWING_PRODUCT;
        session.context.currentProductId = entities.productId;
        response = await handleProductViewIntent(session);
      } else if (intent === 'refine_search') {
        response = await handleSearchIntent(session, entities);
      } else if (intent === 'cancel') {
        session.state = AGENT_STATES.INITIAL;
        session.context = {};
        response = {
          text: 'Search cancelled. What would you like to do now?',
          actions: [
            { type: 'button', text: '🔍 Search Again' },
            { type: 'button', text: '🛍️ My Orders' },
            { type: 'button', text: '❓ Help' }
          ]
        };
      } else {
        // Treat as search refinement
        response = await handleSearchIntent(session, entities);
      }
      break;
      
    case AGENT_STATES.VIEWING_PRODUCT:
      // Handle product interaction
      if (intent === 'buy' || intent === 'checkout') {
        session.state = AGENT_STATES.CHECKOUT;
        response = await handleCheckoutIntent(session);
      } else if (intent === 'contact_seller') {
        response = await handleContactSellerIntent(session);
      } else if (intent === 'back_to_search') {
        session.state = AGENT_STATES.SEARCHING;
        response = await handleSearchIntent(session, session.context);
      } else {
        // Default product view actions
        response = await handleProductViewIntent(session);
      }
      break;
      
    case AGENT_STATES.CHECKOUT:
      // Handle checkout flow
      if (intent === 'confirm_payment') {
        response = await handlePaymentConfirmationIntent(session);
      } else if (intent === 'cancel') {
        session.state = AGENT_STATES.VIEWING_PRODUCT;
        response = await handleProductViewIntent(session);
      } else {
        response = await handleCheckoutIntent(session);
      }
      break;
      
    case AGENT_STATES.RATING:
      // Handle rating submission
      if (intent === 'submit_rating' && entities.rating) {
        response = await handleRatingSubmissionIntent(session, entities.rating);
        session.state = AGENT_STATES.INITIAL;
      } else {
        response = {
          text: 'Please rate your experience with the seller from 1 to 5 stars.',
          actions: [
            { type: 'button', text: '⭐' },
            { type: 'button', text: '⭐⭐' },
            { type: 'button', text: '⭐⭐⭐' },
            { type: 'button', text: '⭐⭐⭐⭐' },
            { type: 'button', text: '⭐⭐⭐⭐⭐' }
          ]
        };
      }
      break;
      
    default:
      // Reset to initial state if unknown
      session.state = AGENT_STATES.INITIAL;
      response = {
        text: "I'm not sure what you're looking for. How can I help you today?",
        actions: [
          { type: 'button', text: '🔍 Search Products' },
          { type: 'button', text: '🛍️ My Orders' },
          { type: 'button', text: '❓ Help' }
        ]
      };
  }
  
  // Add response to history
  session.history.push({
    role: 'assistant',
    content: response.text,
    timestamp: Date.now()
  });
  
  return response;
}

/**
 * Process search query from a message
 * @param {string} message - The message containing search query
 * @returns {Promise<Object>} Extracted search parameters
 */
async function processSearchQuery(message) {
  // If OpenRouter is enabled, use the OpenRouter agent for search query processing
  if (USE_OPENROUTER) {
    return openRouterAgent.processSearchQuery(message);
  }
  
  // Otherwise, use the built-in entity extractor
  const extracted = extractEntities(message);
  
  // Format as search parameters
  const searchParams = {
    query: extracted.entities.query || message,
    category: extracted.entities.category || null,
    location: extracted.entities.location || null,
    minPrice: extracted.entities.minPrice || null,
    maxPrice: extracted.entities.maxPrice || null,
    exactPrice: extracted.entities.exactPrice || null
  };
  
  return searchParams;
}

/**
 * Handle search intent
 * @param {Object} session - User session
 * @param {Object} entities - Extracted entities
 * @returns {Promise<Object>} Response object
 */
async function handleSearchIntent(session, entities) {
  try {
    // Process search query
    const searchParams = await processSearchQuery(session.lastMessage);
    
    // Extract search parameters
    const query = searchParams.query || entities.query;
    const category = searchParams.category || entities.category;
    const location = searchParams.location || entities.location;
    const minPrice = searchParams.minPrice || entities.minPrice;
    const maxPrice = searchParams.maxPrice || entities.maxPrice;
    
    // Update session context
    session.context = {
      ...session.context,
      query,
      category,
      location,
      minPrice,
      maxPrice
    };
    
    // If we don't have enough information, try web search for enrichment
    if (!query && !category) {
      const webResults = await searchWeb(entities.rawQuery || session.history[session.history.length - 2].content);
      if (webResults && webResults.length > 0) {
        // Extract potentially useful information from web results
        // This is simplified - in a real implementation you'd use NLP to extract entities
        const enrichedEntities = extractEntitiesFromWebResults(webResults);
        session.context = {
          ...session.context,
          ...enrichedEntities
        };
      }
    }
    
    // Generate search response using the response generator
    return await generateResponse('search_results', session.context);
  } catch (error) {
    console.error('Error handling search intent:', error);
    return {
      text: "I'm having trouble searching for products right now. Please try again later or refine your search.",
      actions: [
        { type: 'button', text: '🔍 Try Again' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Extract entities from web search results
 * @param {Array} webResults - Results from web search
 * @returns {Object} Extracted entities
 */
function extractEntitiesFromWebResults(webResults) {
  // This is a simplified implementation
  // In a real system, you'd use NLP to extract entities from the web results
  const entities = {};
  
  // Example: Look for categories in the web results
  const categoryKeywords = ['electronics', 'clothing', 'furniture', 'vehicles', 'services'];
  for (const result of webResults) {
    for (const keyword of categoryKeywords) {
      if (result.content.toLowerCase().includes(keyword)) {
        entities.category = keyword;
        break;
      }
    }
    if (entities.category) break;
  }
  
  return entities;
}

/**
 * Handle help intent
 * @param {Object} session - User session
 * @returns {Promise<Object>} Response object
 */
async function handleHelpIntent(session) {
  return {
    text: `📚 **WhatsApp Marketplace Help**\n\nHere's how to use our service:\n\n• **Search**: Just type what you're looking for, e.g., "TVs under 100k in Douala"\n\n• **View Orders**: Type "my orders" to see your purchases\n\n• **Rate Sellers**: After a purchase, you can rate the seller\n\n• **Contact Support**: Type "support" to get help from our team\n\nWhat would you like to do?`,
    actions: [
      { type: 'button', text: '🔍 Search Example' },
      { type: 'button', text: '🛍️ My Orders' },
      { type: 'button', text: '👨‍💼 Contact Support' }
    ]
  };
}

/**
 * Handle product view intent
 * @param {Object} session - User session
 * @returns {Promise<Object>} Response object
 */
async function handleProductViewIntent(session) {
  try {
    // Generate product view response using the response generator
    return await generateResponse('product_view', {
      productId: session.context.currentProductId
    });
  } catch (error) {
    console.error('Error handling product view intent:', error);
    return {
      text: "I'm having trouble retrieving this product. Please try searching again.",
      actions: [
        { type: 'button', text: '🔍 Back to Search' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Handle checkout intent
 * @param {Object} session - User session
 * @returns {Promise<Object>} Response object
 */
async function handleCheckoutIntent(session) {
  try {
    // Generate checkout response using the response generator
    return await generateResponse('checkout', {
      productId: session.context.currentProductId
    });
  } catch (error) {
    console.error('Error handling checkout intent:', error);
    return {
      text: "I'm having trouble processing your checkout. Please try again later.",
      actions: [
        { type: 'button', text: '🔙 Back to Product' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Handle contact seller intent
 * @param {Object} session - User session
 * @returns {Promise<Object>} Response object
 */
async function handleContactSellerIntent(session) {
  try {
    // Generate contact seller response using the response generator
    return await generateResponse('contact_seller', {
      productId: session.context.currentProductId
    });
  } catch (error) {
    console.error('Error handling contact seller intent:', error);
    return {
      text: "I'm having trouble connecting you with the seller. Please try again later.",
      actions: [
        { type: 'button', text: '🔙 Back to Product' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Handle payment confirmation intent
 * @param {Object} session - User session
 * @returns {Promise<Object>} Response object
 */
async function handlePaymentConfirmationIntent(session) {
  try {
    // Generate payment confirmation response using the response generator
    return await generateResponse('payment_confirmation', {
      productId: session.context.currentProductId
    });
  } catch (error) {
    console.error('Error handling payment confirmation intent:', error);
    return {
      text: "I'm having trouble confirming your payment. Please try again later or contact support.",
      actions: [
        { type: 'button', text: '🔄 Try Again' },
        { type: 'button', text: '👨‍💼 Contact Support' }
      ]
    };
  }
}

/**
 * Handle rating submission intent
 * @param {Object} session - User session
 * @param {number} rating - The rating value (1-5)
 * @returns {Promise<Object>} Response object
 */
async function handleRatingSubmissionIntent(session, rating) {
  try {
    // Generate rating submission response using the response generator
    return await generateResponse('rating_submission', {
      productId: session.context.currentProductId,
      rating
    });
  } catch (error) {
    console.error('Error handling rating submission intent:', error);
    return {
      text: "I'm having trouble submitting your rating. Please try again later.",
      actions: [
        { type: 'button', text: '🔄 Try Again' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

module.exports = {
  processMessage,
  getUserSession,
  AGENT_STATES
};
