/**
 * Group Registration Service
 * 
 * This module handles the registration of WhatsApp groups for marketplace monitoring.
 * It provides functions to register groups via the WhatsApp Cloud API bot.
 */

const supabase = require('../database/supabase');

// Set to store monitored groups in memory
const monitoredGroups = new Set();

/**
 * Register a new group for marketplace monitoring
 * @param {string} inviteCode - WhatsApp group invite code
 * @param {string} groupName - Name of the group
 * @param {string} category - Category of the marketplace
 * @param {string} adminPhone - Phone number of the admin registering the group
 * @returns {Promise<Object>} - Registration result
 */
async function registerGroup(inviteCode, groupName, category, adminPhone) {
  try {
    console.log(`Registering group: ${groupName} (${inviteCode}) - Category: ${category}`);
    
    // Generate a group ID from the invite code
    // This is a workaround since we can't get the actual group ID
    const groupId = `invite_${inviteCode}`;
    
    // Add to database if not exists
    const { data, error } = await supabase
      .from('groups')
      .upsert([
        { 
          id: groupId, 
          name: groupName,
          category,
          description: `Marketplace for ${category}`,
          admin_phone: adminPhone,
          invite_code: inviteCode
        }
      ], { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select();
    
    if (error) {
      console.error('Error registering group:', error);
      return { success: false, error: error.message };
    }
    
    // Add to in-memory set for faster lookups
    monitoredGroups.add(groupId);
    
    console.log('Group registered successfully:', data[0]);
    return { success: true, data: data[0] };
  } catch (err) {
    console.error('Error registering group:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Check if a group is registered for monitoring
 * @param {string} inviteCode - WhatsApp group invite code
 * @returns {Promise<boolean>} - True if group is registered
 */
async function isGroupRegistered(inviteCode) {
  try {
    const groupId = `invite_${inviteCode}`;
    
    // Check in-memory set first for performance
    if (monitoredGroups.has(groupId)) {
      return true;
    }
    
    // Check database
    const { data, error } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', inviteCode)
      .single();
    
    if (error || !data) {
      return false;
    }
    
    // Add to in-memory set for future lookups
    monitoredGroups.add(data.id);
    return true;
  } catch (err) {
    console.error('Error checking group registration:', err);
    return false;
  }
}

/**
 * Load all monitored groups from the database into memory
 * @returns {Promise<void>}
 */
async function loadMonitoredGroups() {
  try {
    console.log('Loading monitored groups from database...');
    
    const { data, error } = await supabase
      .from('groups')
      .select('id');
    
    if (error) {
      console.error('Error loading monitored groups:', error);
      return;
    }
    
    if (data && data.length > 0) {
      data.forEach(group => monitoredGroups.add(group.id));
      console.log(`Loaded ${data.length} monitored groups`);
    } else {
      console.log('No monitored groups found in database');
    }
  } catch (err) {
    console.error('Error loading monitored groups:', err);
  }
}

// Load monitored groups on module initialization
loadMonitoredGroups();

module.exports = {
  registerGroup,
  isGroupRegistered,
  loadMonitoredGroups,
  monitoredGroups
};
