/**
 * RabbitMQ-backed Message Broker
 *
 * Preserves the existing REST API used by other services while adding:
 * - Durable topic exchange for business events
 * - Critical-event retries with 5s/30s/120s backoff
 * - DLQ retention for 7 days (critical only)
 * - Event schema validation and canonical envelope
 */

const express = require('express');
const axios = require('axios');
const amqp = require('amqplib');
const Ajv = require('ajv');

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3003);
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';

const EXCHANGES = {
  events: 'business.events',
  dlx: 'business.events.dlx'
};

const RETRY_DELAYS_MS = [5000, 30000, 120000];
const MAX_RETRIES = RETRY_DELAYS_MS.length;
const DLQ_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 1000;

// Sliding event window for quick diagnostics endpoint.
const eventStore = [];

const EVENT_CATALOG = {
  'provider.points.updated': {
    critical: true,
    orderingFields: ['providerPointId', 'internalPointId'],
    publisherServices: ['redPlug-service', 'greenPlug-service', 'bluePlug-service'],
    consumers: ['aggregate-points-service']
  },
  'charger.status.changed': {
    critical: true,
    orderingFields: ['providerPointId', 'internalPointId'],
    publisherServices: ['redPlug-service', 'greenPlug-service', 'bluePlug-service'],
    consumers: ['aggregate-points-service', 'analytics-service']
  },
  'reservation.created': {
    critical: true,
    orderingFields: ['providerPointId', 'internalPointId'],
    publisherServices: ['reservation-service'],
    consumers: ['aggregate-points-service', 'billing-service', 'analytics-service', 'logs-export-service']
  },
  'reservation.failed': {
    critical: false,
    orderingFields: ['providerPointId', 'internalPointId'],
    publisherServices: ['reservation-service'],
    consumers: ['aggregate-points-service', 'billing-service', 'analytics-service', 'logs-export-service']
  },
  'invoice.generated': {
    critical: true,
    orderingFields: ['invoiceId'],
    publisherServices: ['billing-service'],
    consumers: ['payment-service', 'analytics-service', 'provider-management-service']
  },
  'payment.processed': {
    critical: true,
    orderingFields: ['invoiceId'],
    publisherServices: ['payment-service'],
    consumers: ['billing-service', 'analytics-service', 'provider-management-service']
  },
  'user.search.performed': {
    critical: false,
    orderingFields: ['userId'],
    publisherServices: ['map-service', 'points-service'],
    consumers: ['analytics-service']
  },
  'point.clicked': {
    critical: false,
    orderingFields: ['userId', 'internalPointId'],
    publisherServices: ['points-service'],
    consumers: ['analytics-service']
  }
};

const legacyEventTypeMap = {};

const MESSAGE_SCHEMAS = {
  'provider.points.updated': {
    type: 'object',
    required: ['providerName', 'providerPointId', 'lat', 'lon', 'status', 'kwhprice'],
    properties: {
      providerName: { type: 'string', minLength: 1 },
      providerPointId: { type: ['string', 'number'] },
      internalPointId: { type: ['string', 'number'] },
      lat: { type: 'number' },
      lon: { type: 'number' },
      status: { type: 'string' },
      cap: { type: ['number', 'null'] },
      kwhprice: { type: 'number' },
      lastUpdated: { type: 'string' }
    },
    additionalProperties: true
  },
  'charger.status.changed': {
    type: 'object',
    required: ['providerName', 'providerPointId', 'status'],
    properties: {
      providerName: { type: 'string', minLength: 1 },
      providerPointId: { type: ['string', 'number'] },
      internalPointId: { type: ['string', 'number'] },
      status: { type: 'string' },
      previousStatus: { type: 'string' },
      lastUpdated: { type: 'string' }
    },
    additionalProperties: true
  },
  'reservation.created': {
    type: 'object',
    required: ['reservationId', 'userId', 'providerName', 'providerPointId', 'status'],
    properties: {
      reservationId: { type: ['string', 'number'] },
      userId: { type: ['string', 'number'] },
      providerName: { type: 'string', minLength: 1 },
      providerPointId: { type: ['string', 'number'] },
      internalPointId: { type: ['string', 'number'] },
      durationInMinutes: { type: 'number' },
      status: { type: 'string' },
      reservationEndTime: { type: 'string' }
    },
    additionalProperties: true
  },
  'reservation.failed': {
    type: 'object',
    required: ['providerName', 'providerPointId'],
    properties: {
      providerName: { type: 'string', minLength: 1 },
      providerPointId: { type: ['string', 'number'] },
      internalPointId: { type: ['string', 'number'] },
      reason: { type: 'string' },
      errorCode: { type: 'string' }
    },
    additionalProperties: true
  },
  'invoice.generated': {
    type: 'object',
    required: ['invoiceId', 'providerId', 'amount', 'currency', 'status'],
    properties: {
      invoiceId: { type: ['string', 'number'] },
      providerId: { type: ['string', 'number'] },
      amount: { type: 'number' },
      currency: { type: 'string' },
      status: { type: 'string' },
      userId: { type: ['string', 'number'] }
    },
    additionalProperties: true
  },
  'payment.processed': {
    type: 'object',
    required: ['paymentId', 'invoiceId', 'amount', 'currency', 'status'],
    properties: {
      paymentId: { type: ['string', 'number'] },
      invoiceId: { type: ['string', 'number'] },
      providerId: { type: ['string', 'number'] },
      amount: { type: 'number' },
      currency: { type: 'string' },
      status: { type: 'string' },
      transactionReference: { type: 'string' }
    },
    additionalProperties: true
  },
  'user.search.performed': {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: ['string', 'number'] },
      queryText: { type: 'string' },
      filters: { type: 'object' }
    },
    additionalProperties: true
  },
  'point.clicked': {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: { type: ['string', 'number'] },
      internalPointId: { type: ['string', 'number'] },
      providerPointId: { type: ['string', 'number'] }
    },
    additionalProperties: true
  }
};

const SLA_TARGETS_MS = {
  'reservation.created': 2000,
  'charger.status.changed': 2000,
  'payment.processed': 5000,
  'invoice.generated': 10000,
  'provider.points.updated': 60000
};

const canonicalValidators = new Map();
const ajv = new Ajv({ allErrors: true, strict: false });
for (const [eventType, schema] of Object.entries(MESSAGE_SCHEMAS)) {
  canonicalValidators.set(eventType, ajv.compile(schema));
}

const subscriptions = new Map();
let rabbitConnection;
let rabbitChannel;

function formatError(error) {
  if (!error) {
    return 'Unknown error';
  }

  if (error.stack) {
    return error.stack;
  }

  if (error.message) {
    return error.message;
  }

  return String(error);
}

function normalizeEventType(eventType) {
  return legacyEventTypeMap[eventType] || eventType;
}

function randomId(prefix = 'evt') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pickFirstDefined(data, fields) {
  for (const field of fields) {
    if (data && data[field] !== undefined && data[field] !== null) {
      return String(data[field]);
    }
  }
  return null;
}

function inferOrderingKey(eventType, data) {
  const catalog = EVENT_CATALOG[eventType];
  if (!catalog) return null;
  return pickFirstDefined(data, catalog.orderingFields);
}

function buildCanonicalEvent(inputEventType, data, sourceService, correlationId) {
  const eventType = normalizeEventType(inputEventType);
  const catalog = EVENT_CATALOG[eventType];
  const critical = catalog ? catalog.critical : false;
  const timestamp = new Date().toISOString();

  return {
    eventId: randomId('evt'),
    eventType,
    timestamp,
    sourceService: sourceService || 'unknown-service',
    correlationId: correlationId || randomId('corr'),
    orderingKey: inferOrderingKey(eventType, data),
    schemaVersion: '1.0.0',
    critical,
    payload: data
  };
}

function validateCanonicalEvent(event) {
  const validator = canonicalValidators.get(event.eventType);
  if (!validator) {
    return {
      valid: true,
      errors: []
    };
  }

  const valid = validator(event.payload);
  return {
    valid,
    errors: valid ? [] : (validator.errors || []).map(err => `${err.instancePath || 'payload'} ${err.message}`)
  };
}

function pushToEventStore(event) {
  eventStore.push(event);
  if (eventStore.length > MAX_EVENTS) {
    eventStore.shift();
  }
}

function queueNameFor(serviceId, eventType) {
  return `svc.${serviceId}.${eventType}`;
}

function dlqNameFor(serviceId, eventType) {
  return `svc.${serviceId}.${eventType}.dlq`;
}

async function ensureRabbitConnection() {
  if (rabbitChannel) {
    return;
  }

  rabbitConnection = await amqp.connect(RABBITMQ_URL);
  rabbitConnection.on('error', (err) => {
    console.error('RabbitMQ connection error:', formatError(err));
  });

  rabbitConnection.on('close', () => {
    console.error('RabbitMQ connection closed');
    rabbitConnection = null;
    rabbitChannel = null;
  });

  rabbitChannel = await rabbitConnection.createChannel();
  await rabbitChannel.assertExchange(EXCHANGES.events, 'topic', { durable: true });
  await rabbitChannel.assertExchange(EXCHANGES.dlx, 'topic', { durable: true });

  console.log('✓ RabbitMQ exchanges initialized');
}

async function publishCanonicalEvent(event) {
  await ensureRabbitConnection();

  const messageBuffer = Buffer.from(JSON.stringify(event));
  const routingKey = event.eventType;

  rabbitChannel.publish(EXCHANGES.events, routingKey, messageBuffer, {
    persistent: !!event.critical,
    contentType: 'application/json',
    messageId: event.eventId,
    timestamp: Date.parse(event.timestamp),
    type: event.eventType,
    headers: {
      correlationId: event.correlationId,
      orderingKey: event.orderingKey,
      schemaVersion: event.schemaVersion,
      critical: event.critical
    }
  });

  pushToEventStore(event);
  return event;
}

async function ensureSubscriptionTopology(serviceId, eventType, critical) {
  await ensureRabbitConnection();

  const queueName = queueNameFor(serviceId, eventType);
  const dlqName = dlqNameFor(serviceId, eventType);
  const dlqRoutingKey = `${serviceId}.${eventType}.failed`;

  const args = {};
  if (critical) {
    args['x-dead-letter-exchange'] = EXCHANGES.dlx;
    args['x-dead-letter-routing-key'] = dlqRoutingKey;
  }

  await rabbitChannel.assertQueue(queueName, {
    durable: critical,
    arguments: args
  });
  await rabbitChannel.bindQueue(queueName, EXCHANGES.events, eventType);

  if (critical) {
    await rabbitChannel.assertQueue(dlqName, {
      durable: true,
      arguments: {
        'x-message-ttl': DLQ_RETENTION_MS
      }
    });
    await rabbitChannel.bindQueue(dlqName, EXCHANGES.dlx, dlqRoutingKey);
  }

  return { queueName, dlqName: critical ? dlqName : null };
}

async function scheduleRetry(sub, message, event, attempt) {
  const delay = RETRY_DELAYS_MS[attempt - 1];

  setTimeout(async () => {
    try {
      await axios.post(
        sub.webhookUrl,
        {
          eventType: event.eventType,
          data: event.payload,
          envelope: event
        },
        { timeout: 5000 }
      );

      rabbitChannel.ack(message);
      console.log(`✓ Retry delivered for ${sub.serviceId} on ${event.eventType} (attempt ${attempt})`);
    } catch (retryErr) {
      if (attempt < MAX_RETRIES) {
        await scheduleRetry(sub, message, event, attempt + 1);
        return;
      }

      rabbitChannel.nack(message, false, false);
      console.error(`✗ Sent to DLQ for ${sub.serviceId} on ${event.eventType}:`, retryErr.message);
    }
  }, delay);
}

async function startWebhookConsumer(subscription) {
  const { serviceId, eventType, queueName } = subscription;
  const isCritical = EVENT_CATALOG[eventType] ? EVENT_CATALOG[eventType].critical : false;

  await ensureRabbitConnection();
  await rabbitChannel.prefetch(1);

  await rabbitChannel.consume(queueName, async (message) => {
    if (!message) {
      return;
    }

    let event;
    try {
      event = JSON.parse(message.content.toString('utf8'));
    } catch (parseErr) {
      console.error(`✗ Invalid message payload for ${serviceId}/${eventType}:`, parseErr.message);
      rabbitChannel.ack(message);
      return;
    }

    try {
      await axios.post(
        subscription.webhookUrl,
        {
          eventType: event.eventType,
          data: event.payload,
          envelope: event
        },
        { timeout: 5000 }
      );

      rabbitChannel.ack(message);
      console.log(`✓ Webhook delivered: ${serviceId} <- ${event.eventType}`);
    } catch (err) {
      console.error(`✗ Webhook failed: ${serviceId} <- ${event.eventType}:`, err.message);

      if (!isCritical) {
        rabbitChannel.ack(message);
        return;
      }

      await scheduleRetry(subscription, message, event, 1);
    }
  }, { noAck: false });
}

async function registerWebhookSubscription(eventTypeInput, serviceId, webhookUrl) {
  const eventType = normalizeEventType(eventTypeInput);
  const catalog = EVENT_CATALOG[eventType];

  if (!catalog) {
    throw new Error(`Unsupported eventType: ${eventType}`);
  }

  const key = `${serviceId}:${eventType}`;
  if (subscriptions.has(key)) {
    return subscriptions.get(key);
  }

  const { queueName, dlqName } = await ensureSubscriptionTopology(serviceId, eventType, catalog.critical);
  const subscription = {
    key,
    serviceId,
    eventType,
    queueName,
    dlqName,
    webhookUrl,
    critical: catalog.critical,
    retries: catalog.critical ? MAX_RETRIES : 0
  };

  subscriptions.set(key, subscription);
  await startWebhookConsumer(subscription);

  console.log(`✓ Subscription ready: ${serviceId} -> ${eventType} (critical=${catalog.critical})`);
  return subscription;
}

async function removeWebhookSubscription(eventTypeInput, serviceId) {
  const eventType = normalizeEventType(eventTypeInput);
  const key = `${serviceId}:${eventType}`;
  const existing = subscriptions.get(key);

  if (!existing) {
    return false;
  }

  await ensureRabbitConnection();
  try {
    await rabbitChannel.unbindQueue(existing.queueName, EXCHANGES.events, eventType);
  } catch (err) {
    console.error('Unbind warning:', err.message);
  }

  subscriptions.delete(key);
  return true;
}

function getEventHistory(eventType, limit = 100) {
  const normalized = eventType ? normalizeEventType(eventType) : null;
  const filtered = normalized
    ? eventStore.filter(event => event.eventType === normalized)
    : eventStore;

  return filtered.slice(-limit);
}

function buildStats() {
  const eventsByType = {};

  for (const event of eventStore) {
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
  }

  const subscribersByType = {};
  for (const sub of subscriptions.values()) {
    subscribersByType[sub.eventType] = (subscribersByType[sub.eventType] || 0) + 1;
  }

  return {
    totalEvents: eventStore.length,
    eventsByType,
    subscribers: subscribersByType,
    activeSubscriptions: subscriptions.size
  };
}

// ====== REST API Endpoints ======

app.post('/api/events/publish', async (req, res) => {
  try {
    const { eventType, data, sourceService, correlationId } = req.body;

    if (!eventType || data === undefined) {
      return res.status(400).json({ error: 'eventType and data required' });
    }

    const canonicalEvent = buildCanonicalEvent(eventType, data, sourceService || data?.source, correlationId);
    const validation = validateCanonicalEvent(canonicalEvent);

    if (!validation.valid) {
      return res.status(400).json({
        error: 'Event payload validation failed',
        eventType: canonicalEvent.eventType,
        details: validation.errors
      });
    }

    await publishCanonicalEvent(canonicalEvent);

    res.status(201).json({
      eventId: canonicalEvent.eventId,
      eventType: canonicalEvent.eventType,
      timestamp: canonicalEvent.timestamp,
      critical: canonicalEvent.critical,
      orderingKey: canonicalEvent.orderingKey,
      slaTargetMs: SLA_TARGETS_MS[canonicalEvent.eventType] || null
    });
  } catch (error) {
    console.error('Error publishing event:', error.message);
    res.status(500).json({ error: 'Failed to publish event', details: error.message });
  }
});

app.post('/api/webhooks/subscribe', async (req, res) => {
  try {
    const { eventType, serviceId, webhookUrl } = req.body;

    if (!eventType || !serviceId || !webhookUrl) {
      return res.status(400).json({
        error: 'eventType, serviceId, and webhookUrl required'
      });
    }

    const sub = await registerWebhookSubscription(eventType, serviceId, webhookUrl);
    res.status(201).json({
      subscribedTo: sub.eventType,
      serviceId: sub.serviceId,
      webhookUrl: sub.webhookUrl,
      queueName: sub.queueName,
      dlqName: sub.dlqName,
      critical: sub.critical,
      retries: sub.retries
    });
  } catch (error) {
    console.error('Error registering webhook:', error.message);
    res.status(500).json({ error: 'Failed to register webhook', details: error.message });
  }
});

app.post('/api/webhooks/unsubscribe', async (req, res) => {
  try {
    const { eventType, serviceId } = req.body;

    if (!eventType || !serviceId) {
      return res.status(400).json({ error: 'eventType and serviceId required' });
    }

    const removed = await removeWebhookSubscription(eventType, serviceId);
    if (!removed) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({ message: 'Unsubscribed successfully' });
  } catch (error) {
    console.error('Error unsubscribing:', error.message);
    res.status(500).json({ error: 'Failed to unsubscribe', details: error.message });
  }
});

app.get('/api/events/history', (req, res) => {
  try {
    const { eventType, limit = 100 } = req.query;
    const parsedLimit = Number.parseInt(limit, 10);
    const history = getEventHistory(eventType, Number.isNaN(parsedLimit) ? 100 : parsedLimit);

    res.json({
      count: history.length,
      events: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrieving history:', error.message);
    res.status(500).json({ error: 'Failed to retrieve history', details: error.message });
  }
});

app.get('/api/events/stats', (req, res) => {
  try {
    res.json({
      ...buildStats(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error retrieving stats:', error.message);
    res.status(500).json({ error: 'Failed to retrieve stats', details: error.message });
  }
});

app.get('/api/events/catalog', (req, res) => {
  res.json({
    exchanges: EXCHANGES,
    retryPolicy: {
      maxRetries: MAX_RETRIES,
      retryDelaysMs: RETRY_DELAYS_MS,
      dlqRetentionMs: DLQ_RETENTION_MS
    },
    slaTargetsMs: SLA_TARGETS_MS,
    events: EVENT_CATALOG
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: rabbitChannel ? 'ok' : 'degraded',
    service: 'message-broker',
    port: PORT,
    rabbitmqUrl: RABBITMQ_URL,
    eventCount: eventStore.length,
    subscriberCount: subscriptions.size,
    exchanges: EXCHANGES
  });
});

async function start() {
  try {
    await ensureRabbitConnection();

    app.listen(PORT, () => {
      console.log(`✓ Message Broker running on port ${PORT}`);
      console.log(`✓ RabbitMQ connected: ${RABBITMQ_URL}`);
    });
  } catch (error) {
    console.error('Failed to initialize message broker:', formatError(error));
    process.exit(1);
  }
}

start();

module.exports = {
  app,
  EVENT_CATALOG,
  MESSAGE_SCHEMAS
};
