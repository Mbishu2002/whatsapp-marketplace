/**
 * Subscription commands for the WhatsApp search bot
 */

const { supabase } = require('../../database/supabase');
const { createSubscriptionPayment, checkUserSubscription } = require('../../services/fapshi/payment');

/**
 * Handle subscription commands
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function handleSubscriptionCommands(client, message, args) {
  const senderPhone = message.from;
  
  // If no arguments, show subscription status and available plans
  if (!args.length) {
    await showSubscriptionStatus(client, message);
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch (subCommand) {
    case 'plans':
      await showSubscriptionPlans(client, message);
      break;
    case 'subscribe':
      await handleSubscribe(client, message, args.slice(1));
      break;
    case 'status':
      await showSubscriptionStatus(client, message);
      break;
    default:
      await client.sendMessage(senderPhone, 
        '❌ Unknown subscription command. Available commands:\n\n' +
        '!subscription plans - View available subscription plans\n' +
        '!subscription subscribe [plan_number] - Subscribe to a plan\n' +
        '!subscription status - Check your current subscription status'
      );
  }
}

/**
 * Show available subscription plans
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 */
async function showSubscriptionPlans(client, message) {
  try {
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(`Error fetching subscription plans: ${error.message}`);
    }
    
    if (!plans || !plans.length) {
      await client.sendMessage(message.from, '❌ No subscription plans are currently available.');
      return;
    }
    
    let plansMessage = '*Available Subscription Plans*\n\n';
    
    plans.forEach((plan, index) => {
      const features = plan.features ? Object.entries(plan.features)
        .map(([key, value]) => `- ${key.replace(/_/g, ' ')}: ${value}`)
        .join('\n') : 'No features listed';
      
      plansMessage += `*${index + 1}. ${plan.name}*\n` +
        `Price: ${plan.price} ${plan.currency}\n` +
        `Duration: ${plan.duration_days} days\n` +
        `Features:\n${features}\n\n`;
    });
    
    plansMessage += 'To subscribe, send:\n!subscription subscribe [plan_number]\n' +
      'For example: !subscription subscribe 1';
    
    await client.sendMessage(message.from, plansMessage);
  } catch (error) {
    console.error('Error showing subscription plans:', error);
    await client.sendMessage(message.from, '❌ Failed to fetch subscription plans. Please try again later.');
  }
}

/**
 * Handle subscription purchase
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function handleSubscribe(client, message, args) {
  try {
    if (!args.length) {
      await client.sendMessage(message.from, 
        '❌ Please specify a plan number. For example: !subscription subscribe 1\n\n' +
        'To see available plans, send: !subscription plans'
      );
      return;
    }
    
    const planNumber = parseInt(args[0]);
    if (isNaN(planNumber) || planNumber < 1) {
      await client.sendMessage(message.from, '❌ Invalid plan number. Please enter a valid number.');
      return;
    }
    
    // Get available plans
    const { data: plans, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(`Error fetching subscription plans: ${error.message}`);
    }
    
    if (!plans || !plans.length) {
      await client.sendMessage(message.from, '❌ No subscription plans are currently available.');
      return;
    }
    
    if (planNumber > plans.length) {
      await client.sendMessage(message.from, `❌ Invalid plan number. Available plans are 1-${plans.length}.`);
      return;
    }
    
    const selectedPlan = plans[planNumber - 1];
    
    // Create payment
    const payment = await createSubscriptionPayment(message.from, selectedPlan.id);
    
    // Send payment link
    await client.sendMessage(message.from, 
      `*${selectedPlan.name} Subscription*\n\n` +
      `Price: ${selectedPlan.price} ${selectedPlan.currency}\n` +
      `Duration: ${selectedPlan.duration_days} days\n\n` +
      `To complete your subscription, please make a payment using this link:\n${payment.paymentUrl}\n\n` +
      `Your subscription will be activated immediately after payment.`
    );
  } catch (error) {
    console.error('Error handling subscription:', error);
    await client.sendMessage(message.from, '❌ Failed to process subscription request. Please try again later.');
  }
}

/**
 * Show user's subscription status
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 */
async function showSubscriptionStatus(client, message) {
  try {
    const subscription = await checkUserSubscription(message.from);
    
    if (!subscription) {
      await client.sendMessage(message.from, 
        '*Subscription Status*\n\n' +
        'You do not have an active subscription.\n\n' +
        'To view available subscription plans, send: !subscription plans'
      );
      return;
    }
    
    const endDate = new Date(subscription.end_date);
    const daysRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60 * 24));
    
    await client.sendMessage(message.from, 
      '*Subscription Status*\n\n' +
      `Plan: ${subscription.subscription_plans.name}\n` +
      `Status: Active\n` +
      `Expires: ${endDate.toLocaleDateString()}\n` +
      `Days remaining: ${daysRemaining}\n\n` +
      'To renew your subscription, send: !subscription plans'
    );
  } catch (error) {
    console.error('Error showing subscription status:', error);
    await client.sendMessage(message.from, '❌ Failed to fetch subscription status. Please try again later.');
  }
}

module.exports = {
  handleSubscriptionCommands
};
