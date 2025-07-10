/**
 * MongoDB connection module for WhatsApp Marketplace
 * Used primarily for WhatsApp Web.js session storage
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Get MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI;

// Connect to MongoDB
async function connectToMongoDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB successfully');
    return true;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    return false;
  }
}

// Export the connection function and mongoose instance
module.exports = {
  connectToMongoDB,
  mongoose
};
