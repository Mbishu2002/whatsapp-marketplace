/**
 * Boosting commands for the WhatsApp search bot
 */

const { supabase } = require('../../database/supabase');
const { createBoostPayment, checkListingBoost } = require('../../services/fapshi/payment');

/**
 * Handle boosting commands
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function handleBoostCommands(client, message, args) {
  const senderPhone = message.from;
  
  // If no arguments, show boosting info and available packages
  if (!args.length) {
    await showBoostingInfo(client, message);
    return;
  }
  
  const subCommand = args[0].toLowerCase();
  
  switch (subCommand) {
    case 'packages':
      await showBoostPackages(client, message);
      break;
    case 'boost':
      await handleBoost(client, message, args.slice(1));
      break;
    case 'status':
      await showBoostStatus(client, message, args.slice(1));
      break;
    case 'listings':
      await showUserListings(client, message);
      break;
    default:
      await client.sendMessage(senderPhone, 
        '❌ Unknown boost command. Available commands:\n\n' +
        '!boost packages - View available boost packages\n' +
        '!boost boost [listing_id] [package_number] - Boost a listing\n' +
        '!boost status [listing_id] - Check boost status for a listing\n' +
        '!boost listings - View your listings'
      );
  }
}

/**
 * Show boosting information
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 */
async function showBoostingInfo(client, message) {
  await client.sendMessage(message.from, 
    '*Boost Your Listings*\n\n' +
    'Make your listings stand out and get more visibility with our boosting packages!\n\n' +
    'Available commands:\n' +
    '!boost packages - View available boost packages\n' +
    '!boost boost [listing_id] [package_number] - Boost a listing\n' +
    '!boost status [listing_id] - Check boost status for a listing\n' +
    '!boost listings - View your listings'
  );
}

/**
 * Show available boost packages
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 */
async function showBoostPackages(client, message) {
  try {
    const { data: packages, error } = await supabase
      .from('boosting_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(`Error fetching boost packages: ${error.message}`);
    }
    
    if (!packages || !packages.length) {
      await client.sendMessage(message.from, '❌ No boost packages are currently available.');
      return;
    }
    
    let packagesMessage = '*Available Boost Packages*\n\n';
    
    packages.forEach((pkg, index) => {
      const durationDays = pkg.duration_hours / 24;
      
      packagesMessage += `*${index + 1}. ${pkg.name}*\n` +
        `Price: ${pkg.price} ${pkg.currency}\n` +
        `Duration: ${durationDays} day${durationDays !== 1 ? 's' : ''}\n` +
        `Priority Level: ${pkg.priority_level}\n` +
        `${pkg.description}\n\n`;
    });
    
    packagesMessage += 'To boost a listing, send:\n!boost boost [listing_id] [package_number]\n' +
      'For example: !boost boost abc123 1\n\n' +
      'To see your listings, send: !boost listings';
    
    await client.sendMessage(message.from, packagesMessage);
  } catch (error) {
    console.error('Error showing boost packages:', error);
    await client.sendMessage(message.from, '❌ Failed to fetch boost packages. Please try again later.');
  }
}

/**
 * Handle listing boost
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function handleBoost(client, message, args) {
  try {
    if (args.length < 2) {
      await client.sendMessage(message.from, 
        '❌ Please specify both listing ID and package number.\n' +
        'For example: !boost boost abc123 1\n\n' +
        'To see your listings, send: !boost listings\n' +
        'To see available packages, send: !boost packages'
      );
      return;
    }
    
    const listingId = args[0];
    const packageNumber = parseInt(args[1]);
    
    if (isNaN(packageNumber) || packageNumber < 1) {
      await client.sendMessage(message.from, '❌ Invalid package number. Please enter a valid number.');
      return;
    }
    
    // Check if listing exists and belongs to the user
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('seller_phone', message.from)
      .single();
    
    if (listingError || !listing) {
      await client.sendMessage(message.from, 
        '❌ Listing not found or you do not have permission to boost it.\n\n' +
        'To see your listings, send: !boost listings'
      );
      return;
    }
    
    // Check if listing is already boosted
    const existingBoost = await checkListingBoost(listingId);
    if (existingBoost) {
      const endDate = new Date(existingBoost.end_date);
      await client.sendMessage(message.from, 
        '❌ This listing is already boosted.\n\n' +
        `Current boost: ${existingBoost.boosting_packages.name}\n` +
        `Expires: ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}`
      );
      return;
    }
    
    // Get available packages
    const { data: packages, error } = await supabase
      .from('boosting_packages')
      .select('*')
      .eq('is_active', true)
      .order('price', { ascending: true });
    
    if (error) {
      throw new Error(`Error fetching boost packages: ${error.message}`);
    }
    
    if (!packages || !packages.length) {
      await client.sendMessage(message.from, '❌ No boost packages are currently available.');
      return;
    }
    
    if (packageNumber > packages.length) {
      await client.sendMessage(message.from, `❌ Invalid package number. Available packages are 1-${packages.length}.`);
      return;
    }
    
    const selectedPackage = packages[packageNumber - 1];
    
    // Create payment
    const payment = await createBoostPayment(message.from, listingId, selectedPackage.id);
    
    // Send payment link
    await client.sendMessage(message.from, 
      `*Boost Your Listing*\n\n` +
      `Listing: ${listing.title}\n` +
      `Package: ${selectedPackage.name}\n` +
      `Price: ${selectedPackage.price} ${selectedPackage.currency}\n` +
      `Duration: ${selectedPackage.duration_hours / 24} day(s)\n\n` +
      `To complete your boost, please make a payment using this link:\n${payment.paymentUrl}\n\n` +
      `Your listing will be boosted immediately after payment.`
    );
  } catch (error) {
    console.error('Error handling boost:', error);
    await client.sendMessage(message.from, '❌ Failed to process boost request. Please try again later.');
  }
}

/**
 * Show boost status for a listing
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function showBoostStatus(client, message, args) {
  try {
    if (!args.length) {
      await client.sendMessage(message.from, 
        '❌ Please specify a listing ID.\n' +
        'For example: !boost status abc123\n\n' +
        'To see your listings, send: !boost listings'
      );
      return;
    }
    
    const listingId = args[0];
    
    // Check if listing exists and belongs to the user
    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listingId)
      .eq('seller_phone', message.from)
      .single();
    
    if (listingError || !listing) {
      await client.sendMessage(message.from, 
        '❌ Listing not found or you do not have permission to view its boost status.\n\n' +
        'To see your listings, send: !boost listings'
      );
      return;
    }
    
    // Check boost status
    const boost = await checkListingBoost(listingId);
    
    if (!boost) {
      await client.sendMessage(message.from, 
        '*Boost Status*\n\n' +
        `Listing: ${listing.title}\n` +
        'Status: Not boosted\n\n' +
        'To boost this listing, send: !boost boost ' + listingId + ' [package_number]\n' +
        'To see available packages, send: !boost packages'
      );
      return;
    }
    
    const endDate = new Date(boost.end_date);
    const hoursRemaining = Math.ceil((endDate - new Date()) / (1000 * 60 * 60));
    
    await client.sendMessage(message.from, 
      '*Boost Status*\n\n' +
      `Listing: ${listing.title}\n` +
      `Package: ${boost.boosting_packages.name}\n` +
      `Status: Active\n` +
      `Expires: ${endDate.toLocaleDateString()} ${endDate.toLocaleTimeString()}\n` +
      `Hours remaining: ${hoursRemaining}\n\n` +
      'Your listing is currently boosted and receiving increased visibility!'
    );
  } catch (error) {
    console.error('Error showing boost status:', error);
    await client.sendMessage(message.from, '❌ Failed to fetch boost status. Please try again later.');
  }
}

/**
 * Show user's listings
 * @param {Object} client - WhatsApp client
 * @param {Object} message - Message object
 */
async function showUserListings(client, message) {
  try {
    const { data: listings, error } = await supabase
      .from('listings')
      .select('*')
      .eq('seller_phone', message.from)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      throw new Error(`Error fetching listings: ${error.message}`);
    }
    
    if (!listings || !listings.length) {
      await client.sendMessage(message.from, 
        '❌ You do not have any listings.\n\n' +
        'To create a listing, post it in a registered marketplace group.'
      );
      return;
    }
    
    let listingsMessage = '*Your Listings*\n\n';
    
    listings.forEach((listing, index) => {
      listingsMessage += `*${index + 1}. ${listing.title}*\n` +
        `ID: ${listing.id}\n` +
        `Price: ${listing.price} ${listing.currency}\n` +
        `Status: ${listing.is_boosted ? '🚀 Boosted' : 'Regular'}\n\n`;
    });
    
    listingsMessage += 'To boost a listing, send:\n!boost boost [listing_id] [package_number]\n' +
      'For example: !boost boost ' + listings[0].id + ' 1\n\n' +
      'To see available packages, send: !boost packages';
    
    await client.sendMessage(message.from, listingsMessage);
  } catch (error) {
    console.error('Error showing user listings:', error);
    await client.sendMessage(message.from, '❌ Failed to fetch your listings. Please try again later.');
  }
}

module.exports = {
  handleBoostCommands
};
