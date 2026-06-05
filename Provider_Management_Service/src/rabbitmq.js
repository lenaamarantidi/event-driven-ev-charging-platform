/**
 * RabbitMQ Configuration and Connection Manager
 * Provider_Management_Service
 * 
 * Publishes events:
 * - provider.registered: When a new provider registers
 */

const amqp = require('amqplib');

let connection = null;
let channel = null;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = 'provider_exchange';
const QUEUE_DEADLETTER = 'provider_dlq';

/**
 * Connect to RabbitMQ and setup publisher channel
 */
async function connectRabbitMQ() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare exchange for provider events
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });

    // Setup dead-letter queue for failed messages
    await channel.assertQueue(QUEUE_DEADLETTER, { durable: true });
    await channel.bindQueue(QUEUE_DEADLETTER, EXCHANGE_NAME, 'provider.error');

    console.log('Connected to RabbitMQ - Provider Management Service');
    return channel;
  } catch (err) {
    console.error('RabbitMQ connection error:', err.message);
    throw err;
  }
}

/**
 * Publish provider.registered event
 * Called when a new provider completes registration
 * 
 * @param {Object} providerData - Provider details
 */
async function publishProviderRegistered(providerData) {
  if (!channel) {
    console.error('RabbitMQ channel not initialized');
    return false;
  }

  try {
    const message = JSON.stringify({
      eventType: 'provider.registered',
      timestamp: new Date().toISOString(),
      data: {
        providerId: providerData.provider_id,
        providerName: providerData.provider_name,
        baseUrl: providerData.base_url,
        apiKey: providerData.api_key,
        endpoints: {
          listPoints: providerData.endpoint_list_points,
          pointDetails: providerData.endpoint_point_details,
          reserve: providerData.endpoint_reserve,
          reserveDuration: providerData.endpoint_reserve_duration
        }
      }
    });

    await channel.publish(
      EXCHANGE_NAME,
      'provider.registered',
      Buffer.from(message),
      { persistent: true }
    );

    console.log(`Event published: provider.registered for provider ${providerData.provider_id}`);
    return true;
  } catch (err) {
    console.error('Failed to publish provider.registered event:', err.message);
    return false;
  }
}

/**
 * Graceful shutdown of RabbitMQ connection
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

/**
 * Retry logic with exponential backoff
 */
async function connectWithRetry(maxRetries = 5, initialDelay = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    try {
      await connectRabbitMQ();
      return;
    } catch (err) {
      attempt++;
      const delay = initialDelay * Math.pow(2, attempt - 1);
      if (attempt < maxRetries) {
        console.log(`Retry RabbitMQ connection (${attempt}/${maxRetries}) in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw err;
      }
    }
  }
}

module.exports = {
  connectRabbitMQ,
  connectWithRetry,
  publishProviderRegistered,
  closeConnection
};
