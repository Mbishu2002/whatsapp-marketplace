/**
 * OpenRouter Client for WhatsApp Marketplace
 * 
 * This module provides a client for interacting with OpenRouter's API
 * to power our intelligent marketplace agent system.
 */

const axios = require('axios');
require('dotenv').config();

// OpenRouter API configuration
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const SITE_URL = 'https://whatsapp-marketplace.com'; // Replace with your actual site URL
const SITE_NAME = 'WhatsApp Marketplace'; // Replace with your actual site name

if (!OPENROUTER_API_KEY) {
  console.error('Missing OpenRouter API key. Please check your .env file.');
}

/**
 * Send a message to the OpenRouter API
 * @param {Array} messages - Array of message objects with role and content
 * @param {string} model - The model to use (default: 'openai/gpt-4o')
 * @param {Object} options - Additional options for the API call
 * @returns {Promise<Object>} The API response
 */
async function sendMessage(messages, model = 'openai/gpt-4o', options = {}) {
  // Set a default max_tokens if not provided
  if (typeof options.max_tokens === 'undefined') {
    options.max_tokens = 1024;
  }
  try {
    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model,
        messages,
        ...options
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': SITE_NAME
        }
      }
    );
    
    return response.data;
  } catch (error) {
    console.error('Error sending message to OpenRouter:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * Stream a response from the OpenRouter API
 * @param {Array} messages - Array of message objects with role and content
 * @param {Function} onChunk - Callback function for each chunk of the stream
 * @param {string} model - The model to use (default: 'openai/gpt-4o')
 * @param {Object} options - Additional options for the API call
 * @returns {Promise<void>}
 */
async function streamResponse(messages, onChunk, model = 'deepseek/deepseek-r1-0528:free', options = {}) {
  try {
    const response = await axios.post(
      `${OPENROUTER_BASE_URL}/chat/completions`,
      {
        model,
        messages,
        stream: true,
        ...options
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': SITE_NAME
        },
        responseType: 'stream'
      }
    );
    
    return new Promise((resolve, reject) => {
      let buffer = '';
      
      response.data.on('data', (chunk) => {
        const chunkStr = chunk.toString();
        buffer += chunkStr;
        
        // Process complete JSON objects from the stream
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last incomplete line in the buffer
        
        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.trim() === 'data: [DONE]') {
            resolve();
            return;
          }
          
          try {
            // Remove 'data: ' prefix and parse JSON
            const jsonStr = line.replace(/^data: /, '').trim();
            if (jsonStr) {
              const json = JSON.parse(jsonStr);
              onChunk(json);
            }
          } catch (e) {
            console.error('Error parsing stream chunk:', e);
          }
        }
      });
      
      response.data.on('end', () => {
        resolve();
      });
      
      response.data.on('error', (err) => {
        reject(err);
      });
    });
  } catch (error) {
    console.error('Error streaming response from OpenRouter:', error.response?.data || error.message);
    throw error;
  }
}

module.exports = {
  sendMessage,
  streamResponse
};
