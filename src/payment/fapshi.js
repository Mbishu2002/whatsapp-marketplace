/**
 * Fapshi Payment Integration
 * 
 * This module handles payment processing using the Fapshi API.
 * It provides functions for initiating payments, checking payment status,
 * and managing escrow transactions.
 */

const axios = require('axios');
require('dotenv').config();

// Fapshi API configuration
const FAPSHI_API_KEY = process.env.FAPSHI_API_KEY;
const FAPSHI_SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
const FAPSHI_BASE_URL = 'https://api.fapshi.com';

if (!FAPSHI_API_KEY || !FAPSHI_SECRET_KEY) {
  console.error('Missing Fapshi API credentials. Please check your .env file.');
}

/**
 * Generate a payment link for a transaction
 * @param {Object} paymentData - Payment details
 * @param {number} paymentData.amount - Amount to be paid (in FCFA)
 * @param {string} paymentData.email - Optional email of the buyer
 * @param {string} paymentData.redirectUrl - URL to redirect after payment
 * @param {string} paymentData.userId - ID of the buyer in our system
 * @param {string} paymentData.externalId - ID of the transaction in our system
 * @param {string} paymentData.message - Description of the payment
 * @returns {Promise<Object>} Payment link and transaction ID
 */
async function generatePaymentLink(paymentData) {
  try {
    const response = await axios.post(
      `${FAPSHI_BASE_URL}/initiate-pay`,
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FAPSHI_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error generating payment link:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Check the status of a payment transaction
 * @param {string} transId - Transaction ID from Fapshi
 * @returns {Promise<Object>} Transaction status and details
 */
async function checkPaymentStatus(transId) {
  try {
    const response = await axios.get(
      `${FAPSHI_BASE_URL}/payment-status/${transId}`,
      {
        headers: {
          'x-api-key': FAPSHI_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error checking payment status:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Expire a payment transaction to prevent further payments
 * @param {string} transId - Transaction ID from Fapshi
 * @returns {Promise<Object>} Expired transaction details
 */
async function expirePayment(transId) {
  try {
    const response = await axios.post(
      `${FAPSHI_BASE_URL}/expire-pay`,
      { transId },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FAPSHI_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error expiring payment:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Get all transactions for a specific user
 * @param {string} userId - User ID in our system
 * @returns {Promise<Array>} List of transactions
 */
async function getUserTransactions(userId) {
  try {
    const response = await axios.get(
      `${FAPSHI_BASE_URL}/transaction/${userId}`,
      {
        headers: {
          'x-api-key': FAPSHI_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error getting user transactions:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Initiate a direct payment request to a user's mobile device
 * @param {Object} paymentData - Payment details
 * @param {number} paymentData.amount - Amount to be paid (in FCFA)
 * @param {string} paymentData.phone - Phone number to send payment request to
 * @param {string} paymentData.medium - Payment medium ('mobile money' or 'orange money')
 * @param {string} paymentData.name - Name of the user
 * @param {string} paymentData.email - Email of the user
 * @param {string} paymentData.userId - ID of the user in our system
 * @param {string} paymentData.externalId - ID of the transaction in our system
 * @param {string} paymentData.message - Description of the payment
 * @returns {Promise<Object>} Transaction ID and status
 */
async function initiateDirectPayment(paymentData) {
  try {
    const response = await axios.post(
      `${FAPSHI_BASE_URL}/direct-pay`,
      paymentData,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': FAPSHI_API_KEY
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error initiating direct payment:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Create an escrow payment for a marketplace transaction
 * @param {Object} escrowData - Escrow payment details
 * @param {string} escrowData.buyerId - ID of the buyer in our system
 * @param {string} escrowData.sellerId - ID of the seller in our system
 * @param {string} escrowData.listingId - ID of the listing being purchased
 * @param {number} escrowData.amount - Amount to be paid (in FCFA)
 * @param {string} escrowData.buyerPhone - Phone number of the buyer
 * @param {string} escrowData.buyerEmail - Email of the buyer (optional)
 * @returns {Promise<Object>} Escrow transaction details
 */
async function createEscrowPayment(escrowData) {
  try {
    // Calculate escrow fee (5% of transaction amount)
    const escrowFee = Math.round(escrowData.amount * 0.05);
    const totalAmount = escrowData.amount + escrowFee;
    
    // Generate a unique external ID for this transaction
    const externalId = `escrow-${escrowData.listingId}-${Date.now()}`;
    
    // Create payment data for Fapshi
    const paymentData = {
      amount: totalAmount,
      userId: escrowData.buyerId,
      externalId,
      message: `Escrow payment for listing #${escrowData.listingId}`,
    };
    
    // Add optional fields if provided
    if (escrowData.buyerEmail) {
      paymentData.email = escrowData.buyerEmail;
    }
    
    // If we have the buyer's phone number, use direct payment
    if (escrowData.buyerPhone) {
      paymentData.phone = escrowData.buyerPhone;
      
      // Initiate direct payment
      const directPaymentResult = await initiateDirectPayment(paymentData);
      
      // Store transaction in our database
      const transaction = await storeEscrowTransaction({
        listing_id: escrowData.listingId,
        buyer_id: escrowData.buyerId,
        seller_id: escrowData.sellerId,
        amount: escrowData.amount,
        escrow_fee: escrowFee,
        payment_provider: 'fapshi',
        payment_reference: directPaymentResult.transId,
        status: 'pending'
      });
      
      return {
        transactionId: transaction.id,
        fapshiTransId: directPaymentResult.transId,
        amount: totalAmount,
        escrowFee,
        status: 'pending'
      };
    } else {
      // Generate payment link
      const paymentLinkResult = await generatePaymentLink(paymentData);
      
      // Store transaction in our database
      const transaction = await storeEscrowTransaction({
        listing_id: escrowData.listingId,
        buyer_id: escrowData.buyerId,
        seller_id: escrowData.sellerId,
        amount: escrowData.amount,
        escrow_fee: escrowFee,
        payment_provider: 'fapshi',
        payment_reference: paymentLinkResult.transId,
        status: 'pending'
      });
      
      return {
        transactionId: transaction.id,
        fapshiTransId: paymentLinkResult.transId,
        paymentLink: paymentLinkResult.link,
        amount: totalAmount,
        escrowFee,
        status: 'pending'
      };
    }
  } catch (error) {
    console.error('Error creating escrow payment:', error);
    throw error;
  }
}

/**
 * Store an escrow transaction in our database
 * @param {Object} transactionData - Transaction data
 * @returns {Promise<Object>} Stored transaction
 */
async function storeEscrowTransaction(transactionData) {
  // This is a placeholder for the actual database storage
  // In a real implementation, this would use the database models
  console.log('Storing escrow transaction:', transactionData);
  
  // Simulate database storage
  return {
    id: `trans-${Date.now()}`,
    ...transactionData,
    created_at: new Date(),
    updated_at: new Date()
  };
}

/**
 * Release funds from escrow to the seller
 * @param {string} transactionId - ID of the transaction in our system
 * @returns {Promise<Object>} Updated transaction details
 */
async function releaseEscrowFunds(transactionId) {
  try {
    // This is a placeholder for the actual escrow release logic
    // In a real implementation, this would update the transaction status
    // and initiate a payout to the seller
    console.log('Releasing escrow funds for transaction:', transactionId);
    
    // Simulate database update
    return {
      id: transactionId,
      status: 'completed',
      release_date: new Date(),
      updated_at: new Date()
    };
  } catch (error) {
    console.error('Error releasing escrow funds:', error);
    throw error;
  }
}

/**
 * Process a webhook notification from Fapshi
 * @param {Object} webhookData - Webhook payload from Fapshi
 * @returns {Promise<Object>} Updated transaction details
 */
async function processWebhook(webhookData) {
  try {
    // Extract transaction details from webhook
    const { transId, status, externalId } = webhookData;
    
    console.log('Processing Fapshi webhook:', { transId, status, externalId });
    
    // Update transaction status in our database
    // This is a placeholder for the actual database update
    
    return {
      transId,
      status,
      externalId,
      processed: true
    };
  } catch (error) {
    console.error('Error processing webhook:', error);
    throw error;
  }
}

module.exports = {
  generatePaymentLink,
  checkPaymentStatus,
  expirePayment,
  getUserTransactions,
  initiateDirectPayment,
  createEscrowPayment,
  releaseEscrowFunds,
  processWebhook
};
