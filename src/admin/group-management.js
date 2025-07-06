/**
 * Group Management Admin Interface
 * 
 * This module provides functions to manage which WhatsApp groups
 * are monitored by the marketplace bot.
 */

const express = require('express');
const { client, addMonitoredGroup } = require('../group-bot');
const supabase = require('../database/supabase');

const router = express.Router();

// Get all monitored groups
router.get('/groups', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('groups')
      .select('*');
    
    if (error) throw error;
    
    res.json({
      success: true,
      groups: data
    });
  } catch (err) {
    console.error('Error fetching groups:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Add a new group to monitor
router.post('/groups', async (req, res) => {
  try {
    const { groupId, groupName, category } = req.body;
    
    if (!groupId || !groupName) {
      return res.status(400).json({
        success: false,
        error: 'Group ID and name are required'
      });
    }
    
    // Add group to monitored list
    const group = await addMonitoredGroup(groupId, groupName, category);
    
    res.json({
      success: true,
      message: `Now monitoring group: ${groupName}`,
      group
    });
  } catch (err) {
    console.error('Error adding group:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Remove a group from monitoring
router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Remove from database
    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    res.json({
      success: true,
      message: `Group removed from monitoring`
    });
  } catch (err) {
    console.error('Error removing group:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Get all available groups that the bot is a member of
router.get('/available-groups', async (req, res) => {
  try {
    // Check if client is ready
    if (!client || !client.info) {
      return res.status(503).json({
        success: false,
        error: 'WhatsApp client not ready. Please ensure the bot is authenticated.'
      });
    }
    
    // Get all chats
    const chats = await client.getChats();
    
    // Filter for groups only
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        participants: chat.participants.length
      }));
    
    res.json({
      success: true,
      groups
    });
  } catch (err) {
    console.error('Error fetching available groups:', err);
    res.status(500).json({
      success: false,
      error: err.message
    });
  }
});

// Instructions for adding the bot to a group
router.get('/instructions', (req, res) => {
  res.json({
    success: true,
    instructions: [
      "1. Save the bot's phone number to your contacts",
      "2. Create a new WhatsApp group or open an existing one",
      "3. Add the bot to the group by selecting 'Add participant' and choosing the bot's contact",
      "4. Once added, use the admin interface to start monitoring the group",
      "5. The bot will now automatically extract listings from this group"
    ],
    botPhoneNumber: process.env.BOT_PHONE_NUMBER || "Please set BOT_PHONE_NUMBER in .env file"
  });
});

module.exports = router;
