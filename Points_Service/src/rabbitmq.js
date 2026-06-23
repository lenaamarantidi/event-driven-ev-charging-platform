/**
 * RabbitMQ consumer for Points_Service
 *
 * Listens for reservation_successful events so the Points Service
 * can update point status and reservation end time after a successful reservation.
 */

const amqp = require('amqplib');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE_NAME = process.env.POINTS_RESERVATION_EXCHANGE || 'reservation_exchange';
const QUEUE_NAME = `points_reservation_queue_${(process.env.SERVICE || 'points').toLowerCase()}`;
const POINTS_RPC_EXCHANGE = process.env.POINTS_RPC_EXCHANGE || 'points.rpc';
const POINTS_LOOKUP_ROUTING_KEY = 'points.lookup.request';
const POINTS_LOOKUP_QUEUE = `points_lookup_queue_${(process.env.SERVICE || 'points').toLowerCase()}`;

let connection = null;
let channel = null;
let pointsDb = null;
let scheduleReservationExpiryFn = null;
let notifyPointUpdateFn = null;

function setDependencies({ db, scheduleReservationExpiry, notifyPointUpdate }) {
  pointsDb = db;
  scheduleReservationExpiryFn = scheduleReservationExpiry;
  notifyPointUpdateFn = notifyPointUpdate;
}

async function connectRabbitMQ() {
  if (!pointsDb) {
    throw new Error('Points DB dependency not set before RabbitMQ connect');
  }

  connection = await amqp.connect(RABBITMQ_URL);
  channel = await connection.createChannel();

  await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
  await channel.assertQueue(QUEUE_NAME, { durable: true });
  await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, 'reservation_successful');

  await channel.assertExchange(POINTS_RPC_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(POINTS_LOOKUP_QUEUE, { durable: true });
  await channel.bindQueue(POINTS_LOOKUP_QUEUE, POINTS_RPC_EXCHANGE, POINTS_LOOKUP_ROUTING_KEY);
  await channel.prefetch(1);

  console.log(`✓ Points Service connected to RabbitMQ (${RABBITMQ_URL})`);
  console.log(`✓ Listening on queue: ${QUEUE_NAME} for reservation_successful events`);
  console.log(`✓ Listening on queue: ${POINTS_LOOKUP_QUEUE} for points lookup RPC requests`);

  await channel.consume(QUEUE_NAME, handleMessage, { noAck: false });
  await channel.consume(POINTS_LOOKUP_QUEUE, handleLookupMessage, { noAck: false });
}

async function handleMessage(msg) {
  if (!msg) {
    return;
  }

  try {
    const content = msg.content.toString('utf8');
    const event = JSON.parse(content);
    const data = event.data || {};

    const pointId = data.pointId || data.point_id || data.event_metadata?.point_id;
    const reservationEndTime = data.reservation_end_time || data.event_metadata?.reservation_end_time || null;
    const reservationStatus = data.reservation_status || data.event_metadata?.reservation_status || 'reserved';

    if (!pointId) {
      throw new Error('Missing pointId in reservation_successful event');
    }

    const [result] = await pointsDb.query(
      'UPDATE points SET status = ?, reservation_end_time = ?, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?',
      [reservationStatus, reservationEndTime, pointId]
    );

    if (result.affectedRows === 0) {
      console.warn(`Reservation event received for unknown point ${pointId}. No row updated.`);
    } else {
      console.log(`Updated point ${pointId} after reservation_successful event: status=${reservationStatus}, reservation_end_time=${reservationEndTime}`);
      if (reservationEndTime && typeof scheduleReservationExpiryFn === 'function') {
        scheduleReservationExpiryFn(pointId, reservationEndTime);
      }
      // Push SSE update to all connected frontend clients
      try {
        const [freshRows] = await pointsDb.query('SELECT * FROM points WHERE point_id = ?', [pointId]);
        if (freshRows.length > 0 && typeof notifyPointUpdateFn === 'function') {
          notifyPointUpdateFn(freshRows[0]);
        }
      } catch (_) {}
    }

    channel.ack(msg);
  } catch (err) {
    console.error('Error handling reservation_successful event:', err.message);
    if (channel) {
      channel.nack(msg, false, false);
    }
  }
}

async function handleLookupMessage(msg) {
  if (!msg) return;

  try {
    const content = JSON.parse(msg.content.toString('utf8'));
    const pointId = content?.pointId;
    if (!pointId) {
      throw new Error('Missing pointId in points lookup request');
    }

    const [rows] = await pointsDb.query('SELECT * FROM points WHERE point_id = ? LIMIT 1', [pointId]);
    const responsePayload = {
      found: rows.length > 0,
      point: rows.length > 0 ? rows[0] : null,
    };

    if (msg.properties.replyTo) {
      channel.sendToQueue(
        msg.properties.replyTo,
        Buffer.from(JSON.stringify(responsePayload)),
        {
          contentType: 'application/json',
          correlationId: msg.properties.correlationId,
          persistent: false,
        }
      );
    }

    channel.ack(msg);
  } catch (err) {
    console.error('Error handling points lookup RPC request:', err.message);
    if (channel) {
      channel.nack(msg, false, false);
    }
  }
}

async function publishReservationSuccessful(data) {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized');
  }

  const payload = {
    event_type: 'reservation_successful',
    timestamp: new Date().toISOString(),
    data,
  };

  channel.publish(
    EXCHANGE_NAME,
    'reservation_successful',
    Buffer.from(JSON.stringify(payload)),
    {
      contentType: 'application/json',
      persistent: true,
    }
  );
}

async function closeConnection() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('✓ Points Service RabbitMQ connection closed');
  } catch (err) {
    console.error('Error closing Points Service RabbitMQ connection:', err.message);
  }
}

module.exports = {
  setDependencies,
  connectRabbitMQ,
  closeConnection,
  publishReservationSuccessful
};
