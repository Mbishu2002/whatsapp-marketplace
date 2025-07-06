/**
 * Response Generator
 * 
 * This module generates appropriate responses based on the context and type of response needed.
 * It interfaces with the database to fetch necessary information for responses.
 */

const supabase = require('../../database/supabase');
const { listings } = require('../../database/schema');

/**
 * Generate a response based on the response type and context
 * @param {string} responseType - The type of response to generate
 * @param {Object} context - The context for the response
 * @returns {Promise<Object>} Response object with text and actions
 */
async function generateResponse(responseType, context) {
  switch (responseType) {
    case 'search_results':
      return await generateSearchResultsResponse(context);
    case 'product_view':
      return await generateProductViewResponse(context);
    case 'checkout':
      return await generateCheckoutResponse(context);
    case 'contact_seller':
      return await generateContactSellerResponse(context);
    case 'payment_confirmation':
      return await generatePaymentConfirmationResponse(context);
    case 'rating_submission':
      return await generateRatingSubmissionResponse(context);
    default:
      return {
        text: "I'm not sure how to respond to that. How can I help you today?",
        actions: [
          { type: 'button', text: '🔍 Search Products' },
          { type: 'button', text: '❓ Help' }
        ]
      };
  }
}

/**
 * Generate a search results response
 * @param {Object} context - The search context
 * @returns {Promise<Object>} Response object
 */
async function generateSearchResultsResponse(context) {
  try {
    // Extract search parameters
    const { query, category, location, minPrice, maxPrice, currency = 'FCFA' } = context;
    
    // Build search filters
    const filters = {};
    if (category) filters.category = category;
    if (location) filters.location = location;
    if (minPrice) filters.minPrice = minPrice;
    if (maxPrice) filters.maxPrice = maxPrice;
    
    // Search for listings
    const searchResults = await listings.search(supabase, query, filters, 5);
    
    if (!searchResults || searchResults.length === 0) {
      // No results found
      return {
        text: `Sorry, I couldn't find any products matching your search${query ? ` for "${query}"` : ''}${category ? ` in category "${category}"` : ''}${location ? ` in ${location}` : ''}${minPrice ? ` above ${minPrice} ${currency}` : ''}${maxPrice ? ` below ${maxPrice} ${currency}` : ''}.\n\nTry a different search or browse our categories.`,
        actions: [
          { type: 'button', text: '🔍 New Search' },
          { type: 'button', text: '📂 Browse Categories' }
        ]
      };
    }
    
    // Format search results
    let responseText = `Here are the products${query ? ` matching "${query}"` : ''}${category ? ` in category "${category}"` : ''}${location ? ` in ${location}` : ''}${minPrice ? ` above ${minPrice} ${currency}` : ''}${maxPrice ? ` below ${maxPrice} ${currency}` : ''}:\n\n`;
    
    searchResults.forEach((result, index) => {
      responseText += `*${index + 1}. ${result.title}*\n`;
      responseText += `💰 ${result.price} ${result.currency}\n`;
      if (result.location) responseText += `📍 ${result.location}\n`;
      responseText += `Reply with "${index + 1}" or "Product #${index + 1}" to view details.\n\n`;
    });
    
    responseText += `To refine your search, you can specify:\n• Location (e.g., "in Douala")\n• Price range (e.g., "under 50,000 FCFA")\n• Category (e.g., "electronics")`;
    
    // Create actions for the first 3 products
    const actions = searchResults.slice(0, 3).map((result, index) => ({
      type: 'button',
      text: `${index + 1}. ${result.title.substring(0, 15)}${result.title.length > 15 ? '...' : ''}`
    }));
    
    // Add refine search action
    actions.push({ type: 'button', text: '🔍 Refine Search' });
    
    return {
      text: responseText,
      actions
    };
  } catch (error) {
    console.error('Error generating search results response:', error);
    return {
      text: "I'm having trouble searching for products right now. Please try again later.",
      actions: [
        { type: 'button', text: '🔍 Try Again' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Generate a product view response
 * @param {Object} context - The product context
 * @returns {Promise<Object>} Response object
 */
async function generateProductViewResponse(context) {
  try {
    // Get product details
    const { productId } = context;
    const product = await listings.findById(supabase, productId);
    
    if (!product) {
      return {
        text: "Sorry, I couldn't find that product. It may have been sold or removed.",
        actions: [
          { type: 'button', text: '🔍 Back to Search' },
          { type: 'button', text: '❓ Help' }
        ]
      };
    }
    
    // Increment view count
    await listings.incrementViews(supabase, productId);
    
    // Format product details
    let responseText = `*${product.title}*\n\n`;
    responseText += `💰 *Price:* ${product.price} ${product.currency}\n`;
    if (product.location) responseText += `📍 *Location:* ${product.location}\n`;
    if (product.category) responseText += `📂 *Category:* ${product.category}\n`;
    responseText += `👤 *Seller:* ${product.seller.name}\n`;
    if (product.seller.rating) responseText += `⭐ *Rating:* ${product.seller.rating}/5\n`;
    responseText += `\n${product.description}\n\n`;
    
    // Add call-to-action
    responseText += `What would you like to do with this product?`;
    
    return {
      text: responseText,
      actions: [
        { type: 'button', text: '💳 Buy Now' },
        { type: 'button', text: '💬 Contact Seller' },
        { type: 'button', text: '🔙 Back to Search' }
      ]
    };
  } catch (error) {
    console.error('Error generating product view response:', error);
    return {
      text: "I'm having trouble retrieving product details right now. Please try again later.",
      actions: [
        { type: 'button', text: '🔍 Back to Search' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Generate a checkout response
 * @param {Object} context - The checkout context
 * @returns {Promise<Object>} Response object
 */
async function generateCheckoutResponse(context) {
  try {
    // Get product details
    const { productId } = context;
    const product = await listings.findById(supabase, productId);
    
    if (!product) {
      return {
        text: "Sorry, I couldn't find that product. It may have been sold or removed.",
        actions: [
          { type: 'button', text: '🔍 Back to Search' },
          { type: 'button', text: '❓ Help' }
        ]
      };
    }
    
    // Calculate fees
    const escrowFee = Math.round(product.price * 0.05); // 5% escrow fee
    const total = product.price + escrowFee;
    
    // Format checkout details
    let responseText = `*Checkout Summary*\n\n`;
    responseText += `*${product.title}*\n`;
    responseText += `💰 *Price:* ${product.price} ${product.currency}\n`;
    responseText += `🔒 *Escrow Fee:* ${escrowFee} ${product.currency}\n`;
    responseText += `💵 *Total:* ${total} ${product.currency}\n\n`;
    responseText += `To complete your purchase, please send ${total} ${product.currency} to our payment number using Fapshi.\n\n`;
    responseText += `*Payment Instructions:*\n`;
    responseText += `1. Open your Fapshi app\n`;
    responseText += `2. Send payment to: +237XXXXXXXX\n`;
    responseText += `3. Use reference: MP-${productId}\n`;
    responseText += `4. Reply with "Payment sent" when complete\n\n`;
    responseText += `Your payment will be held in escrow until you confirm receipt of the product.`;
    
    return {
      text: responseText,
      actions: [
        { type: 'button', text: '✅ Payment Sent' },
        { type: 'button', text: '❌ Cancel' }
      ]
    };
  } catch (error) {
    console.error('Error generating checkout response:', error);
    return {
      text: "I'm having trouble processing your checkout right now. Please try again later.",
      actions: [
        { type: 'button', text: '🔙 Back to Product' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Generate a contact seller response
 * @param {Object} context - The contact context
 * @returns {Promise<Object>} Response object
 */
async function generateContactSellerResponse(context) {
  try {
    // Get product details
    const { productId } = context;
    const product = await listings.findById(supabase, productId);
    
    if (!product) {
      return {
        text: "Sorry, I couldn't find that product. It may have been sold or removed.",
        actions: [
          { type: 'button', text: '🔍 Back to Search' },
          { type: 'button', text: '❓ Help' }
        ]
      };
    }
    
    // Format contact details
    let responseText = `*Contact Seller*\n\n`;
    responseText += `You can contact the seller of *${product.title}* directly:\n\n`;
    responseText += `👤 *Name:* ${product.seller.name}\n`;
    responseText += `📱 *WhatsApp:* ${product.seller.phone_number}\n\n`;
    responseText += `Simply click the button below to start a chat with the seller. Remember to mention the product you're interested in!`;
    
    return {
      text: responseText,
      actions: [
        { type: 'button', text: '💬 Chat with Seller' },
        { type: 'button', text: '🔙 Back to Product' }
      ]
    };
  } catch (error) {
    console.error('Error generating contact seller response:', error);
    return {
      text: "I'm having trouble retrieving the seller's contact information right now. Please try again later.",
      actions: [
        { type: 'button', text: '🔙 Back to Product' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
}

/**
 * Generate a payment confirmation response
 * @param {Object} context - The payment context
 * @returns {Promise<Object>} Response object
 */
async function generatePaymentConfirmationResponse(context) {
  try {
    // Get product details
    const { productId } = context;
    const product = await listings.findById(supabase, productId);
    
    if (!product) {
      return {
        text: "Sorry, I couldn't find that product. It may have been sold or removed.",
        actions: [
          { type: 'button', text: '🔍 Back to Search' },
          { type: 'button', text: '❓ Help' }
        ]
      };
    }
    
    // Format confirmation details
    let responseText = `*Payment Confirmation*\n\n`;
    responseText += `Thank you for your payment for *${product.title}*!\n\n`;
    responseText += `Your payment of ${product.price + Math.round(product.price * 0.05)} ${product.currency} is being processed and will be held in escrow.\n\n`;
    responseText += `*Next Steps:*\n`;
    responseText += `1. We've notified the seller about your purchase\n`;
    responseText += `2. The seller will contact you to arrange delivery\n`;
    responseText += `3. Once you receive the product, reply with "Received" to release payment\n\n`;
    responseText += `Your order reference is: *MP-${productId}*\n`;
    responseText += `Please keep this reference for tracking your order.`;
    
    return {
      text: responseText,
      actions: [
        { type: 'button', text: '📦 Track Order' },
        { type: 'button', text: '🔍 Shop More' }
      ]
    };
  } catch (error) {
    console.error('Error generating payment confirmation response:', error);
    return {
      text: "I'm having trouble confirming your payment right now. Please try again later or contact support.",
      actions: [
        { type: 'button', text: '👨‍💼 Contact Support' },
        { type: 'button', text: '🔍 Back to Search' }
      ]
    };
  }
}

/**
 * Generate a rating submission response
 * @param {Object} context - The rating context
 * @returns {Promise<Object>} Response object
 */
async function generateRatingSubmissionResponse(context) {
  try {
    // Get product details
    const { productId, rating } = context;
    const product = await listings.findById(supabase, productId);
    
    if (!product) {
      return {
        text: "Sorry, I couldn't find that product. It may have been sold or removed.",
        actions: [
          { type: 'button', text: '🔍 Back to Search' },
          { type: 'button', text: '❓ Help' }
        ]
      };
    }
    
    // Format rating confirmation
    let responseText = `*Rating Submitted*\n\n`;
    responseText += `Thank you for rating your experience with *${product.seller.name}* for the purchase of *${product.title}*!\n\n`;
    responseText += `You gave the seller ${rating} star${rating !== 1 ? 's' : ''}.\n\n`;
    responseText += `Your feedback helps other buyers make informed decisions and helps sellers improve their service.`;
    
    return {
      text: responseText,
      actions: [
        { type: 'button', text: '🔍 Shop More' },
        { type: 'button', text: '🛍️ My Orders' }
      ]
    };
  } catch (error) {
    console.error('Error generating rating submission response:', error);
    return {
      text: "I'm having trouble submitting your rating right now. Please try again later.",
      actions: [
        { type: 'button', text: '🔄 Try Again' },
        { type: 'button', text: '🔍 Back to Search' }
      ]
    };
  }
}

module.exports = {
  generateResponse
};
