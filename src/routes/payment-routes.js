/**
 * Payment Routes
 * Handles subscription and boosting payment endpoints
 */

const express = require('express');
const router = express.Router();
const { 
  createSubscriptionPayment, 
  createBoostPayment,
  processSubscriptionCallback,
  processBoostCallback,
  checkUserSubscription,
  checkListingBoost
} = require('../services/fapshi/payment');

// Create subscription payment
router.post('/subscription', async (req, res) => {
  try {
    const { userPhone, planId } = req.body;
    
    if (!userPhone || !planId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: userPhone, planId' 
      });
    }
    
    const payment = await createSubscriptionPayment(userPhone, planId);
    
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create subscription payment'
    });
  }
});

// Create boost payment
router.post('/boost', async (req, res) => {
  try {
    const { userPhone, listingId, packageId } = req.body;
    
    if (!userPhone || !listingId || !packageId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: userPhone, listingId, packageId' 
      });
    }
    
    const payment = await createBoostPayment(userPhone, listingId, packageId);
    
    res.json({
      success: true,
      data: payment
    });
  } catch (error) {
    console.error('Error creating boost payment:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to create boost payment'
    });
  }
});

// Subscription payment callback
router.get('/subscription/callback', async (req, res) => {
  try {
    const { reference } = req.query;
    
    if (!reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing payment reference' 
      });
    }
    
    const subscription = await processSubscriptionCallback(reference);
    
    // Redirect to success page
    res.redirect(`/payment/success?type=subscription&id=${subscription.id}`);
  } catch (error) {
    console.error('Error processing subscription callback:', error);
    res.redirect(`/payment/error?message=${encodeURIComponent(error.message)}`);
  }
});

// Boost payment callback
router.get('/boost/callback', async (req, res) => {
  try {
    const { reference } = req.query;
    
    if (!reference) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing payment reference' 
      });
    }
    
    const boost = await processBoostCallback(reference);
    
    // Redirect to success page
    res.redirect(`/payment/success?type=boost&id=${boost.id}`);
  } catch (error) {
    console.error('Error processing boost callback:', error);
    res.redirect(`/payment/error?message=${encodeURIComponent(error.message)}`);
  }
});

// Check user subscription
router.get('/subscription/check/:userPhone', async (req, res) => {
  try {
    const { userPhone } = req.params;
    
    if (!userPhone) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing user phone number' 
      });
    }
    
    const subscription = await checkUserSubscription(userPhone);
    
    res.json({
      success: true,
      hasActiveSubscription: !!subscription,
      data: subscription
    });
  } catch (error) {
    console.error('Error checking subscription:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check subscription'
    });
  }
});

// Check listing boost
router.get('/boost/check/:listingId', async (req, res) => {
  try {
    const { listingId } = req.params;
    
    if (!listingId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing listing ID' 
      });
    }
    
    const boost = await checkListingBoost(listingId);
    
    res.json({
      success: true,
      isBoosted: !!boost,
      data: boost
    });
  } catch (error) {
    console.error('Error checking listing boost:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to check listing boost'
    });
  }
});

// Get all subscription plans
router.get('/subscription/plans', async (req, res) => {
  try {
    const { data, error } = await require('../database/supabase').supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch subscription plans'
    });
  }
});

// Get all boosting packages
router.get('/boost/packages', async (req, res) => {
  try {
    const { data, error } = await require('../database/supabase').supabase
      .from('boosting_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(error.message);
    }
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error fetching boosting packages:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch boosting packages'
    });
  }
});

module.exports = router;
