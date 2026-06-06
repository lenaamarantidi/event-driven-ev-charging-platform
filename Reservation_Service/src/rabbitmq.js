/**
 * RabbitMQ Publisher
 * Publishes reservation_successful events to Reservation & Points services
 */

const amqp = require('amqplib');
require('dotenv').config();

let connection;
let channel;

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';

const EXCHANGES = {
  // Note: billing and per-reservation analytics updates are handled elsewhere / removed by design.
  reservation: 'reservation_exchange'
};


/**
 * Connect to RabbitMQ with exponential backoff retry
 */
async function connectWithRetry(attempt = 1, maxAttempts = 5) {
  try {
    console.log(`[RabbitMQ] Connecting to ${RABBITMQ_URL}... (attempt ${attempt}/${maxAttempts})`);

    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // Declare exchanges
    await channel.assertExchange(EXCHANGES.reservation, 'topic', { durable: true });


    // Setup dead letter exchanges (harmless if not used)
    await channel.assertExchange('dlx_billing', 'topic', { durable: true });
    await channel.assertExchange('dlx_analytics', 'topic', { durable: true });


    console.log('✓ RabbitMQ connected successfully');
    console.log('✓ Exchanges & Queues initialized');

    return channel;
  } catch (error) {
    console.error(`[RabbitMQ] Connection failed (attempt ${attempt}/${maxAttempts}):`, error.message);

    if (attempt < maxAttempts) {
      const delayMs = Math.min(2000 * attempt, 10000);
      console.log(`[RabbitMQ] Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return connectWithRetry(attempt + 1, maxAttempts);
    }

    throw new Error(`Failed to connect to RabbitMQ after ${maxAttempts} attempts`);
  }
}

/**
 * Publish reservation_successful event
 * This event is consumed by Points_Service.
 * Billing/Analytics are now updated via daily batch publishing.
 */

async function publishReservationEvent(eventData) {
  try {
    if (!channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    const {
      reservationId,
      providerId,
      providerName,
      pointId,
      duration,
      timestamp,
      reservationDetails,
      reservation_end_time,
      reservation_status
    } = eventData;

    const message = {
      eventType: 'reservation_successful',
      type: 'reservation_successful',
      timestamp,
      data: {
        reservationId,
        providerId,
        providerName,
        pointId,
        duration,
        reservation_end_time,
        reservation_status,
        reservationDetails,
        event_metadata: {
          reservation_id: reservationId,
          provider_id: providerId,
          point_id: pointId,
          duration_minutes: duration,
          reservation_end_time,
          reservation_status
        }
      }
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));

    // Publish to reservation exchange only (Billing/Analytics are batch-updated by Reservation_Service)
    const reservationPublished = channel.publish(
      EXCHANGES.reservation,
      'reservation_successful',
      messageBuffer
    );

    if (!reservationPublished) {
      console.warn('[RabbitMQ] Message may not have been queued (backpressure)');
    }

    console.log(`[RabbitMQ] Event published:
      Type: reservation_successful
      Reservation ID: ${reservationId}
      Provider: ${providerName} (ID: ${providerId})
      Point: ${pointId}
      Duration: ${duration} minutes
    `);


    return true;
  } catch (error) {
    console.error('[RabbitMQ] Publishing error:', error.message);
    throw error;
  }
}

/**
 * Get channel (for potential consumers)
 */
function getChannel() {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }
  return channel;
}

/**
 * Close RabbitMQ connection
 */
async function closeConnection() {
  try {
    if (channel) {
      await channel.close();
      console.log('[RabbitMQ] Channel closed');
    }
    if (connection) {
      await connection.close();
      console.log('[RabbitMQ] Connection closed');
    }
  } catch (error) {
    console.error('[RabbitMQ] Error closing connection:', error.message);
  }
}

/**
 * Publish a daily analytics aggregate payload to analytics_exchange.
 */
async function publishAnalyticsDaily(payload) {
  try {
    if (!channel) throw new Error('RabbitMQ channel not initialized');

    // Declare exchange lazily (safe if already exists)
    const ANALYTICS_EXCHANGE = 'analytics_exchange';
    await channel.assertExchange(ANALYTICS_EXCHANGE, 'topic', { durable: true });

    const routingKey = 'analytics.reservations.daily';

    const message = {
      eventType: 'analytics_reservations_daily',
      type: 'analytics_reservations_daily',
      timestamp: new Date().toISOString(),
      data: payload
    };

    const messageBuffer = Buffer.from(JSON.stringify(message));

    const published = channel.publish(ANALYTICS_EXCHANGE, routingKey, messageBuffer);
    if (!published) {
      console.warn('[RabbitMQ] Daily analytics batch may not have been queued (backpressure)');
    }

    console.log(`[RabbitMQ] Published daily analytics batch for date ${payload?.date}`);
    return true;
  } catch (error) {
    console.error('[RabbitMQ] publishAnalyticsDaily error:', error.message);
    throw error;
  }
}

module.exports = {
  connectWithRetry,
  publishReservationEvent,
  publishAnalyticsDaily,
  getChannel,
  closeConnection
};

