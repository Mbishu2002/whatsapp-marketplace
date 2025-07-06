/**
 * Script to directly register a WhatsApp group in the database
 * Use this when the !register command isn't working
 */
require('dotenv').config();
const supabase = require('../database/supabase');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function registerGroup(groupId, groupName, category) {
  try {
    console.log(`Registering group: ${groupName} (${groupId}) - Category: ${category}`);
    
    // Add to database if not exists
    const { data, error } = await supabase
      .from('groups')
      .upsert([
        { 
          id: groupId, 
          name: groupName,
          category,
          description: `Marketplace for ${category}`
        }
      ], { 
        onConflict: 'id',
        ignoreDuplicates: false 
      })
      .select();
    
    if (error) {
      console.error('Error registering group:', error);
      return false;
    }
    
    console.log('Group registered successfully:', data[0]);
    return true;
  } catch (err) {
    console.error('Error registering group:', err);
    return false;
  }
}

// Interactive prompt
async function promptForGroupInfo() {
  return new Promise((resolve) => {
    rl.question('Enter WhatsApp group ID (required): ', (groupId) => {
      if (!groupId) {
        console.error('Group ID is required');
        return promptForGroupInfo().then(resolve);
      }
      
      rl.question('Enter group name (required): ', (groupName) => {
        if (!groupName) {
          console.error('Group name is required');
          return promptForGroupInfo().then(resolve);
        }
        
        rl.question('Enter category (default: general): ', (category) => {
          resolve({
            groupId,
            groupName,
            category: category || 'general'
          });
        });
      });
    });
  });
}

// Main function
async function main() {
  try {
    console.log('WhatsApp Group Registration Tool');
    console.log('===============================');
    console.log('This tool will register a WhatsApp group directly in the database');
    console.log('You can find your group ID by sending a test message in the group and checking the server logs');
    
    const groupInfo = await promptForGroupInfo();
    const success = await registerGroup(groupInfo.groupId, groupInfo.groupName, groupInfo.category);
    
    if (success) {
      console.log('\nGroup registered successfully!');
      console.log('The bot will now monitor this group for marketplace listings');
    } else {
      console.log('\nFailed to register group. Please check the error messages above.');
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();
  }
}

// Run the script
main();
