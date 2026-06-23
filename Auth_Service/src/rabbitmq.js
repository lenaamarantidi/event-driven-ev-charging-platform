/**
 * RabbitMQ Publisher for Auth Service
 * Publishes user_registered events
 */

const amqp = require('amqplib');
require('dotenv').config();

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'saas_events';

/**
 * Connect to RabbitMQ
 */
async function connectWithRetry(maxRetries = 5, initialDelay = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();

      // Declare topic exchange
      await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

      console.log('✓ RabbitMQ connected successfully (Auth Service)');
      return channel;
    } catch (err) {
      attempt++;
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (attempt < maxRetries) {
        console.log(`Retry RabbitMQ connection (${attempt}/${maxRetries}) in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.error('Failed to connect to RabbitMQ:', err.message);
        throw err;
      }
    }
  }
}

/**
 * Publish user_registered event
 */
async function publishUserRegistered(userId, timestamp) {
  try {
    if (!channel) {
      console.warn('RabbitMQ channel not initialized, skipping user_registered event publication');
      return false;
    }

    const message = {
      userId,
      timestamp
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));
    const published = channel.publish(EXCHANGE_NAME, 'user.registered', messageBuffer);

    if (!published) {
      console.warn('Message may not have been queued (backpressure)');
    }

    console.log(`[RabbitMQ] Event published: user.registered for userId=${userId}`);
    return true;
  } catch (error) {
    console.error('[RabbitMQ] Error publishing user.registered event:', error.message);
    return false;
  }
}

/**
 * Close RabbitMQ connection
 */
async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed');
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
}

module.exports = {
  connectWithRetry,
  publishUserRegistered,
  closeConnection
};
