const { initiatePay, directPay } = require('../../services/fapshi/payment');

/**
 * Handle Fapshi payment-related commands for the search bot
 * @param {Object} client - WhatsApp client (mocked)
 * @param {Object} message - Message object
 * @param {Array} args - Command arguments
 */
async function handleFapshiCommands(client, message, args) {
  const [subcommand, ...rest] = args;
  const reply = async (text) => client.sendMessage(message.from, text);

  try {
    switch (subcommand) {
      case 'checkout': {
        // Usage: !fapshi checkout <amount> <phone> <cartId>
        if (rest.length < 3) return reply('Usage: !fapshi checkout <amount> <phone> <cartId>');
        const [amount, phone, cartId] = rest;
        // Include metadata in externalId
        const externalId = `checkout|${phone}|${cartId}`;
        const result = await initiatePay({ amount: Number(amount), phone, externalId });
        if (result && result.paymentUrl) {
          return reply(`Pay here: ${result.paymentUrl}\n\nAfter payment, you will be notified automatically here on WhatsApp.\n\n*Note: Payment status is only available via webhook notification, not on-demand.*`);
        } else {
          return reply('Failed to generate checkout link.');
        }
      }
      case 'directpay': {
        if (rest.length < 4) return reply('Usage: !fapshi directpay <amount> <phone> <name> <email>');
        const [amount, phone, name, email] = rest;
        const result = await directPay({ amount: Number(amount), phone, name, email });
        if (result && result.status === 'success') {
          return reply(`Direct payment initiated! Transaction ID: ${result.transId || result.transaction_id}\n\nYou will be notified automatically here on WhatsApp when payment is confirmed.`);
        } else {
          return reply('Failed to initiate direct payment.');
        }
      }
      default:
        // Remove status command, only allow checkout and directpay
        return reply('Usage: !fapshi <checkout|directpay> ...');
    }
  } catch (e) {
    return reply('Fapshi error: ' + (e.message || e));
  }
}

module.exports = { handleFapshiCommands }; 