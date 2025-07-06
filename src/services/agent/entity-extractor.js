/**
 * Entity Extractor
 * 
 * This module extracts entities and intents from user messages
 * to help the agent understand what the user is asking for.
 */

// Common patterns for entity extraction
const PRICE_PATTERN = /(\d+(?:[.,]\d+)?)\s*(FCFA|XAF|CFA|F|€|EUR|USD|\$)/i;
const LOCATION_PATTERN = /(?:in|at|near|around)\s+([A-Za-zÀ-ÿ\s]+?)(?:$|[,.?!]|\s+and\s+|\s+or\s+)/i;
const CATEGORY_PATTERN = /(?:looking for|need|want|searching for|find)\s+([A-Za-zÀ-ÿ\s]+?)(?:$|[,.?!]|\s+in\s+|\s+at\s+|\s+under\s+|\s+over\s+)/i;

// Intent patterns
const INTENT_PATTERNS = {
  search: [
    /find|search|looking for|show|get|need|want|browse|discover|any/i,
    /products?|items?|listings?|goods|services|sellers?/i
  ],
  help: [
    /help|support|guide|how to|how do I|assist|assistance/i
  ],
  select_product: [
    /select|choose|pick|view|show|details|more info|about|tell me about|product #?(\d+)/i
  ],
  buy: [
    /buy|purchase|order|get|acquire|checkout|payment|pay/i
  ],
  contact_seller: [
    /contact|message|chat|talk|speak|call|connect|reach/i,
    /seller|vendor|owner|merchant|provider/i
  ],
  cancel: [
    /cancel|stop|quit|exit|back|return|nevermind|forget it/i
  ],
  refine_search: [
    /refine|filter|sort|narrow|cheaper|more expensive|better|newer|different|other/i
  ],
  submit_rating: [
    /rate|rating|review|feedback|stars?|score/i
  ],
  confirm_payment: [
    /confirm|verified|completed|done|finished|paid|sent/i,
    /payment|transaction|money|transfer/i
  ]
};

/**
 * Extract entities and intent from a message
 * @param {string} message - The message text
 * @param {string} language - The language code (default: 'en')
 * @returns {Promise<Object>} Extracted entities and intent
 */
async function extractEntities(message, language = 'en') {
  // Initialize result
  const result = {
    entities: {
      rawQuery: message
    },
    intent: null
  };
  
  // Extract price range
  const priceMatches = message.match(new RegExp(PRICE_PATTERN.source, 'gi'));
  if (priceMatches && priceMatches.length > 0) {
    // If we have two prices, assume it's a range
    if (priceMatches.length >= 2) {
      const prices = priceMatches.map(match => {
        const [_, amount, currency] = match.match(PRICE_PATTERN);
        return {
          amount: parseFloat(amount.replace(',', '.')),
          currency
        };
      }).sort((a, b) => a.amount - b.amount);
      
      result.entities.minPrice = prices[0].amount;
      result.entities.maxPrice = prices[prices.length - 1].amount;
      result.entities.currency = prices[0].currency;
    } else {
      // Single price - check context for "under" or "over"
      const [_, amount, currency] = priceMatches[0].match(PRICE_PATTERN);
      const parsedAmount = parseFloat(amount.replace(',', '.'));
      
      if (/under|less than|cheaper than|below|not more than/i.test(message)) {
        result.entities.maxPrice = parsedAmount;
      } else if (/over|more than|above|at least|minimum/i.test(message)) {
        result.entities.minPrice = parsedAmount;
      } else {
        // Exact price match
        result.entities.exactPrice = parsedAmount;
      }
      
      result.entities.currency = currency;
    }
  }
  
  // Extract location
  const locationMatch = message.match(LOCATION_PATTERN);
  if (locationMatch && locationMatch[1]) {
    result.entities.location = locationMatch[1].trim();
  }
  
  // Extract category
  const categoryMatch = message.match(CATEGORY_PATTERN);
  if (categoryMatch && categoryMatch[1]) {
    result.entities.category = categoryMatch[1].trim();
  }
  
  // Extract query - if we have category, use that as query
  if (result.entities.category) {
    result.entities.query = result.entities.category;
  } else {
    // Try to extract a general query by removing known entities and common words
    let query = message;
    
    // Remove price patterns
    query = query.replace(new RegExp(PRICE_PATTERN.source, 'gi'), '');
    
    // Remove location patterns
    if (result.entities.location) {
      query = query.replace(new RegExp(`(?:in|at|near|around)\\s+${result.entities.location}`, 'i'), '');
    }
    
    // Remove common filler words
    query = query.replace(/(?:can you|please|I want to|I need to|I'm looking for|show me|find me|get me|I want|I need)\s+/gi, '');
    
    // Clean up and set as query if not empty
    query = query.trim();
    if (query && query.length > 2) {
      result.entities.query = query;
    }
  }
  
  // Extract product ID if present
  const productIdMatch = message.match(/product #?(\d+)|item #?(\d+)|listing #?(\d+)|#(\d+)/i);
  if (productIdMatch) {
    const id = productIdMatch[1] || productIdMatch[2] || productIdMatch[3] || productIdMatch[4];
    result.entities.productId = id;
  }
  
  // Extract rating if present
  const ratingMatch = message.match(/(\d+)\s*stars?|rate\s*(\d+)|rating\s*:\s*(\d+)|(\d+)\s*out of\s*5/i);
  if (ratingMatch) {
    const rating = parseInt(ratingMatch[1] || ratingMatch[2] || ratingMatch[3] || ratingMatch[4]);
    if (rating >= 1 && rating <= 5) {
      result.entities.rating = rating;
    }
  } else if (/⭐/.test(message)) {
    // Count star emojis
    const starCount = (message.match(/⭐/g) || []).length;
    if (starCount >= 1 && starCount <= 5) {
      result.entities.rating = starCount;
    }
  }
  
  // Determine intent
  result.intent = determineIntent(message, result.entities);
  
  return result;
}

/**
 * Determine the intent of a message based on patterns and entities
 * @param {string} message - The message text
 * @param {Object} entities - Extracted entities
 * @returns {string} The determined intent
 */
function determineIntent(message, entities) {
  // Check for each intent pattern
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    // Special case for select_product
    if (intent === 'select_product' && entities.productId) {
      return 'select_product';
    }
    
    // Special case for submit_rating
    if (intent === 'submit_rating' && entities.rating) {
      return 'submit_rating';
    }
    
    // For other intents, check if all patterns match
    const matchesAllPatterns = patterns.every(pattern => pattern.test(message));
    if (matchesAllPatterns) {
      return intent;
    }
  }
  
  // Default intent based on entities
  if (entities.query || entities.category || entities.location || 
      entities.minPrice || entities.maxPrice || entities.exactPrice) {
    return 'search';
  }
  
  // Fallback to help
  return 'help';
}

module.exports = {
  extractEntities
};
