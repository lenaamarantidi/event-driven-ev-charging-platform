/**
 * Points Service
 * 
 * Κεντρικό repository για όλα τα σημεία φόρτισης (redPlug, greenPlug, bluePlug)
 * Διαχειρίζεται:
 * - Αποθήκευση σημείων από 3 πηγές
 * - Κατάσταση κάθε σημείου (available, reserved, offline)
 * - Query endpoints για τον Map Service
 * - Event publishing για ενημερώσεις
 */

const express = require('express');
const mysql = require('mysql2/promise');
const amqp = require('amqplib');

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { connectRabbitMQ, closeConnection: closeRabbitMQ, setDependencies, publishReservationSuccessful } = require('./rabbitmq');

const app = express();
app.use(express.json());

const ADAPTER_SYNC_REQUEST_EXCHANGE = process.env.ADAPTER_SYNC_REQUEST_EXCHANGE || 'adapter.sync.requests';
const ADAPTER_SYNC_TIMEOUT_MS = Number(process.env.ADAPTER_SYNC_TIMEOUT_MS || 15000);
const ADAPTER_SYNC_TRANSPORT = (process.env.ADAPTER_SYNC_TRANSPORT || 'broker').toLowerCase();

function getAdapterUrl(plugKey) {
  if (plugKey === 'redPlug') return process.env.REDPLUG_ADAPTER_URL;
  if (plugKey === 'greenPlug') return process.env.GREENPLUG_ADAPTER_URL;
  if (plugKey === 'bluePlug') return process.env.BLUEPLUG_ADAPTER_URL;
  return null;
}

async function fetchPointsFromAdapterHttp(plugKey) {
  const adapterUrl = getAdapterUrl(plugKey);
  if (!adapterUrl) {
    throw new Error(`Missing adapter URL for ${plugKey}`);
  }

  const response = await axios.get(`${adapterUrl.replace(/\/$/, '')}/api/points`, { timeout: ADAPTER_SYNC_TIMEOUT_MS });
  const points = Array.isArray(response.data)
    ? response.data
    : Array.isArray(response.data?.points)
      ? response.data.points
      : [];

  return points;
}

async function fetchPointsFromAdapterBroker(plugKey) {
  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
  const connection = await amqp.connect(rabbitUrl);
  const channel = await connection.createChannel();
  const correlationId = `${plugKey}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    await channel.assertExchange(ADAPTER_SYNC_REQUEST_EXCHANGE, 'topic', { durable: true });
    const reply = await channel.assertQueue('', { exclusive: true, autoDelete: true });

    const responsePromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting adapter sync response for ${plugKey}`));
      }, ADAPTER_SYNC_TIMEOUT_MS);

      channel.consume(
        reply.queue,
        (msg) => {
          if (!msg) return;
          if (msg.properties.correlationId !== correlationId) return;

          clearTimeout(timer);
          try {
            const parsed = JSON.parse(msg.content.toString('utf8'));
            const points = Array.isArray(parsed?.points) ? parsed.points : [];
            resolve(points);
          } catch (err) {
            reject(err);
          }
        },
        { noAck: true }
      ).catch(reject);
    });

    const routingKey = `adapter.${plugKey}.fetch_points`;
    channel.publish(
      ADAPTER_SYNC_REQUEST_EXCHANGE,
      routingKey,
      Buffer.from(JSON.stringify({ provider: plugKey, requestedAt: new Date().toISOString() })),
      {
        contentType: 'application/json',
        correlationId,
        replyTo: reply.queue,
        messageId: correlationId,
        persistent: false,
      }
    );

    return await responsePromise;
  } finally {
    await channel.close();
    await connection.close();
  }
}

async function fetchPointsFromAdapter(plugKey) {
  if (ADAPTER_SYNC_TRANSPORT === 'broker') {
    try {
      return await fetchPointsFromAdapterBroker(plugKey);
    } catch (err) {
      console.warn(`[repopulate:${plugKey}] Broker sync failed, falling back to HTTP: ${err.message}`);
    }
  }

  return fetchPointsFromAdapterHttp(plugKey);
}

function normalizeAdapterPoint(point, plugKey) {
  return {
    id: point.pointId ?? point.id ?? point.uid ?? point.chargerId ?? point.pointid,
    provider_name: point.providerName ?? point.provider_name ?? plugKey,
    lat: point.lat ?? point.geo?.[0] ?? point.coords?.lat,
    lon: point.lon ?? point.lng ?? point.geo?.[1] ?? point.coords?.long,
    capacity: point.capacityKw ?? point.capacity_kw ?? point.cap ?? point.capacity,
    price: point.kwhPrice ?? point.kwh_price ?? point.pricePerKwh ?? point.kwhRateEur ?? point.price,
    status: point.status ?? point.state ?? point.currentStatus,
    location_name: point.locationName ?? point.location_name,
    connector: point.connector ?? point.connectorType,
    address: point.address,
    reservation_end_time: point.reservationEndTime ?? point.reservation_end_time ?? point.reservationEnd ?? point.reservedUntil,
  };
}

// ============== DATABASE CONFIGURATION ==============
const dbName = process.env.MARIADB_DB || 'central';
const pointsMysql = mysql.createPool({
  host: process.env.MARIADB_HOST || 'unknown-host',
  port: process.env.MARIADB_PORT ? Number(process.env.MARIADB_PORT) : 3306,
  user: process.env.MARIADB_USER || 'root',
  password: process.env.MARIADB_PASSWORD || 'root',
  database: dbName,
  connectTimeout: process.env.MARIADB_CONNECT_TIMEOUT ? Number(process.env.MARIADB_CONNECT_TIMEOUT) : 5000,
  ssl: process.env.MARIADB_SSL ? JSON.parse(process.env.MARIADB_SSL) : false,
  waitForConnections: true,
  connectionLimit: 20,
  queueLimit: 0,
});


// ============== DATABASE INITIALIZATION ==============

async function initializeDatabase() {
  try {
    const maxAttempts = Number(process.env.MARIADB_DB_WAIT_ATTEMPTS || 10);
    const attemptDelayMs = Number(process.env.MARIADB_DB_WAIT_DELAY_MS || 1000);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await pointsMysql.query('SELECT 1');
        console.log(`✓ MariaDB connection ok (using database: ${dbName})`);
        lastErr = null;
        break;
      } catch (useErr) {
        lastErr = useErr;
        console.warn(`⚠️ Database ${dbName} not ready yet (attempt ${attempt}/${maxAttempts})`, useErr.message);
        await new Promise(r => setTimeout(r, attemptDelayMs));
      }
    }

    if (lastErr) {
      throw lastErr;
    }
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
    throw err;
  }
}

initializeDatabase();

// ============== PROVIDER MAPPING ==============

const { PROVIDER_MAP } = require('./plugs_api');
const { buildProviderUrl } = require('./plugs_api');
const { normalizePoint } = require('./plugs_api');

// ============== HELPER FUNCTIONS ==============
const { getAccessibleIps, getProviderNames } = require('./util');

const reservationTimers = new Map();
const RESERVATION_TIMEZONE = process.env.RESERVATION_TIMEZONE || 'Europe/Athens';

// ============== SSE CLIENTS ==============
const sseClients = new Set();

function notifyPointUpdate(point) {
  if (sseClients.size === 0) return;
  const data = `data: ${JSON.stringify(point)}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

function getTimeZoneOffsetMs(timeZone, date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});

  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return localAsUtc - date.getTime();
}

function parseReservationEndTime(reservationEndTime) {
  if (reservationEndTime instanceof Date) {
    return reservationEndTime.getTime();
  }

  if (typeof reservationEndTime !== 'string') {
    const timestamp = new Date(reservationEndTime).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  const trimmed = reservationEndTime.trim();

  if (/Z$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const timestamp = new Date(trimmed).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) {
    const timestamp = new Date(trimmed).getTime();
    return Number.isNaN(timestamp) ? null : timestamp;
  }

  const [, year, month, day, hour, minute, second = '0'] = match;
  const localAsUtc = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );

  const firstOffset = getTimeZoneOffsetMs(RESERVATION_TIMEZONE, new Date(localAsUtc));
  const firstUtc = localAsUtc - firstOffset;
  const finalOffset = getTimeZoneOffsetMs(RESERVATION_TIMEZONE, new Date(firstUtc));
  return localAsUtc - finalOffset;
}

function scheduleReservationExpiry(pointId, reservationEndTime) {
  try {
    // Calculate remaining time in milliseconds
    const endTime = parseReservationEndTime(reservationEndTime);
    if (!endTime) {
      throw new Error(`Invalid reservation end time: ${reservationEndTime}`);
    }
    const now = new Date().getTime();
    const remainingMs = endTime - now;

    // Clear any existing timer for this point
    if (reservationTimers.has(pointId)) {
      clearTimeout(reservationTimers.get(pointId));
    }

    // Set timer to update status when reservation expires. If the expiry is
    // already in the past, run the expiry check immediately.
    if (Number.isFinite(remainingMs)) {
      const expiryDelayMs = Math.max(0, remainingMs + 60000);
      const timerId = setTimeout(async () => {
        try {
          console.log(`⏰ Reservation expired for point ${pointId}, updating status to available`);

          // Query DB first so central service can infer the provider for this point.
          const [dbRows] = await pointsMysql.query(
            'SELECT * FROM points WHERE point_id = ?',
            [pointId]
          );

          if (dbRows.length === 0) {
            throw new Error(`Point ${pointId} not found in database`);
          }

          if (dbRows.length > 1) {
            throw new Error(`Duplicate points found in database for point_id ${pointId}: ${dbRows.length} rows`);
          }

          const dbPoint = dbRows[0];

          // first get new point status from provider api
          // Get point details from provider API
          const service = process.env.SERVICE;
          const s = String(service).toLowerCase();
          const providerName = String(dbPoint.provider_name || '').toLowerCase();
          
          let plugKey;
          if (s.includes('green')) plugKey = 'greenPlug';
          else if (s.includes('red')) plugKey = 'redPlug';
          else if (s.includes('blue')) plugKey = 'bluePlug';
          else if (providerName.includes('green')) plugKey = 'greenPlug';
          else if (providerName.includes('red')) plugKey = 'redPlug';
          else if (providerName.includes('blue')) plugKey = 'bluePlug';
          else throw new Error(`Unknown service/provider for point ${pointId}`);

          let currentStatus = 'available'; // Default fallback for expired reservations

          try {
            const config = PROVIDER_MAP[plugKey];
            const url = buildProviderUrl(plugKey, "detailPath", pointId);

            const bearerToken = process.env.BEARER_TOKEN;
            const headers = { Accept: 'application/json' };
            if (bearerToken) {
              headers.Authorization = `Bearer ${bearerToken}`;
            }

            const providerResp = await axios.get(url, {
              timeout: 10000,
              headers
            });

            const pointData = providerResp.data || {};
            const normalized = normalizePoint(pointData, plugKey);
            currentStatus = normalized.status;

            console.log(`📊 Point ${pointId} current status from provider: ${currentStatus}`);
          } catch (providerErr) {
            console.log(`⚠️ Could not fetch provider status for point ${pointId}: ${providerErr.message}. Using fallback status: available`);
          }

          console.log(`📋 Point ${pointId} current status in DB: ${dbPoint.status}`);
          console.log(`📋 Point ${pointId} DB details:`, {
            status: dbPoint.status,
            reservationEndTime: dbPoint.reservation_end_time,
            lastUpdated: dbPoint.last_updated
          });

          reservationTimers.delete(pointId);
          
          // Update DB to new status and clear reservation end time
          console.log(`Updating point ${pointId} from ${dbPoint.status} to ${currentStatus}`);
          try {
            const updateResult = await pointsMysql.query(
              'UPDATE points SET status = ?, reservation_end_time = NULL, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?',
              [String(currentStatus), pointId]
            );
            console.log(`✓ Successfully updated point ${pointId} to status: ${currentStatus}`);

            // Fetch fresh row and notify
            try {
              const [freshRows] = await pointsMysql.query('SELECT * FROM points WHERE point_id = ?', [pointId]);
              if (freshRows.length > 0) {
                console.log(`✓ Fetched fresh row for point ${pointId}, notifying SSE clients`);
                notifyPointUpdate(freshRows[0]);
              }
            } catch (fetchErr) {
              console.error(`❌ Error fetching fresh row for point ${pointId}:`, fetchErr.message);
            }
          } catch (updateErr) {
            console.error(`❌ Error updating point ${pointId}:`, updateErr.message);
            throw updateErr;
          }

          // Also update other services based on current service
          const serviceEnv = process.env.SERVICE;
          if (serviceEnv) {
            const sEnv = String(serviceEnv).toLowerCase();
            const portMap = {
              red: process.env.POINTS_RED_PORT,
              green: process.env.POINTS_GREEN_PORT,
              blue: process.env.POINTS_BLUE_PORT
            };
            
            // Determine current plug
            let currentPlug = null;
            if (sEnv.includes('red')) currentPlug = 'red';
            else if (sEnv.includes('green')) currentPlug = 'green';
            else if (sEnv.includes('blue')) currentPlug = 'blue';
            
            // If current service is red/green/blue, also update central DB
            if (currentPlug) {
              try {
                const centralPort = process.env.POINTS_CENTRAL_PORT;
                if (centralPort) {
                  const protocol = 'http';
                  const serviceHost = 'host.docker.internal';
                  const centralUrl = `${protocol}://${serviceHost}:${centralPort}${DB_POINT_UPDATE.replace(':pointId', pointId)}`;
                  console.log(`[scheduleReservationExpiry] Also updating central DB at ${centralUrl}`);
                  await axios.put(centralUrl, { status: currentStatus });
                }
              } catch (err) {
                console.error(`[scheduleReservationExpiry] Failed to update central DB:`, err.message);
              }
            }
            // If current service is central, find which plug the point belongs to and update that service
            else if (sEnv.includes('central')) {
              const pointProvider = dbPoint?.provider_name || '';
              let targetPlug = null;
              if (pointProvider.includes('red')) targetPlug = 'red';
              else if (pointProvider.includes('green')) targetPlug = 'green';
              else if (pointProvider.includes('blue')) targetPlug = 'blue';
              
              if (targetPlug) {
                const targetPort = portMap[targetPlug];
                if (targetPort) {
                  try {
                    const protocol = 'http';
                    const serviceHost = 'host.docker.internal';
                    const targetUrl = `${protocol}://${serviceHost}:${targetPort}${DB_POINT_UPDATE.replace(':pointId', pointId)}`;
                    console.log(`[scheduleReservationExpiry] Central service updating ${targetPlug} DB at ${targetUrl}`);
                    await axios.put(targetUrl, { status: currentStatus });
                  } catch (err) {
                    console.error(`[scheduleReservationExpiry] Failed to update ${targetPlug} DB:`, err.message);
                  }
                }
              }
            }
          }

        } catch (err) {
          console.error(`Error updating expired reservation for ${pointId}:`, err.message);
        }
      }, expiryDelayMs); // add 1 minute because reservation end time does not take into account remaining seconds in the last minute, so we add a buffer to ensure the reservation has actually expired in the provider system before we update our DB.

      reservationTimers.set(pointId, timerId);
      console.log(`⏱️ Timer scheduled for point ${pointId}, expires in ${Math.floor(remainingMs / 1000)} seconds (${RESERVATION_TIMEZONE})`);
    }

    return remainingMs;
  } catch (err) {
    console.error(`Error scheduling reservation expiry for ${pointId}:`, err.message);
    return 0;
  }
}

// ============== REST ENDPOINTS CONST URLS ==============

const API_POINTS = '/api/points';
const API_POINTS_BY_ID = '/api/points/:pointId';
const API_POINTS_RESERVE = '/api/points/:pointId/reserve';
const API_POINTS_RESERVE_MINUTES = '/api/points/:pointId/reserve/:minutes';

const PLUGAPI_POINTS = '/plugApi/points';
const PLUGAPI_POINT = '/plugApi/points/:pointId';

const DB_REPOPULATE = '/db/repopulate';
const DB_POINT_UPDATE = '/db/points/:pointId'
const HEALTH = '/health';

// ============== REST ENDPOINTS ==============

// ---- plugApi ----

/**
 * GET /plugApi/points
 * Debug endpoint: returns this service plug, listPath url template and logs the JSON
 */
app.get(PLUGAPI_POINTS, async (req, res) => {
  try {
    const service = process.env.SERVICE;

    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue) so this endpoint can compute the provider URL. Examples: redPlug, greenPlug, bluePlug"
      );
    }

    const s = String(service).toLowerCase();

    let plugKey;
    if (s.includes('green')) plugKey = 'greenPlug';
    else if (s.includes('red')) plugKey = 'redPlug';
    else if (s.includes('blue')) plugKey = 'bluePlug';
    else if (s.includes('central')) {
      throw new Error(
        `process.env.SERVICE='${service}' looks like a central service. Please set process.env.SERVICE to a specific plug: redPlug | greenPlug | bluePlug`
      );
    } else {
      throw new Error(
        `Invalid process.env.SERVICE='${service}'. Expected a plug identifier containing one of: red, green, blue (e.g. redPlug | greenPlug | bluePlug)`
      );
    }

    const url = buildProviderUrl(plugKey, 'listPath', '');

    const bearerToken = process.env.BEARER_TOKEN;

    const requestHeaders = { Accept: 'application/json' };
    if (bearerToken) {
      requestHeaders.Authorization = `Bearer ${bearerToken}`;
    }

    const providerResp = await axios.get(url, {
      timeout: 10000,
      headers: requestHeaders,
    });

    const payload = {
      service,
      plugKey,
      url,
      data: providerResp.data,
    };

    console.log('[/db/points] provider json:', payload);
    return res.json(payload);

  } catch (err) {
    console.error('Error in /db/points:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get(PLUGAPI_POINT, async (req, res) => {
  try {
    const { pointId } = req.params;
    const service = process.env.SERVICE;

    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue)"
      );
    }

    const s = String(service).toLowerCase();

    let plugKey;
    if (s.includes('green')) plugKey = 'greenPlug';
    else if (s.includes('red')) plugKey = 'redPlug';
    else if (s.includes('blue')) plugKey = 'bluePlug';
    else {
      throw new Error(`Invalid SERVICE: ${service}`);
    }

    const config = PROVIDER_MAP[plugKey];
    if (!config) throw new Error(`Unknown provider: ${plugKey}`);

    const url = buildProviderUrl(plugKey, "detailPath", pointId);

    const bearerToken = process.env.BEARER_TOKEN;
    const requestHeaders = { Accept: 'application/json' };
    if (bearerToken) {
      requestHeaders.Authorization = `Bearer ${bearerToken}`;
    }

    console.log(`📡 Fetching point ${pointId} from ${plugKey}: ${url}`);
    const providerResp = await axios.get(url, {
      timeout: 10000,
      headers: requestHeaders,
    });

    const payload = {
      service,
      plugKey,
      pointId,
      url,
      data: providerResp.data,
    };

    console.log('[/plugApi/points/:pointId] provider json:', payload);
    return res.json(payload);

  } catch (err) {
    console.error('Error in /plugApi/points/:pointId:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- db ----

/**
 * Helper function to repopulate points from a specific service
 * @param {string} service - The service name (e.g., 'redPlug', 'greenPlug', 'bluePlug')
 * @param {Array} filterIds - Optional array of point IDs to filter
 * @returns {Promise<Object>} - Result payload with service info and counts
 */
async function repopulate(service, filterIds = null) {
  const s = String(service).toLowerCase();

  let plugKey;
  if (s.includes('green')) plugKey = 'greenPlug';
  else if (s.includes('red')) plugKey = 'redPlug';
  else if (s.includes('blue')) plugKey = 'bluePlug';
  else if (s.includes('central')) {
    throw new Error(
      `service='${service}' looks like a central service. Please provide a specific plug: redPlug | greenPlug | bluePlug`
    );
  } else {
    throw new Error(
      `Invalid service='${service}'. Expected a plug identifier containing one of: red, green, blue (e.g. redPlug | greenPlug | bluePlug)`
    );
  }

  let rawPoints;

  rawPoints = await fetchPointsFromAdapter(plugKey);

  if (!Array.isArray(rawPoints)) {
    throw new Error('Provider response did not contain an array of points');
  }

  // Filter points if IDs provided
  if (Array.isArray(filterIds) && filterIds.length > 0) {
    rawPoints = rawPoints.filter(p => {
      const pointId = p.pointid || p.id || p.uid || p.chargerId;
      return filterIds.includes(pointId) || filterIds.includes(String(pointId));
    });
    console.log(`📋 Filtering to ${rawPoints.length} points from provided IDs: ${filterIds.join(', ')}`);
  }

  const client = await pointsMysql.getConnection();
  try {
    await client.beginTransaction();

    // Empty the table first (full repopulate) - or just update if filtering
    if (!Array.isArray(filterIds) || filterIds.length === 0) {
      await client.query('DELETE FROM points');
    }

    let newCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    for (const rawPoint of rawPoints) {
      const normalized = normalizeAdapterPoint(rawPoint, plugKey);

      if (!normalized.id) {
        skippedCount++;
        console.warn(`[repopulate:${plugKey}] Skipping point without ID: ${JSON.stringify(rawPoint)}`);
        continue;
      }

      await client.query(
        `INSERT INTO points
          (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, connector, location_name, address, reservation_end_time, last_updated, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          capacity_kw = VALUES(capacity_kw),
          kwh_price = VALUES(kwh_price),
          lon = VALUES(lon),
          lat = VALUES(lat),
          connector = VALUES(connector),
          location_name = VALUES(location_name),
          address = VALUES(address),
          reservation_end_time = VALUES(reservation_end_time),
          last_updated = CURRENT_TIMESTAMP`,
        [
          uuidv4(),
          normalized.id || null,
          normalized.provider_name || null,
          normalized.lon || null,
          normalized.lat || null,
          normalized.status || null,
          normalized.capacity || null,
          normalized.price || null,
          normalized.connector || null,
          normalized.location_name || null,
          normalized.address || null,
          normalized.reservation_end_time || null,
          new Date(),
          new Date(),
        ]
      );

      newCount++;
    }

    await client.query('COMMIT');

    const payload = {
      service,
      plugKey,
      transport: ADAPTER_SYNC_TRANSPORT,
      fetched: rawPoints.length,
      newCount,
      updatedCount,
      skippedCount,
      filtered: Array.isArray(filterIds) && filterIds.length > 0,
      filterIds: filterIds || null,
    };

    console.log('[/db/populate]', payload);
    return payload;
  } catch (dbErr) {
    await client.query('ROLLBACK');
    throw dbErr;
  } finally {
    client.release();
  }
}

/**
 * Helper function to repopulate central DB by fetching from all 3 individual services
 * @param {Object} req - Express request object to get protocol and host
 * @returns {Promise<Object>} - Result payload with aggregated data
 */
async function repopulate_central(req) {
  const allPoints = [];

  const providers = ['redPlug', 'greenPlug', 'bluePlug'];
  console.log(`[repopulate_central] Fetching points from providers: ${providers.join(', ')}`);

  for (const provider of providers) {

    try {
      const points = await fetchPointsFromAdapter(provider);

      console.log(`[repopulate_central] Got ${points.length} points from ${provider} adapter`);
      if (points.length > 0) {
        console.log(`[repopulate_central] Sample point:`, JSON.stringify(points[0], null, 2).substring(0, 500));
      }
      allPoints.push(...points);
    } catch (err) {
      console.error(`[repopulate_central] Failed to fetch points from ${provider} adapter:`, err.message);
    }
  }

  console.log(`[repopulate_central] Total points to insert: ${allPoints.length}`);

  const client = await pointsMysql.getConnection();
  try {
    await client.beginTransaction();
    console.log(`[repopulate_central] Deleting all points from DB`);
    await client.query('DELETE FROM points');

    let insertedCount = 0;
    let skippedCount = 0;

    for (const point of allPoints) {
      // Convert ISO datetime strings to MySQL DATETIME format (remove T and Z)
      const normalizeDateTime = (dateStr) => {
        if (!dateStr) return null;
        return dateStr.replace(/T/, ' ').replace(/\.\d+Z$/, '').replace(/Z$/, '');
      };

      const pointId = point.point_id ?? point.pointId ?? point.id ?? point.uid ?? point.chargerId ?? point.pointid ?? null;
      if (!pointId) {
        skippedCount++;
        console.warn(`[repopulate_central] Skipping point without ID: ${JSON.stringify(point)}`);
        continue;
      }

      const reservationEndTime = normalizeDateTime(
        point.reservation_end_time ?? point.reservationEndTime ?? point.reservedUntil ?? point.reservationEnd ?? null
      );

      await client.query(
        `INSERT INTO points
          (id, point_id, provider_name, lon, lat, status, capacity_kw, kwh_price, connector, location_name, address, reservation_end_time, last_updated, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON DUPLICATE KEY UPDATE
          status = VALUES(status),
          capacity_kw = VALUES(capacity_kw),
          kwh_price = VALUES(kwh_price),
          lon = VALUES(lon),
          lat = VALUES(lat),
          connector = VALUES(connector),
          location_name = VALUES(location_name),
          address = VALUES(address),
          reservation_end_time = VALUES(reservation_end_time),
          last_updated = CURRENT_TIMESTAMP`,
        [
          uuidv4(),
          pointId,
          point.provider_name ?? point.providerName ?? point.provider ?? null,
          point.lon ?? point.lng ?? point.geo?.[1] ?? point.coords?.long ?? null,
          point.lat ?? point.geo?.[0] ?? point.coords?.lat ?? null,
          point.status ?? point.state ?? point.currentStatus ?? null,
          point.capacity_kw ?? point.capacityKw ?? point.capacity ?? point.cap ?? null,
          point.kwh_price ?? point.kwhPrice ?? point.pricePerKwh ?? point.kwhRateEur ?? point.price ?? null,
          point.connector || null,
          point.location_name ?? point.locationName ?? null,
          point.address || null,
          reservationEndTime,
          new Date(),
          new Date()
        ]
      );

      insertedCount++;
    }

    console.log(`[repopulate_central] Inserted ${insertedCount} points, skipped ${skippedCount}, committing...`);
    await client.query('COMMIT');
    console.log(`[repopulate_central] Transaction committed successfully`);

    return {
      message: 'Central DB repopulated from all 3 services',
      totalPoints: insertedCount,
      skippedPoints: skippedCount,
      success: true
    };
  } catch (dbErr) {
    await client.query('ROLLBACK');
    throw dbErr;
  } finally {
    client.release();
  }
}

/**
 * POST /db/repopulate
 * Fetch all points from the selected plug API and insert them into MariaDB.
 * Body (optional): { provider?: 'redPlug'|'greenPlug'|'bluePlug' }
 */
app.post(DB_REPOPULATE, async (req, res) => {
  try {
    const service = process.env.SERVICE;
    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue) so this endpoint can populate the DB. Examples: redPlug, greenPlug, bluePlug"
      );
    }

    // Filter points if IDs provided in request body
    const { points: filterIds } = req.body || {};

    // If service contains 'central', repopulate all 3 basic providers
    if (String(service).toLowerCase().includes('central')) {
      const centralResult = await repopulate_central(req);
      return res.json({ service, transport: ADAPTER_SYNC_TRANSPORT, centralRepopulate: centralResult });


    }

    // Use the current logic for non-central services
    const payload = await repopulate(service, filterIds);
    return res.json(payload);
  } catch (err) {
    console.error('Error in /db/repopulate:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /db/points/:pointId - Update a specific point
app.put(DB_POINT_UPDATE, async (req, res) => {
  try {
    const { pointId } = req.params;
    const pointData = req.body;

    // Check if point exists
    const [existingRows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({ error: `Point with ID ${pointId} not found` });
    }

    // Build update query dynamically from req.body fields
    const updates = [];
    const values = [];

    const allowedFields = [
      'point_id', 'provider_name', 'lon', 'lat', 'status',
      'capacity_kw', 'kwh_price', 'connector',
      'location_name', 'address', 'reservation_end_time'
    ];

    for (const field of allowedFields) {
      if (pointData[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(pointData[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(pointId);

    const query = `UPDATE points SET ${updates.join(', ')}, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?`;
    await pointsMysql.query(query, values);

    // Fetch updated point
    const [updatedRows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    notifyPointUpdate(updatedRows[0]);
    return res.json({
      message: 'Point updated successfully',
      point: updatedRows[0]
    });
  } catch (err) {
    console.error('Error updating point:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ---- api ----

const PDF_ALLOWED_STATUSES = (process.env.PDF_ALLOWED_STATUSES || 'available,charging,reserved,malfunction,offline,occupied,held')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const ALLOWED_AVAIL_FILTERS = ['available', 'occupied', 'unavailable'];
const AVAIL_STATUS_MAP = {
  available: ['available'],
  occupied: ['charging', 'reserved', 'occupied', 'held'],
  unavailable: ['offline', 'malfunction']
};

// Connector type mapping from numeric codes to semantic names
const CONNECTOR_TYPE_MAP = {
  '3': 'Type 3',
  '7': 'CHAdeMO',
  '20': 'Type 2',
  '24': 'CCS2',
  'null': 'Other'
};

const ALLOWED_CONNECTOR_TYPES = ['Type 2', 'Type 3', 'CHAdeMO', 'CCS2', 'Other'];
const ALLOWED_CHARGER_TYPES = ['AC', 'DC'];

function parseAvailFilters(rawAvail) {
  if (rawAvail === undefined || rawAvail === null || rawAvail === '') {
    return [];
  }

  const tokens = Array.isArray(rawAvail)
    ? rawAvail
    : String(rawAvail).split(',');

  return [...new Set(tokens.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];
}

function statusesFromAvailFilters(availFilters) {
  const statuses = availFilters.flatMap((a) => AVAIL_STATUS_MAP[a] || []);
  return [...new Set(statuses)];
}

function parseConnectorTypeFilters(rawConnectorType) {
  if (rawConnectorType === undefined || rawConnectorType === null || rawConnectorType === '') {
    return [];
  }

  const tokens = Array.isArray(rawConnectorType)
    ? rawConnectorType
    : String(rawConnectorType).split(',');

  return [...new Set(tokens.map((t) => String(t).trim()).filter(Boolean))];
}

function connectorCodesToMatch(connectorTypeFilters) {
  if (connectorTypeFilters.length === 0) {
    return [];
  }

  const codes = Object.entries(CONNECTOR_TYPE_MAP)
    .filter(([code, name]) => connectorTypeFilters.includes(name))
    .map(([code, name]) => code);

  return [...new Set(codes)];
}

function parseNumericFilter(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return null;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseChargerTypeFilters(rawType) {
  if (rawType === undefined || rawType === null || rawType === '') {
    return [];
  }

  const tokens = Array.isArray(rawType)
    ? rawType
    : String(rawType).split(',');

  return [...new Set(tokens.map((t) => String(t).trim().toUpperCase()).filter(Boolean))];
}

function formatDateTimeForPdf(value) {
  const d = value ? new Date(value) : new Date();
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function mapPointListPdf(row) {
  return {
    providerName: String(row.provider_name || ''),
    pointid: String(row.point_id || ''),
    lon: row.lon !== null && row.lon !== undefined ? String(row.lon) : '',
    lat: row.lat !== null && row.lat !== undefined ? String(row.lat) : '',
    status: String(row.status || ''),
    cap: row.capacity_kw !== null && row.capacity_kw !== undefined ? Number(row.capacity_kw) : null,
  };
}

function mapPointDetailPdf(row) {
  const isReserved = String(row.status || '').toLowerCase() === 'reserved';
  return {
    pointid: String(row.point_id || ''),
    lon: row.lon !== null && row.lon !== undefined ? String(row.lon) : '',
    lat: row.lat !== null && row.lat !== undefined ? String(row.lat) : '',
    status: String(row.status || ''),
    cap: row.capacity_kw !== null && row.capacity_kw !== undefined ? Number(row.capacity_kw) : null,
    reservationendtime: isReserved
      ? formatDateTimeForPdf(row.reservation_end_time)
      : formatDateTimeForPdf(new Date()),
    kwhprice: row.kwh_price !== null && row.kwh_price !== undefined ? Number(row.kwh_price) : null,
  };
}

/**
 * GET /api/points
 * Get all points with optional filters
 */
app.get(API_POINTS, async (req, res) => {

  try {
    const { provider, status, avail, connectorType, lat, lon, radius, limit, costMin, costMax, powerMin, powerMax, type } = req.query;
    const safeLimit = limit !== undefined ? Number(limit) : undefined;
    const parsedAvail = parseAvailFilters(avail);
    const parsedConnectorType = parseConnectorTypeFilters(connectorType);
    const parsedType = parseChargerTypeFilters(type);
    const safeCostMin = parseNumericFilter(costMin);
    const safeCostMax = parseNumericFilter(costMax);
    const safePowerMin = parseNumericFilter(powerMin);
    const safePowerMax = parseNumericFilter(powerMax);

    const invalidAvail = parsedAvail.filter((a) => !ALLOWED_AVAIL_FILTERS.includes(a));
    if (invalidAvail.length > 0) {
      return res.status(400).json({
        error: `Invalid avail filter(s): ${invalidAvail.join(', ')}. Allowed values: ${ALLOWED_AVAIL_FILTERS.join(', ')}`
      });
    }

    const invalidConnectorTypes = parsedConnectorType.filter((ct) => !ALLOWED_CONNECTOR_TYPES.includes(ct));
    if (invalidConnectorTypes.length > 0) {
      return res.status(400).json({
        error: `Invalid connectorType filter(s): ${invalidConnectorTypes.join(', ')}. Allowed values: ${ALLOWED_CONNECTOR_TYPES.join(', ')}`
      });
    }

    const invalidTypes = parsedType.filter((chargerType) => !ALLOWED_CHARGER_TYPES.includes(chargerType));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        error: `Invalid type filter(s): ${invalidTypes.join(', ')}. Allowed values: ${ALLOWED_CHARGER_TYPES.join(', ')}`
      });
    }

    if (safeCostMin !== null && safeCostMax !== null && safeCostMin > safeCostMax) {
      return res.status(400).json({ error: 'Invalid cost range: costMin cannot be greater than costMax' });
    }

    if (safePowerMin !== null && safePowerMax !== null && safePowerMin > safePowerMax) {
      return res.status(400).json({ error: 'Invalid power range: powerMin cannot be greater than powerMax' });
    }

    const availStatuses = statusesFromAvailFilters(parsedAvail);
    const connectorCodes = connectorCodesToMatch(parsedConnectorType);
    const chargerTypes = parsedType;

    // Debug: check if database is accessible and has data
    const [countRows] = await pointsMysql.query('SELECT COUNT(*) as count FROM points');
    console.log(`[GET /api/points] DB has ${countRows[0]?.count || 0} points`);

    let query = 'SELECT * FROM points WHERE 1=1';
    const params = [];

    if (provider) {
      // central schema uses provider_name
      query += ' AND provider_name = ?';
      params.push(provider);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (availStatuses.length > 0) {
      query += ` AND status IN (${availStatuses.map(() => '?').join(', ')})`;
      params.push(...availStatuses);
    }

    if (connectorCodes.length > 0) {
      query += ` AND connector IN (${connectorCodes.map(() => '?').join(', ')})`;
      params.push(...connectorCodes);
    }

    if (safeCostMin !== null) {
      query += ' AND kwh_price >= ?';
      params.push(safeCostMin);
    }

    if (safeCostMax !== null) {
      query += ' AND kwh_price <= ?';
      params.push(safeCostMax);
    }

    if (safePowerMin !== null) {
      query += ' AND capacity_kw >= ?';
      params.push(safePowerMin);
    }

    if (safePowerMax !== null) {
      query += ' AND capacity_kw <= ?';
      params.push(safePowerMax);
    }

    if (chargerTypes.length > 0) {
      const typeClauses = chargerTypes.map((chargerType) => {
        return chargerType === 'AC'
          ? '(capacity_kw IS NOT NULL AND capacity_kw <= 22)'
          : '(capacity_kw IS NOT NULL AND capacity_kw > 22)';
      });
      query += ` AND (${typeClauses.join(' OR ')})`;
    }

    if (lat && lon && radius) {
      // Keep simple bounding approximation if radius is provided (central schema has no PostGIS).
      // radius is assumed in km.
      const km = Number(radius);
      const latDelta = km / 111; // ~111km per degree latitude
      const lonDelta = km / (111 * Math.cos(Number(lat) * Math.PI / 180));

      query += ' AND lat BETWEEN ? AND ?';
      params.push(Number(lat) - latDelta, Number(lat) + latDelta);

      query += ' AND lon BETWEEN ? AND ?';
      params.push(Number(lon) - lonDelta, Number(lon) + lonDelta);
    }

    if (safeLimit !== undefined && Number.isFinite(safeLimit)) {
      query += ' LIMIT ?';
      params.push(safeLimit);
    }

    const [rows] = await pointsMysql.query(query, params);

    res.json({
      count: rows.length,
      points: rows
    });

  } catch (err) {
    console.error('Error fetching points:', err.message);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

app.get('/points', async (req, res) => {
  try {
    const { provider, status, avail, connectorType, lat, lon, radius, limit, costMin, costMax, powerMin, powerMax, type } = req.query;
    const safeLimit = limit !== undefined ? Number(limit) : undefined;
    const parsedAvail = parseAvailFilters(avail);
    const parsedConnectorType = parseConnectorTypeFilters(connectorType);
    const parsedType = parseChargerTypeFilters(type);
    const safeCostMin = parseNumericFilter(costMin);
    const safeCostMax = parseNumericFilter(costMax);
    const safePowerMin = parseNumericFilter(powerMin);
    const safePowerMax = parseNumericFilter(powerMax);

    const invalidAvail = parsedAvail.filter((a) => !ALLOWED_AVAIL_FILTERS.includes(a));
    if (invalidAvail.length > 0) {
      return res.status(400).json({
        error: `Invalid avail filter(s): ${invalidAvail.join(', ')}. Allowed values: ${ALLOWED_AVAIL_FILTERS.join(', ')}`
      });
    }

    const invalidConnectorTypes = parsedConnectorType.filter((ct) => !ALLOWED_CONNECTOR_TYPES.includes(ct));
    if (invalidConnectorTypes.length > 0) {
      return res.status(400).json({
        error: `Invalid connectorType filter(s): ${invalidConnectorTypes.join(', ')}. Allowed values: ${ALLOWED_CONNECTOR_TYPES.join(', ')}`
      });
    }

    const invalidTypes = parsedType.filter((chargerType) => !ALLOWED_CHARGER_TYPES.includes(chargerType));
    if (invalidTypes.length > 0) {
      return res.status(400).json({
        error: `Invalid type filter(s): ${invalidTypes.join(', ')}. Allowed values: ${ALLOWED_CHARGER_TYPES.join(', ')}`
      });
    }

    if (safeCostMin !== null && safeCostMax !== null && safeCostMin > safeCostMax) {
      return res.status(400).json({ error: 'Invalid cost range: costMin cannot be greater than costMax' });
    }

    if (safePowerMin !== null && safePowerMax !== null && safePowerMin > safePowerMax) {
      return res.status(400).json({ error: 'Invalid power range: powerMin cannot be greater than powerMax' });
    }

    const availStatuses = statusesFromAvailFilters(parsedAvail);
    const connectorCodes = connectorCodesToMatch(parsedConnectorType);
    const chargerTypes = parsedType;

    if (status && !PDF_ALLOWED_STATUSES.includes(String(status))) {
      return res.status(400).json({
        error: `Invalid status '${status}'. Allowed values: ${PDF_ALLOWED_STATUSES.join(', ')}`
      });
    }

    let query = 'SELECT * FROM points WHERE 1=1';
    const params = [];

    if (provider) {
      query += ' AND provider_name = ?';
      params.push(provider);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (availStatuses.length > 0) {
      query += ` AND status IN (${availStatuses.map(() => '?').join(', ')})`;
      params.push(...availStatuses);
    }

    if (connectorCodes.length > 0) {
      query += ` AND connector IN (${connectorCodes.map(() => '?').join(', ')})`;
      params.push(...connectorCodes);
    }

    if (safeCostMin !== null) {
      query += ' AND kwh_price >= ?';
      params.push(safeCostMin);
    }

    if (safeCostMax !== null) {
      query += ' AND kwh_price <= ?';
      params.push(safeCostMax);
    }

    if (safePowerMin !== null) {
      query += ' AND capacity_kw >= ?';
      params.push(safePowerMin);
    }

    if (safePowerMax !== null) {
      query += ' AND capacity_kw <= ?';
      params.push(safePowerMax);
    }

    if (chargerTypes.length > 0) {
      const typeClauses = chargerTypes.map((chargerType) => {
        return chargerType === 'AC'
          ? '(capacity_kw IS NOT NULL AND capacity_kw <= 22)'
          : '(capacity_kw IS NOT NULL AND capacity_kw > 22)';
      });
      query += ` AND (${typeClauses.join(' OR ')})`;
    }

    if (lat && lon && radius) {
      const km = Number(radius);
      const latDelta = km / 111;
      const lonDelta = km / (111 * Math.cos(Number(lat) * Math.PI / 180));

      query += ' AND lat BETWEEN ? AND ?';
      params.push(Number(lat) - latDelta, Number(lat) + latDelta);

      query += ' AND lon BETWEEN ? AND ?';
      params.push(Number(lon) - lonDelta, Number(lon) + lonDelta);
    }

    if (safeLimit !== undefined && Number.isFinite(safeLimit)) {
      query += ' LIMIT ?';
      params.push(safeLimit);
    }

    const [rows] = await pointsMysql.query(query, params);
    res.json(rows.map(mapPointListPdf));
  } catch (err) {
    console.error('Error fetching points:', err.message);
    res.status(500).json({ error: 'Failed to fetch points' });
  }
});

/**
 * GET /api/points/events
 * Server-Sent Events stream for real-time point status updates.
 * Must be registered BEFORE the :pointId wildcard route.
 */
app.get('/api/points/events', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write(': connected\n\n');

  sseClients.add(res);

  const keepalive = setInterval(() => {
    try {
      res.write(': keepalive\n\n');
    } catch (_) {
      clearInterval(keepalive);
      sseClients.delete(res);
    }
  }, 25000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(res);
  });
});

/**
 * GET /api/points/:pointId
 * Get specific point details
 */
app.get(API_POINTS_BY_ID, async (req, res) => {
  try {
    const { pointId } = req.params;

    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching point:', err.message);
    res.status(500).json({ error: 'Failed to fetch point' });
  }
});

app.get('/api/point/:pointId', async (req, res) => {
  const { pointId } = req.params;

  try {
    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching point:', err.message);
    res.status(500).json({ error: 'Failed to fetch point' });
  }
});

app.get('/point/:pointId', async (req, res) => {
  const { pointId } = req.params;

  try {
    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json(mapPointDetailPdf(rows[0]));
  } catch (err) {
    console.error('Error fetching point:', err.message);
    res.status(500).json({ error: 'Failed to fetch point' });
  }
});

/**
 * POST /api/points/:pointId/reserve
 * Reserve a charging point via provider API and update DB status
 */
app.post(API_POINTS_RESERVE, async (req, res) => {
  try {
    const service = process.env.SERVICE;
    if (!service) {
      throw new Error(
        "Missing process.env.SERVICE. Provide a plug name (red/green/blue) so this endpoint can work. Examples: redPlug, greenPlug, bluePlug"
      );
    }

const { pointId } = req.params;

    // Client sends { duration: <minutes> } (per requirement: request JSON has `minutes` key)
    // Accept both `duration` and `minutes` for robustness.
    const { duration, minutes } = req.body || {};
    const reserveMinutes = duration ?? minutes;

    const [rows] = await pointsMysql.query(
      'SELECT * FROM points WHERE point_id = ?',
      [pointId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    const point = rows[0];
    const provider = point.provider_name;
    const config = PROVIDER_MAP[provider];

    if (!config) {
      return res.status(400).json({ error: `Unknown provider: ${provider}` });
    }

    let reserveUrl = buildProviderUrl(provider, "reservePath", pointId);

    const bearerToken = process.env.BEARER_TOKEN;
    const headers = { 'Accept': 'application/json' };
    if (bearerToken) {
      headers.Authorization = `Bearer ${bearerToken}`;
    }

    // Build provider-specific request body.
    // Requirement from user: body uses `minutes` key in the request JSON.
    // We'll use reserveMinutes to populate provider payload.
    let reserveBody = {};

    if (reserveMinutes !== undefined && reserveMinutes !== null) {
      // Normalize minutes to a number if possible
      const minutesNum = Number(reserveMinutes);
      const minutesInt = parseInt(minutesNum);
      if (!Number.isNaN(minutesNum)) {
        if (provider === 'bluePlug') {
          reserveUrl += `?minutes=${minutesInt}`;
          console.log(`Built reserveUrl for bluePlug with duration as query param: ${reserveUrl}`);
        }else if (provider === 'redPlug') {
          // redPlug supports duration in the URL path, so we can skip it in the body.
          reserveUrl = buildProviderUrl(provider, "reservePathWduration", `${pointId},${minutesInt}`);
          console.log(`Built reserveUrl for redPlug with duration in path: ${reserveUrl}`);
        }else if (provider === 'greenPlug') {
          reserveBody = { duration: minutesInt };
          console.log(`Built reserveBody for greenPlug with duration in body:`, reserveBody," and reserveUrl: ", reserveUrl);
        }else{
          throw new Error(`Provider ${provider} must be one of redPlug, greenPlug, bluePlug for duration handling`);
        }
      }
    }

    console.log(`📡 Reserving point ${pointId} via ${provider}: POST ${reserveUrl}`, reserveBody);
    const reserveResp = await axios.post(reserveUrl, reserveBody, {
      timeout: 10000,
      headers
    });

    const reserveData = reserveResp.data || {};
    const normalizedResp = normalizePoint(reserveData, provider);

    const newStatus = normalizedResp.status;
    const reservationEndTime = normalizedResp.reservation_end_time;



    if (newStatus !== 'held' && newStatus !== 'reserved') {
      return res.status(400).json({
        error: 'Reservation failed: Expecting provider to return status "held" or "reserved" after reservation attempt',
        status: newStatus,
        details: reserveData
      });
    }

    try {
      // Single UPDATE statement => atomic: either the whole row is updated or none.
      await pointsMysql.query(
        'UPDATE points SET status = ?, reservation_end_time = ?, last_updated = CURRENT_TIMESTAMP WHERE point_id = ?',
        [newStatus, reservationEndTime || null, pointId]
      );
    } catch (dbErr) {
      // If DB fails, do not mask the provider reservation result; return error to caller.
      throw dbErr;
    }

    try {
      const [freshRows] = await pointsMysql.query('SELECT * FROM points WHERE point_id = ?', [pointId]);
      if (freshRows.length > 0) notifyPointUpdate(freshRows[0]);
    } catch (_) {}

    console.log(`✓ Point ${pointId} reserved successfully, status updated to ${newStatus} in ${service} DB`);

    const remainingMs = scheduleReservationExpiry(pointId, reservationEndTime);

    await publishReservationSuccessful({
      pointId,
      reservation_end_time: reservationEndTime || null,
      reservation_status: newStatus,
      source_service: service,
      provider,
    });

    // Build response with all update results
    const responseData = {
      pointId,
      provider,
      status: newStatus,
      reservationEndTime: reservationEndTime,
      timestamp: new Date(),
      expiresIn: `${Math.floor(remainingMs / 1000)} seconds`,
      message: `Point ${pointId} reserved successfully via ${provider}; state propagated through RabbitMQ`
    };

    res.json(responseData);
  } catch (err) {
    console.error('Error reserving point:', err.message);
    res.status(500).json({ error: 'Failed to reserve point', details: err.message });
  }
});

app.post(API_POINTS_RESERVE_MINUTES, async (req, res) => {
  try {
    const { pointId, minutes } = req.params;
    
    // Extract host:port
    const protocol = req.protocol; // http or https
    const host = req.get('host'); // e.g. localhost:3001

    const url_repl = API_POINTS_RESERVE.replace(':pointId', pointId);
    console.log(`Received reserve request with minutes. Original URL: ${req.originalUrl}, Reconstructed URL: ${url_repl} to send with body { minutes: ${minutes} }`);
    const response = await axios.post(
      `http://${host}${url_repl}`,
      { minutes: Number(minutes) }
    );

    res.json(response.data);
  } catch (err) {
    console.error('Error in reserve with minutes:', err.message);
    res.status(500).json({ error: 'Failed to reserve point', details: err.message });
  }
});


/**
 * GET /health
 * Health check
 */
app.get(HEALTH, async (req, res) => {
  try {
    const result = await pointsMysql.query('SELECT 1');

    res.json({
      status: 'ok',

      service: process.env.SERVICE || 'points-service',
      port: process.env.PORT || 3001,
      database: 'connected',
      timestamp: new Date()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      service: process.env.SERVICE || 'points-service',
      database: 'disconnected',
      error: err.message
    });
  }
});

// ============== SCHEDULED SYNC ==============
/**
 * Scheduled Data Sync (1-2 times per day)
 * 
 * This Points Service orchestrates the data synchronization flow:
 * - Calls repopulate() for current service (if red/green/blue)
 * - Calls repopulate_central() if this is the central service
 * - Triggers sync with all providers' APIs via adapters
 * - Performs upsert of normalized data into local DB
 * - Cross-service propagation handled separately (reservations)
 * 
 * Schedule:
 * - 02:00 UTC (Default)
 * - 10:00 UTC (Default)
 * - 18:00 UTC (Default)
 * 
 * Configurable via environment: SYNC_SCHEDULE_TIMES (comma-separated hours, 0-23)
 */

function scheduleDataSync() {
  const syncHours = process.env.SYNC_SCHEDULE_TIMES 
    ? process.env.SYNC_SCHEDULE_TIMES.split(',').map(h => parseInt(h.trim())) 
    : [2, 10, 18]; // Default: 02:00, 10:00, 18:00 UTC

  console.log(`✓ Scheduled sync configured for hours: ${syncHours.join(', ')} UTC`);

  // Check every minute if it's time to sync
  setInterval(async () => {
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    // Sync at the top of each configured hour (when minute is 0-2)
    if (syncHours.includes(currentHour) && currentMinute < 3) {
      console.log(`\n🔄 Starting scheduled data sync at ${now.toISOString()}`);
      
      try {
        const service = process.env.SERVICE || 'points-service';
        const s = String(service).toLowerCase();

        if (s.includes('central')) {
          // Central service: orchestrate full repopulate from all providers
          console.log('[Scheduled Sync] Central service: repopulating from all 3 providers');
          await repopulate_central({ protocol: 'http', get: () => 'localhost' });
        } else if (s.includes('red') || s.includes('green') || s.includes('blue')) {
          // Individual service: repopulate from own provider
          console.log(`[Scheduled Sync] ${service}: repopulating from local provider`);
          await repopulate(service);
        }

        console.log('✓ Scheduled data sync completed successfully\n');
      } catch (err) {
        console.error('✗ Scheduled data sync failed:', err.message, '\n');
      }

      // Skip next check for this hour to avoid duplicate syncs
      await new Promise(r => setTimeout(r, 120000)); // Wait 2 minutes
    }
  }, 60000); // Check every minute
}

async function recoverReservationExpiryTimers() {
  try {
    const [rows] = await pointsMysql.query(
      `SELECT point_id, DATE_FORMAT(reservation_end_time, '%Y-%m-%d %H:%i:%s') AS reservation_end_time
       FROM points
       WHERE status IN ('reserved', 'held')
         AND reservation_end_time IS NOT NULL`
    );

    for (const row of rows) {
      scheduleReservationExpiry(row.point_id, row.reservation_end_time);
    }

    console.log(`✓ Recovered ${rows.length} reservation expiry timers`);
  } catch (err) {
    console.error('✗ Failed to recover reservation expiry timers:', err.message);
  }
}

// ============== SERVER START ==============

const PORT = process.env.PORT || 3001;

let server = null;

async function startServer() {
  try {
    setDependencies({ db: pointsMysql, scheduleReservationExpiry, notifyPointUpdate });
    await connectRabbitMQ();
    await recoverReservationExpiryTimers();
    
    // Initialize scheduled sync for automatic data updates (1-2x per day)
    scheduleDataSync();

    server = app.listen(PORT, () => {
      const ips = getAccessibleIps();
      console.log(`✓ Points Service ${process.env.SERVICE } running on port ${PORT}`);
      console.log(`✓ MariaDB: ${process.env.MARIADB_HOST}:${process.env.MARIADB_PORT}/${dbName}`);
      console.log(`✓ Access via: ${ips.map(ip => `http://${ip}:${PORT}`).join(', ')}`);
    });
  } catch (err) {
    console.error('✗ Failed to start Points Service:', err.message);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (server) {
    server.close(async () => {
      await closeRabbitMQ();
      await pointsMysql.end();
      process.exit(0);
    });
  } else {
    await closeRabbitMQ();
    await pointsMysql.end();
    process.exit(0);
  }
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  if (server) {
    server.close(async () => {
      await closeRabbitMQ();
      await pointsMysql.end();
      process.exit(0);
    });
  } else {
    await closeRabbitMQ();
    await pointsMysql.end();
    process.exit(0);
  }
});

module.exports = app;
