/**
 * RabbitMQ Publisher for Provider Management Service
 * Publishes provider_registered events
 */

const amqp = require('amqplib');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'saas_events';

async function connectWithRetry(maxRetries = 5, initialDelay = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
      console.log('RabbitMQ connected (Provider Management Service)');
      return channel;
    } catch (err) {
      attempt++;
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (attempt < maxRetries) {
        console.log(`Retry RabbitMQ (${attempt}/${maxRetries}) in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        console.warn('Could not connect to RabbitMQ:', err.message);
        return null;
      }
    }
  }
}

async function publishProviderRegistered(providerId, providerName, timestamp) {
  try {
    if (!channel) {
      console.warn('[RabbitMQ] Channel not initialized, skipping provider_registered event');
      return false;
    }
    const message = { providerId, providerName, timestamp };
    const published = channel.publish(EXCHANGE_NAME, 'provider.registered', Buffer.from(JSON.stringify(message)));
    console.log(`[RabbitMQ] Event published: provider.registered for providerId=${providerId}`);
    return published;
  } catch (error) {
    console.error('[RabbitMQ] Error publishing provider.registered event:', error.message);
    return false;
  }
}

async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
  } catch (err) {
    console.error('Error closing RabbitMQ connection:', err.message);
  }
}

module.exports = { connectWithRetry, closeConnection, publishProviderRegistered };
