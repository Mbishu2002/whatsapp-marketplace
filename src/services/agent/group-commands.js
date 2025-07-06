/**
 * Group Registration Command Handler
 * 
 * This module handles group registration commands for the WhatsApp Marketplace bot.
 * It processes commands like "register group" and guides users through the registration process.
 */

const { registerGroup, isGroupRegistered } = require('../group-registration');

// User registration states
const registrationStates = {
  IDLE: 'idle',
  AWAITING_GROUP_NAME: 'awaiting_group_name',
  AWAITING_INVITE_LINK: 'awaiting_invite_link',
  AWAITING_CATEGORY: 'awaiting_category'
};

// In-memory storage for registration sessions
const registrationSessions = new Map();

/**
 * Get or create a registration session for a user
 * @param {string} userId - The user's WhatsApp ID
 * @returns {Object} The registration session
 */
function getRegistrationSession(userId) {
  if (!registrationSessions.has(userId)) {
    registrationSessions.set(userId, {
      state: registrationStates.IDLE,
      groupName: null,
      inviteCode: null,
      category: null
    });
  }
  return registrationSessions.get(userId);
}

/**
 * Reset a user's registration session
 * @param {string} userId - The user's WhatsApp ID
 */
function resetRegistrationSession(userId) {
  registrationSessions.set(userId, {
    state: registrationStates.IDLE,
    groupName: null,
    inviteCode: null,
    category: null
  });
}

/**
 * Extract invite code from a WhatsApp group invite link
 * @param {string} link - The WhatsApp group invite link
 * @returns {string|null} The extracted invite code or null if invalid
 */
function extractInviteCode(link) {
  if (!link) return null;
  
  // Try to match the invite code from different possible formats
  const patterns = [
    /chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/,  // Standard format
    /^([A-Za-z0-9_-]{22})$/                   // Just the code
  ];
  
  for (const pattern of patterns) {
    const match = link.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  return null;
}

/**
 * Process a group registration command
 * @param {string} userId - The user's WhatsApp ID
 * @param {string} message - The user's message
 * @returns {Promise<Object>} The response to send back to the user
 */
async function processGroupCommand(userId, message) {
  const session = getRegistrationSession(userId);
  const lowerMessage = message.toLowerCase().trim();
  
  // Check for cancel command at any stage
  if (lowerMessage === 'cancel' && session.state !== registrationStates.IDLE) {
    resetRegistrationSession(userId);
    return {
      text: "Group registration canceled. How else can I help you today?",
      actions: [
        { type: 'button', text: '🔍 Search Products' },
        { type: 'button', text: '📋 Register Group' },
        { type: 'button', text: '❓ Help' }
      ]
    };
  }
  
  // Check for register command to start the process
  if (lowerMessage.includes('register group') || lowerMessage === 'register' || lowerMessage === '📋 register group') {
    session.state = registrationStates.AWAITING_GROUP_NAME;
    return {
      text: "Let's register your WhatsApp group for marketplace monitoring! 📋\n\n" +
            "What's the name of your group?\n\n" +
            "Type 'cancel' at any time to stop the registration process.",
      actions: [
        { type: 'button', text: 'Cancel' }
      ]
    };
  }
  
  // Process based on current registration state
  switch (session.state) {
    case registrationStates.AWAITING_GROUP_NAME:
      session.groupName = message.trim();
      session.state = registrationStates.AWAITING_INVITE_LINK;
      return {
        text: `Great! Now please send me the invite link for your group "${session.groupName}".\n\n` +
              "You can get this by:\n" +
              "1. Opening your WhatsApp group\n" +
              "2. Tapping the group name at the top\n" +
              "3. Scrolling down to 'Invite to Group via Link'\n" +
              "4. Copying and sending the link here",
        actions: [
          { type: 'button', text: 'Cancel' }
        ]
      };
      
    case registrationStates.AWAITING_INVITE_LINK:
      const inviteCode = extractInviteCode(message.trim());
      if (!inviteCode) {
        return {
          text: "That doesn't look like a valid WhatsApp group invite link. Please send a link in the format 'https://chat.whatsapp.com/ABCDEF123456'.",
          actions: [
            { type: 'button', text: 'Cancel' }
          ]
        };
      }
      
      // Check if group is already registered
      const isRegistered = await isGroupRegistered(inviteCode);
      if (isRegistered) {
        resetRegistrationSession(userId);
        return {
          text: "This group is already registered for marketplace monitoring! No need to register it again.",
          actions: [
            { type: 'button', text: '🔍 Search Products' },
            { type: 'button', text: '❓ Help' }
          ]
        };
      }
      
      session.inviteCode = inviteCode;
      session.state = registrationStates.AWAITING_CATEGORY;
      return {
        text: "Perfect! Now please select a category for your marketplace group:",
        actions: [
          { type: 'button', text: '📱 Electronics' },
          { type: 'button', text: '👕 Fashion' },
          { type: 'button', text: '🏠 Real Estate' },
          { type: 'button', text: '🚗 Vehicles' },
          { type: 'button', text: '📦 General' },
          { type: 'button', text: 'Cancel' }
        ]
      };
      
    case registrationStates.AWAITING_CATEGORY:
      // Process category selection
      let category = 'general';
      
      if (lowerMessage.includes('electronics')) category = 'electronics';
      else if (lowerMessage.includes('fashion')) category = 'fashion';
      else if (lowerMessage.includes('real estate')) category = 'real_estate';
      else if (lowerMessage.includes('vehicles')) category = 'vehicles';
      else if (lowerMessage.includes('general')) category = 'general';
      else category = lowerMessage.replace(/[^\w]/g, '_').toLowerCase();
      
      // Register the group
      const result = await registerGroup(
        session.inviteCode,
        session.groupName,
        category,
        userId
      );
      
      resetRegistrationSession(userId);
      
      if (result.success) {
        // Get the website URL from environment or use a default
        const websiteUrl = process.env.WEBSITE_URL || 'http://localhost:3000';
        const setupUrl = `${websiteUrl}/setup-guide.html`;
        
        return {
          text: `✅ Success! Your group "${session.groupName}" has been registered as a ${category} marketplace.\n\n` +
                "IMPORTANT NEXT STEP:\n" +
                "To complete the setup, you need to link the bot to your group for monitoring.\n\n" +
                `Please visit ${setupUrl} and scan the QR code to link your WhatsApp account.\n\n` +
                "This step is necessary for the bot to monitor messages in your group.",
          actions: [
            { type: 'button', text: '🔍 Search Products' },
            { type: 'button', text: '❓ Help' }
          ]
        };
      } else {
        return {
          text: "❌ Sorry, there was an error registering your group. Please try again later.",
          actions: [
            { type: 'button', text: '🔍 Search Products' },
            { type: 'button', text: '📋 Register Group' },
            { type: 'button', text: '❓ Help' }
          ]
        };
      }
      
    default:
      return null; // Not a registration command or not in registration flow
  }
}

/**
 * Check if a message is a group command
 * @param {string} message - The user's message
 * @param {Object} session - The user's registration session
 * @returns {boolean} True if the message is a group command
 */
function isGroupCommand(message, userId) {
  const session = getRegistrationSession(userId);
  const lowerMessage = message.toLowerCase().trim();
  
  // If user is in the middle of registration, treat all messages as commands
  if (session.state !== registrationStates.IDLE) {
    return true;
  }
  
  // Check for registration start commands
  return lowerMessage.includes('register group') || 
         lowerMessage === 'register' || 
         lowerMessage === '📋 register group';
}

module.exports = {
  processGroupCommand,
  isGroupCommand,
  getRegistrationSession,
  resetRegistrationSession
};
