/**
 * Listing Parser
 * 
 * This module analyzes WhatsApp messages to determine if they are product listings
 * and extracts structured data from them.
 */

// Common keywords that indicate a message might be a product listing
const LISTING_KEYWORDS = [
  'for sale', 'à vendre', 'selling', 'price', 'prix', 'cost', 'coût',
  'brand new', 'neuf', 'used', 'occasion', 'condition', 'état',
  'contact', 'call', 'appeler', 'whatsapp me', 'dm me', 'pm me',
  'shipping', 'livraison', 'delivery', 'available', 'disponible'
];

// Common price patterns
const PRICE_PATTERNS = [
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)(?:\s*)(FCFA|XAF|CFA|F|€|EUR|USD|\$)/i,
  /(?:price|prix|cost|coût)(?:\s*):(?:\s*)(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)(?:\s*)(FCFA|XAF|CFA|F|€|EUR|USD|\$)?/i,
  /(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)(?:\s*)(FCFA|XAF|CFA|F|€|EUR|USD|\$)?(?:\s*)(?:only|seulement|negotiable|négociable|fixed|fixe)/i
];

// Common location patterns
const LOCATION_PATTERNS = [
  /(?:location|lieu|address|adresse)(?:\s*):(?:\s*)([A-Za-z\s]+)/i,
  /(?:available|disponible)(?:\s*)(?:in|à|at|en)(?:\s*)([A-Za-z\s]+)/i,
  /(?:based|situé)(?:\s*)(?:in|à|at|en)(?:\s*)([A-Za-z\s]+)/i
];

// Common category patterns
const CATEGORY_PATTERNS = [
  /(?:category|catégorie|type)(?:\s*):(?:\s*)([A-Za-z\s]+)/i
];

/**
 * Determines if a message is likely a product listing
 * @param {string} messageText - The text content of the message
 * @returns {boolean} True if the message appears to be a product listing
 */
function isProductListing(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    return false;
  }
  
  // Check message length - listings tend to be longer
  if (messageText.length < 30) {
    return false;
  }
  
  // Check for price patterns
  for (const pattern of PRICE_PATTERNS) {
    if (pattern.test(messageText)) {
      return true;
    }
  }
  
  // Check for listing keywords
  const lowerText = messageText.toLowerCase();
  const keywordCount = LISTING_KEYWORDS.filter(keyword => 
    lowerText.includes(keyword.toLowerCase())
  ).length;
  
  // If multiple keywords are found, it's likely a listing
  return keywordCount >= 2;
}

/**
 * Extracts structured listing data from a message
 * @param {string} messageText - The text content of the message
 * @returns {Object|null} Extracted listing data or null if extraction failed
 */
function extractListingDetails(messageText) {
  if (!messageText || typeof messageText !== 'string') {
    return null;
  }
  
  // Initialize listing data
  const listingData = {
    title: '',
    description: messageText,
    price: null,
    currency: 'FCFA',
    location: null,
    category: null
  };
  
  // Extract title (first line or first sentence)
  const firstLine = messageText.split('\n')[0].trim();
  if (firstLine.length > 5 && firstLine.length < 100) {
    listingData.title = firstLine;
  } else {
    const firstSentence = messageText.split(/[.!?]/, 1)[0].trim();
    if (firstSentence.length > 5 && firstSentence.length < 100) {
      listingData.title = firstSentence;
    }
  }
  
  // Extract price
  for (const pattern of PRICE_PATTERNS) {
    const match = messageText.match(pattern);
    if (match) {
      // Parse price, removing any thousand separators
      const priceStr = match[1].replace(/[.,]/g, '');
      listingData.price = parseFloat(priceStr);
      
      // Set currency if found
      if (match[2]) {
        listingData.currency = match[2].toUpperCase();
        // Normalize currency codes
        if (['F', 'CFA', 'XAF'].includes(listingData.currency)) {
          listingData.currency = 'FCFA';
        } else if (['€', 'EUR'].includes(listingData.currency)) {
          listingData.currency = 'EUR';
        } else if (['$', 'USD'].includes(listingData.currency)) {
          listingData.currency = 'USD';
        }
      }
      break;
    }
  }
  
  // Extract location
  for (const pattern of LOCATION_PATTERNS) {
    const match = messageText.match(pattern);
    if (match && match[1]) {
      listingData.location = match[1].trim();
      break;
    }
  }
  
  // Extract category
  for (const pattern of CATEGORY_PATTERNS) {
    const match = messageText.match(pattern);
    if (match && match[1]) {
      listingData.category = match[1].trim();
      break;
    }
  }
  
  // If we couldn't extract a title or price, this might not be a valid listing
  if (!listingData.title || !listingData.price) {
    return null;
  }
  
  return listingData;
}

module.exports = {
  isProductListing,
  extractListingDetails
};
