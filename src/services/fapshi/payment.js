/**
 * Fapshi Payment Integration Service
 * Handles payment processing for subscriptions and boosting
 */

const axios = require('axios');
const { supabase } = require('../../database/supabase');

// Load environment variables
const FAPSHI_API_KEY = process.env.FAPSHI_API_KEY;
const FAPSHI_SECRET_KEY = process.env.FAPSHI_SECRET_KEY;
const BASE_URL = 'https://api.fapshi.com';

/**
 * Create a payment request for subscription
 * @param {string} userPhone - User's phone number
 * @param {string} planId - Subscription plan ID
 * @returns {Promise<Object>} - Payment details including redirect URL
 */
async function createSubscriptionPayment(userPhone, planId) {
  try {
    // Get subscription plan details
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('id', planId)
      .single();
    
    if (planError || !plan) {
      throw new Error(`Subscription plan not found: ${planError?.message || 'Unknown error'}`);
    }
    
    // Create payment request to Fapshi
    const response = await axios.post(
      `${BASE_URL}/v1/payments`,
      {
        amount: plan.price,
        currency: plan.currency,
        description: `${plan.name} Subscription - ${plan.duration_days} days`,
        external_reference: `sub_${userPhone}_${planId}_${Date.now()}`,
        redirect_url: `${process.env.BASE_URL}/payment/subscription/callback`,
        purchaser_phone: userPhone.replace('+', '')
      },
      {
        headers: {
          'Authorization': `Bearer ${FAPSHI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Create pending subscription record
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + plan.duration_days);
    
    const { data: subscription, error: subscriptionError } = await supabase
      .from('user_subscriptions')
      .insert([
        {
          user_phone: userPhone,
          plan_id: planId,
          end_date: endDate.toISOString(),
          payment_reference: response.data.reference,
          status: 'pending'
        }
      ])
      .select()
      .single();
    
    if (subscriptionError) {
      console.error('Error creating subscription record:', subscriptionError);
    }
    
    return {
      paymentUrl: response.data.payment_url,
      reference: response.data.reference,
      amount: plan.price,
      currency: plan.currency,
      subscriptionId: subscription?.id
    };
  } catch (error) {
    console.error('Error creating subscription payment:', error);
    throw error;
  }
}

/**
 * Create a payment request for listing boost
 * @param {string} userPhone - User's phone number
 * @param {string} listingId - Listing ID to boost
 * @param {string} packageId - Boost package ID
 * @returns {Promise<Object>} - Payment details including redirect URL
 */
async function createBoostPayment(userPhone, listingId, packageId) {
  try {
    // Get boost package details
    const { data: boostPackage, error: packageError } = await supabase
      .from('boosting_packages')
      .select('*')
      .eq('id', packageId)
      .single();
    
    if (packageError || !boostPackage) {
      throw new Error(`Boost package not found: ${packageError?.message || 'Unknown error'}`);
    }
    
    // Get listing details
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('title')
      .eq('id', listingId)
      .single();
    
    if (listingError || !listing) {
      throw new Error(`Listing not found: ${listingError?.message || 'Unknown error'}`);
    }
    
    // Create payment request to Fapshi
    const response = await axios.post(
      `${BASE_URL}/v1/payments`,
      {
        amount: boostPackage.price,
        currency: boostPackage.currency,
        description: `${boostPackage.name} for listing: ${listing.title.substring(0, 30)}...`,
        external_reference: `boost_${userPhone}_${listingId}_${Date.now()}`,
        redirect_url: `${process.env.BASE_URL}/payment/boost/callback`,
        purchaser_phone: userPhone.replace('+', '')
      },
      {
        headers: {
          'Authorization': `Bearer ${FAPSHI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Create pending boost record
    const endDate = new Date();
    endDate.setHours(endDate.getHours() + boostPackage.duration_hours);
    
    const { data: boost, error: boostError } = await supabase
      .from('listing_boosts')
      .insert([
        {
          listing_id: listingId,
          package_id: packageId,
          end_date: endDate.toISOString(),
          payment_reference: response.data.reference,
          status: 'pending'
        }
      ])
      .select()
      .single();
    
    if (boostError) {
      console.error('Error creating boost record:', boostError);
    }
    
    // Update listing to indicate it's being boosted (pending payment)
    await supabase
      .from('listings')
      .update({ is_boosted: true, boost_expires_at: endDate.toISOString() })
      .eq('id', listingId);
    
    return {
      paymentUrl: response.data.payment_url,
      reference: response.data.reference,
      amount: boostPackage.price,
      currency: boostPackage.currency,
      boostId: boost?.id
    };
  } catch (error) {
    console.error('Error creating boost payment:', error);
    throw error;
  }
}

/**
 * Verify payment status with Fapshi
 * @param {string} reference - Payment reference
 * @returns {Promise<Object>} - Payment status details
 */
async function verifyPayment(reference) {
  try {
    const response = await axios.get(
      `${BASE_URL}/v1/payments/${reference}`,
      {
        headers: {
          'Authorization': `Bearer ${FAPSHI_SECRET_KEY}`
        }
      }
    );
    
    return {
      status: response.data.status,
      amount: response.data.amount,
      reference: response.data.reference,
      externalReference: response.data.external_reference
    };
  } catch (error) {
    console.error('Error verifying payment:', error);
    throw error;
  }
}

/**
 * Process subscription payment callback
 * @param {string} reference - Payment reference
 * @returns {Promise<Object>} - Updated subscription details
 */
async function processSubscriptionCallback(reference) {
  try {
    // Verify payment with Fapshi
    const paymentStatus = await verifyPayment(reference);
    
    if (paymentStatus.status !== 'successful') {
      throw new Error(`Payment not successful: ${paymentStatus.status}`);
    }
    
    // Update subscription status
    const { data: subscription, error } = await supabase
      .from('user_subscriptions')
      .update({ status: 'active' })
      .eq('payment_reference', reference)
      .select()
      .single();
    
    if (error) {
      throw new Error(`Error updating subscription: ${error.message}`);
    }
    
    return subscription;
  } catch (error) {
    console.error('Error processing subscription callback:', error);
    throw error;
  }
}

/**
 * Process boost payment callback
 * @param {string} reference - Payment reference
 * @returns {Promise<Object>} - Updated boost details
 */
async function processBoostCallback(reference) {
  try {
    // Verify payment with Fapshi
    const paymentStatus = await verifyPayment(reference);
    
    if (paymentStatus.status !== 'successful') {
      throw new Error(`Payment not successful: ${paymentStatus.status}`);
    }
    
    // Update boost status
    const { data: boost, error } = await supabase
      .from('listing_boosts')
      .update({ status: 'active' })
      .eq('payment_reference', reference)
      .select('*, listing_id, package_id')
      .single();
    
    if (error) {
      throw new Error(`Error updating boost: ${error.message}`);
    }
    
    // Update listing boost status
    await supabase
      .from('listings')
      .update({ 
        is_boosted: true,
        boost_expires_at: boost.end_date
      })
      .eq('id', boost.listing_id);
    
    return boost;
  } catch (error) {
    console.error('Error processing boost callback:', error);
    throw error;
  }
}

/**
 * Check if user has an active subscription
 * @param {string} userPhone - User's phone number
 * @returns {Promise<Object|null>} - Subscription details or null if no active subscription
 */
async function checkUserSubscription(userPhone) {
  try {
    const { data, error } = await supabase
      .from('user_subscriptions')
      .select('*, subscription_plans(*)')
      .eq('user_phone', userPhone)
      .eq('status', 'active')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
      console.error('Error checking subscription:', error);
    }
    
    return data || null;
  } catch (error) {
    console.error('Error checking user subscription:', error);
    return null;
  }
}

/**
 * Check if a listing is boosted
 * @param {string} listingId - Listing ID
 * @returns {Promise<Object|null>} - Boost details or null if not boosted
 */
async function checkListingBoost(listingId) {
  try {
    const { data, error } = await supabase
      .from('listing_boosts')
      .select('*, boosting_packages(*)')
      .eq('listing_id', listingId)
      .eq('status', 'active')
      .lte('start_date', new Date().toISOString())
      .gte('end_date', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned" error
      console.error('Error checking listing boost:', error);
    }
    
    return data || null;
  } catch (error) {
    console.error('Error checking listing boost:', error);
    return null;
  }
}

module.exports = {
  createSubscriptionPayment,
  createBoostPayment,
  verifyPayment,
  processSubscriptionCallback,
  processBoostCallback,
  checkUserSubscription,
  checkListingBoost
};
