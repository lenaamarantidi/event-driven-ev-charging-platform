/**
 * Billing Controllers
 * UC05: View invoice
 * 
 * Generates and serves invoices for providers
 * Invoices are calculated from billable events (reservations)
 */

const axios = require('axios');
const { pool } = require('./db');
const { publishInvoiceCreated } = require('./rabbitmq');

const ANALYTICS_SERVICE_URL = process.env.ANALYTICS_SERVICE_URL || 'http://localhost:3102';
const MESSAGE_BROKER_URL = process.env.MESSAGE_BROKER_URL || 'http://localhost:3003';
const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL || 'http://localhost:3103';
const BROKER_SERVICE_ID = process.env.BROKER_SERVICE_ID || 'billing-service';
const BROKER_PAYMENT_WEBHOOK_PATH = process.env.BROKER_PAYMENT_WEBHOOK_PATH || '/api/webhooks/payment-processed';
const BROKER_PAYMENT_WEBHOOK_URL = `${BILLING_SERVICE_URL}${BROKER_PAYMENT_WEBHOOK_PATH}`;
const MONTHLY_FEE_DEFAULT = 15.00;
const RESERVATION_PRICE_DEFAULT = 0.10;
const PAYMENT_TERMS_DAYS = Number(process.env.PAYMENT_TERMS_DAYS || 30);

const DAILY_USAGE_METADATA_KEY = 'last_daily_usage_refresh';
const MONTHLY_INVOICE_METADATA_KEY = 'last_monthly_invoice_generation';

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function getCurrentBillingPeriod() {
  const today = new Date();
  return getBillingPeriodByDate(today);
}

function getBillingPeriodByDate(date) {
  const startDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 1));
  const endDate = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 1, 0));
  const dueDate = new Date(Date.UTC(date.getFullYear(), date.getMonth() + 2, 0));

  return {
    startDate,
    endDate,
    nextMonthStart,
    dueDate,
    periodStart: formatDate(startDate),
    periodEnd: formatDate(endDate),
    nextPeriodStart: formatDate(nextMonthStart)
  };
}

function getPreviousBillingPeriod() {
  const today = new Date();
  const prevMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth() - 1, 1));
  return getBillingPeriodByDate(prevMonth);
}

async function getProviderPricing(providerId) {
  try {
    const [rows] = await pool.query(
      `SELECT monthly_fee, reservation_price FROM provider_pricing WHERE provider_id = ?`,
      [providerId]
    );
    if (rows.length > 0) {
      return {
        monthlyFee: parseFloat(rows[0].monthly_fee),
        reservationPrice: parseFloat(rows[0].reservation_price)
      };
    }
  } catch (err) {
    console.error('Error fetching provider pricing:', err.message);
  }
  return {
    monthlyFee: MONTHLY_FEE_DEFAULT,
    reservationPrice: RESERVATION_PRICE_DEFAULT
  };
}

async function fetchBillingStats(providerId, billingPeriodStart, billingPeriodEnd) {
  try {
    const response = await axios.post(
      `${ANALYTICS_SERVICE_URL}/analytics/billing/request`,
      {
        providerId,
        billingPeriodStart,
        billingPeriodEnd
      },
      { timeout: 8000 }
    );
    return response.data;
  } catch (err) {
    console.error('Error fetching billing stats from Analytics Service:', err.message);
    throw err;
  }
}

async function publishBrokerEvent(eventType, data) {
  try {
    await axios.post(
      `${MESSAGE_BROKER_URL}/api/events/publish`,
      {
        eventType,
        data: {
          ...data,
          sourceService: BROKER_SERVICE_ID
        }
      },
      { timeout: 5000 }
    );
    return true;
  } catch (err) {
    console.error(`Failed to publish broker event ${eventType}:`, err.message);
    return false;
  }
}

async function subscribeToBrokerEvent(eventType, webhookUrl) {
  try {
    const response = await axios.post(
      `${MESSAGE_BROKER_URL}/api/webhooks/subscribe`,
      {
        eventType,
        serviceId: BROKER_SERVICE_ID,
        webhookUrl
      },
      { timeout: 5000 }
    );
    console.log(`Subscribed to broker event ${eventType}:`, response.data?.queueName || 'ok');
    return true;
  } catch (err) {
    console.error(`Failed to subscribe to broker event ${eventType}:`, err.message);
    return false;
  }
}

async function getMetadataValue(key) {
  const [rows] = await pool.query('SELECT value FROM billing_metadata WHERE key_name = ?', [key]);
  return rows.length ? rows[0].value : null;
}

async function setMetadataValue(key, value) {
  await pool.query(
    `INSERT INTO billing_metadata (key_name, value)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = CURRENT_TIMESTAMP`,
    [key, value]
  );
}

function getCurrentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthKeyForDate(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function ensureDailyUsageRefresh() {
  const today = getCurrentDateKey();
  const lastRefresh = await getMetadataValue(DAILY_USAGE_METADATA_KEY);
  if (lastRefresh === today) {
    return false;
  }
  await refreshCurrentUsageForAllProviders();
  await setMetadataValue(DAILY_USAGE_METADATA_KEY, today);
  return true;
}

async function ensureMonthlyInvoiceGeneration() {
  const today = new Date();
  const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const monthKey = getMonthKeyForDate(previousMonth);
  const lastGeneration = await getMetadataValue(MONTHLY_INVOICE_METADATA_KEY);
  if (lastGeneration === monthKey) {
    return false;
  }
  await generateMonthlyInvoicesForAllProviders(today);
  await setMetadataValue(MONTHLY_INVOICE_METADATA_KEY, monthKey);
  return true;
}

async function runScheduledBillingTasks() {
  try {
    await ensureDailyUsageRefresh();
    await ensureMonthlyInvoiceGeneration();
  } catch (err) {
    console.error('Scheduled billing tasks failed:', err.message);
  }
}

function scheduleDailyBillingTasks() {
  const now = new Date();
  const nextRun = new Date(now);
  nextRun.setUTCHours(2, 0, 0, 0);
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1);
  }
  const delay = nextRun - now;
  setTimeout(async () => {
    await runScheduledBillingTasks();
    setInterval(runScheduledBillingTasks, 24 * 60 * 60 * 1000);
  }, delay);
}

async function upsertCurrentUsage(providerId, billingPeriod, successfulReservations, monthlyFee, reservationPrice) {
  const estimatedAmount = parseFloat((monthlyFee + successfulReservations * reservationPrice).toFixed(2));
  const now = new Date();
  await pool.query(
    `INSERT INTO current_usage
      (provider_id, billing_period, successful_reservations, monthly_fee, reservation_price, estimated_amount, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       successful_reservations = VALUES(successful_reservations),
       monthly_fee = VALUES(monthly_fee),
       reservation_price = VALUES(reservation_price),
       estimated_amount = VALUES(estimated_amount),
       updated_at = VALUES(updated_at)`,
    [providerId, billingPeriod, successfulReservations, monthlyFee, reservationPrice, estimatedAmount, now]
  );
  return {
    providerId,
    billingPeriod,
    successfulReservations,
    monthlyFee,
    reservationPrice,
    estimatedAmount,
    updatedAt: now
  };
}

async function updateCurrentUsageForProvider(providerId) {
  const billing = getCurrentBillingPeriod();
  const { monthlyFee, reservationPrice } = await getProviderPricing(providerId);
  const stats = await fetchBillingStats(providerId, billing.periodStart, billing.periodEnd);
  const successfulReservations = Number(stats.successfulReservationsCount || 0);
  return upsertCurrentUsage(providerId, billing.periodStart, successfulReservations, monthlyFee, reservationPrice);
}

async function getAllKnownProviderIds() {
  const providerIds = new Set();

  try {
    const [pricingRows] = await pool.query('SELECT provider_id FROM provider_pricing');
    pricingRows.forEach(row => providerIds.add(row.provider_id));
  } catch (err) {
    console.error('Failed to load provider_pricing provider ids:', err.message);
  }

  try {
    const [eventRows] = await pool.query('SELECT DISTINCT provider_id FROM billable_events');
    eventRows.forEach(row => providerIds.add(row.provider_id));
  } catch (err) {
    console.error('Failed to load billable_events provider ids:', err.message);
  }

  return Array.from(providerIds);
}

async function refreshCurrentUsageForAllProviders() {
  const providerIds = await getAllKnownProviderIds();
  const results = [];
  for (const providerId of providerIds) {
    try {
      results.push(await updateCurrentUsageForProvider(providerId));
    } catch (err) {
      console.error(`Failed to refresh usage for provider ${providerId}:`, err.message);
    }
  }
  return results;
}

async function generateMonthlyInvoicesForAllProviders(date = new Date()) {
  const billing = getBillingPeriodByDate(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
  const providerIds = await getAllKnownProviderIds();
  const results = [];

  for (const providerId of providerIds) {
    try {
      const pricing = await getProviderPricing(providerId);
      const stats = await fetchBillingStats(providerId, billing.periodStart, billing.periodEnd);
      const successfulReservations = Number(stats.successfulReservationsCount || 0);
      const invoice = await createInvoice(
        providerId,
        billing.periodStart,
        billing.periodEnd,
        successfulReservations,
        pricing.monthlyFee,
        pricing.reservationPrice
      );
      results.push(invoice);
    } catch (err) {
      console.error(`Failed to generate monthly invoice for provider ${providerId}:`, err.message);
    }
  }

  return results;
}

async function createInvoice(providerId, billingPeriodStart, billingPeriodEnd, successfulReservationsCount, monthlyFee, reservationPrice) {
  const totalAmount = parseFloat((monthlyFee + successfulReservationsCount * reservationPrice).toFixed(2));
  const taxAmount = 0.00;
  const grandTotal = totalAmount;
  const dueDate = new Date(billingPeriodEnd);
  dueDate.setUTCDate(dueDate.getUTCDate() + PAYMENT_TERMS_DAYS);

  const [existingRows] = await pool.query(
    `SELECT * FROM invoices WHERE provider_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
    [providerId, billingPeriodStart, billingPeriodEnd]
  );

  let invoice;
  let invoiceCreated = false;

  if (existingRows.length > 0) {
    invoice = existingRows[0];
    const currentStatus = (invoice.status || '').toString().toUpperCase();

    if (currentStatus !== 'PAID') {
      await pool.query(
        `UPDATE invoices SET
          successful_reservations_count = ?,
          monthly_fee = ?,
          reservation_price = ?,
          total_amount = ?,
          tax_amount = ?,
          grand_total = ?,
          status = ?,
          due_date = ?
         WHERE invoice_id = ?`,
        [
          successfulReservationsCount,
          monthlyFee,
          reservationPrice,
          totalAmount,
          taxAmount,
          grandTotal,
          'PENDING',
          formatDate(dueDate),
          invoice.invoice_id
        ]
      );
      const [updatedRows] = await pool.query(`SELECT * FROM invoices WHERE invoice_id = ?`, [invoice.invoice_id]);
      invoice = updatedRows[0];
    }
  } else {
    const [result] = await pool.query(
      `INSERT INTO invoices
        (provider_id, billing_period_start, billing_period_end, successful_reservations_count, monthly_fee, reservation_price, total_amount, tax_amount, grand_total, status, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        providerId,
        billingPeriodStart,
        billingPeriodEnd,
        successfulReservationsCount,
        monthlyFee,
        reservationPrice,
        totalAmount,
        taxAmount,
        grandTotal,
        formatDate(dueDate)
      ]
    );

    invoiceCreated = true;
    const [rows] = await pool.query(`SELECT * FROM invoices WHERE invoice_id = ?`, [result.insertId]);
    invoice = rows[0];
  }

  if (invoice) {
    await pool.query(`DELETE FROM invoice_line_items WHERE invoice_id = ?`, [invoice.invoice_id]);
    await pool.query(
      `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
       VALUES
       (?, 'Monthly subscription fee', 1, ?, ?),
       (?, 'Reservation fee', ?, ?, ?)`,
      [
        invoice.invoice_id,
        monthlyFee,
        monthlyFee,
        invoice.invoice_id,
        successfulReservationsCount,
        reservationPrice,
        parseFloat((successfulReservationsCount * reservationPrice).toFixed(2))
      ]
    );

    if (invoiceCreated) {
      const payload = {
        invoiceId: invoice.invoice_id,
        providerId,
        billingPeriodStart,
        billingPeriodEnd,
        totalAmount,
        issuedAt: invoice.issued_at || new Date().toISOString()
      };
      publishInvoiceCreated(payload);
    }
  }

  return invoice;
}

async function getProviderInvoice(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const billing = getCurrentBillingPeriod();

    const [existingInvoices] = await pool.query(
      `SELECT * FROM invoices WHERE provider_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
      [parsedProviderId, billing.periodStart, billing.periodEnd]
    );

    let invoice = existingInvoices[0];
    const pricing = await getProviderPricing(parsedProviderId);
    const stats = await fetchBillingStats(parsedProviderId, billing.periodStart, billing.periodEnd);
    const successfulReservations = Number(stats.successfulReservationsCount || 0);

    if (!invoice) {
      invoice = await createInvoice(
        parsedProviderId,
        billing.periodStart,
        billing.periodEnd,
        successfulReservations,
        pricing.monthlyFee,
        pricing.reservationPrice
      );
    } else if ((invoice.status || '').toString().toUpperCase() !== 'PAID') {
      invoice = await createInvoice(
        parsedProviderId,
        billing.periodStart,
        billing.periodEnd,
        successfulReservations,
        pricing.monthlyFee,
        pricing.reservationPrice
      );
    }

    const [lineItems] = await pool.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [invoice.invoice_id]
    );

    const estimatedAmount = parseFloat((pricing.monthlyFee + (invoice.successful_reservations_count || 0) * pricing.reservationPrice).toFixed(2));

    await upsertCurrentUsage(
      parsedProviderId,
      billing.periodStart,
      Number(invoice.successful_reservations_count || 0),
      pricing.monthlyFee,
      pricing.reservationPrice
    );

    return res.json({
      invoiceId: invoice.invoice_id,
      providerId: invoice.provider_id,
      billingPeriodStart: formatDate(new Date(invoice.billing_period_start)),
      billingPeriodEnd: formatDate(new Date(invoice.billing_period_end)),
      successfulReservationsCount: Number(invoice.successful_reservations_count || 0),
      monthlyFee: parseFloat(pricing.monthlyFee),
      reservationPrice: parseFloat(pricing.reservationPrice),
      totalAmount: parseFloat(invoice.total_amount),
      status: invoice.status,
      issuedAt: invoice.issued_at ? new Date(invoice.issued_at).toISOString() : new Date().toISOString(),
      dueDate: formatDate(new Date(invoice.due_date)),
      lineItems: lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unitPrice: parseFloat(item.unit_price),
        lineTotal: parseFloat(item.line_total)
      })),
      estimatedAmount,
      metadata: {
        paidAt: invoice.paid_at ? new Date(invoice.paid_at).toISOString() : null
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in getProviderInvoice:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch invoice',
      message: err.message
    });
  }
}

/**
 * GET /api/billing/invoices/:providerId
 * Get all invoices for a provider
 */
async function getProviderInvoices(req, res) {
  try {
    const { providerId } = req.params;
    const { limit = 12, offset = 0, status } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const parsedLimit = Math.min(parseInt(limit, 10) || 12, 100);
    const parsedOffset = parseInt(offset, 10) || 0;

    let query = 'SELECT * FROM invoices WHERE provider_id = ?';
    const values = [parsedProviderId];

    if (status) {
      query += ' AND status = ?';
      values.push(status);
    }

    query += ' ORDER BY issued_at DESC LIMIT ? OFFSET ?';
    values.push(parsedLimit, parsedOffset);

    const [invoices] = await pool.query(query, values);

    return res.json({
      provider_id: parsedProviderId,
      total_invoices: invoices.length,
      invoices: invoices.map(inv => ({
        invoice_id: inv.invoice_id,
        billing_period_start: inv.billing_period_start ? new Date(inv.billing_period_start).toISOString().slice(0, 10) : null,
        billing_period_end: inv.billing_period_end ? new Date(inv.billing_period_end).toISOString().slice(0, 10) : null,
        total_amount: parseFloat(inv.total_amount),
        status: inv.status,
        issued_at: inv.issued_at ? new Date(inv.issued_at).toISOString() : null,
        due_date: inv.due_date ? new Date(inv.due_date).toISOString().slice(0, 10) : null,
        successful_reservations_count: inv.successful_reservations_count
      })),
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });
  } catch (err) {
    console.error('Error in getProviderInvoices:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch invoices',
      message: err.message
    });
  }
}

/**
 * POST /api/billing/invoices/:providerId/:invoiceId/mark-paid
 * Mark an invoice as paid
 */
async function markInvoicePaid(req, res) {
  try {
    const { providerId, invoiceId } = req.params;

    if (!providerId || !invoiceId || isNaN(parseInt(providerId, 10)) || isNaN(parseInt(invoiceId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId or invoiceId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const parsedInvoiceId = parseInt(invoiceId, 10);

    // Verify invoice belongs to provider
    const [invoices] = await pool.query(
      'SELECT * FROM invoices WHERE invoice_id = ? AND provider_id = ?',
      [parsedInvoiceId, parsedProviderId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        error: 'Invoice not found'
      });
    }

    // Update invoice status
    await pool.query(
      'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE invoice_id = ?',
      ['PAID', parsedInvoiceId]
    );

    const [updatedInvoices] = await pool.query(
      'SELECT * FROM invoices WHERE invoice_id = ?',
      [parsedInvoiceId]
    );

    const invoice = updatedInvoices[0];

    return res.json({
      message: 'Invoice marked as paid',
      invoice: {
        invoice_id: invoice.invoice_id,
        status: invoice.status,
        paid_at: new Date(invoice.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      }
    });
  } catch (err) {
    console.error('Error in markInvoicePaid:', err.message);
    return res.status(500).json({
      error: 'Failed to update invoice',
      message: err.message
    });
  }
}

/**
 * GET /api/billing/summary/:providerId
 * Get billing summary for a provider
 */
async function getBillingSummary(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);

    // Get outstanding amount
    const [outstanding] = await pool.query(
      `SELECT SUM(total_amount) as total FROM invoices 
       WHERE provider_id = ? AND status = 'PENDING'`,
      [parsedProviderId]
    );

    const [totalPaid] = await pool.query(
      `SELECT SUM(total_amount) as total FROM invoices 
       WHERE provider_id = ? AND status = 'PAID'`,
      [parsedProviderId]
    );

    const [usageRows] = await pool.query(
      `SELECT * FROM current_usage WHERE provider_id = ?`,
      [parsedProviderId]
    );

    const usage = usageRows[0] || null;

    return res.json({
      provider_id: parsedProviderId,
      current_usage: usage ? {
        billing_period: formatDate(new Date(usage.billing_period)),
        successful_reservations_current_month: usage.successful_reservations,
        monthly_fee: parseFloat(usage.monthly_fee),
        reservation_price: parseFloat(usage.reservation_price),
        estimated_amount: parseFloat(usage.estimated_amount)
      } : null,
      outstanding_amount: parseFloat(outstanding[0].total || 0),
      total_paid: parseFloat(totalPaid[0].total || 0),
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Error in getBillingSummary:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch billing summary',
      message: err.message
    });
  }
}

/**
 * Health check endpoint
 */
async function healthCheck(req, res) {
  try {
    const [countEvents] = await pool.query('SELECT COUNT(*) AS total FROM billable_events');
    const [countInvoices] = await pool.query('SELECT COUNT(*) AS total FROM invoices');

    return res.json({
      status: 'healthy',
      service: 'billing-service',
      port: process.env.PORT || 3103,
      database: process.env.DB_NAME || 'billing_db',
      totalBillableEvents: Number(countEvents[0].total || 0),
      totalInvoices: Number(countInvoices[0].total || 0),
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });
  } catch (err) {
    return res.status(503).json({
      status: 'error',
      service: 'billing-service',
      message: err.message
    });
  }
}

/**
 * UC07: Process payment for invoice
 * POST /api/billing/invoices/:providerId/:invoiceId/pay
 * Enhanced payment processing with validation and history
 */
async function processPayment(req, res) {
  try {
    const { providerId, invoiceId } = req.params;
    const { paymentMethod = 'bank_transfer', reference, notes } = req.body;

    if (!providerId || !invoiceId || isNaN(parseInt(providerId, 10)) || isNaN(parseInt(invoiceId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId or invoiceId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const parsedInvoiceId = parseInt(invoiceId, 10);

    // Verify invoice belongs to provider and get amount
    const [invoices] = await pool.query(
      'SELECT * FROM invoices WHERE invoice_id = ? AND provider_id = ?',
      [parsedInvoiceId, parsedProviderId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        error: 'Invoice not found'
      });
    }

    const invoice = invoices[0];

    // Check if already paid
    if ((invoice.status || '').toString().toUpperCase() === 'PAID') {
      return res.status(400).json({
        error: 'Invoice already paid',
        paid_at: new Date(invoice.paid_at).toLocaleDateString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      });
    }

    // Check if overdue
    const isOverdue = new Date() > new Date(invoice.due_date);

    // Update invoice status to paid
    await pool.query(
      'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE invoice_id = ?',
      ['PAID', parsedInvoiceId]
    );

    // Create payment record (idempotent for same invoice)
    try {
      await pool.query(
        `INSERT INTO payment_history (invoice_id, provider_id, amount, payment_method, reference, status, notes, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          parsedInvoiceId,
          parsedProviderId,
          invoice.total_amount,
          paymentMethod,
          reference || null,
          'completed',
          notes || null
        ]
      );
    } catch (e) {
      // If payment_history exists but duplicate insert happens, ignore.
      if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').toLowerCase().includes('duplicate'))) {
        console.log('Duplicate payment_history insert ignored');
      } else {
        console.warn('Failed to insert payment_history record:', e.message);
      }
    }

    // Publish payment processed event to broker
    await publishBrokerEvent('payment.processed', {
      invoiceId: parsedInvoiceId,
      providerId: parsedProviderId,
      amount: parseFloat(invoice.total_amount),
      currency: 'EUR',
      paymentMethod,
      reference: reference || null,
      notes: notes || null
    });

    const [updatedInvoices] = await pool.query(
      'SELECT * FROM invoices WHERE invoice_id = ?',
      [parsedInvoiceId]
    );

    const updatedInvoice = updatedInvoices[0];

    return res.json({
      success: true,
      message: 'Payment processed successfully',
      invoice: {
        invoice_id: updatedInvoice.invoice_id,
        provider_id: updatedInvoice.provider_id,
        amount: parseFloat(updatedInvoice.grand_total || updatedInvoice.total_amount),
        currency: 'EUR',
        status: updatedInvoice.status,
        payment_method: paymentMethod,
        reference: reference || null,
        paid_at: new Date(updatedInvoice.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }),
        was_overdue: isOverdue
      },
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });

  } catch (err) {
    console.error('Error in processPayment:', err.message);
    return res.status(500).json({
      error: 'Payment processing failed',
      message: err.message
    });
  }
}

/**
 * Webhook endpoint for payment.processed events from broker
 * POST /api/webhooks/payment-processed
 * Receives payment confirmation and updates invoice status
 */
async function handlePaymentProcessedWebhook(req, res) {
  try {
    const { eventType, data } = req.body;

    if (eventType !== 'payment.processed') {
      return res.status(400).json({
        error: 'Wrong event type for this webhook',
        expected: 'payment.processed',
        received: eventType
      });
    }

    if (!data || !data.invoiceId) {
      return res.status(400).json({
        error: 'Invalid payment event payload',
        requiredFields: ['invoiceId', 'providerId', 'amount']
      });
    }

    const { invoiceId, providerId, amount } = data;

    // Verify invoice and update status
    const [invoices] = await pool.query(
      'SELECT * FROM invoices WHERE invoice_id = ? AND provider_id = ?',
      [invoiceId, providerId]
    );

    if (invoices.length === 0) {
      return res.status(404).json({
        error: 'Invoice not found for payment'
      });
    }

    const invoice = invoices[0];

    if ((invoice.status || '').toString().toUpperCase() === 'PAID') {
      return res.json({
        message: 'Invoice already marked as paid',
        invoiceId: invoiceId,
        status: invoice.status
      });
    }

    // Mark invoice as paid
    await pool.query(
      'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE invoice_id = ?',
      ['PAID', invoiceId]
    );

    // Record payment in payment_history if not already done
    try {
      await pool.query(
        `INSERT INTO payment_history (invoice_id, provider_id, amount, payment_method, status, notes, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          invoiceId,
          providerId,
          amount || parseFloat(invoice.total_amount),
          'payment.processed',
          'completed',
          'Processed via broker webhook'
        ]
      );
    } catch (e) {
      // Payment already recorded, ignore duplicate
      if (!(e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').toLowerCase().includes('duplicate')))) {
        console.warn('Non-duplicate payment_history insert error:', e.message);
      }
    }

    console.log(`Invoice ${invoiceId} marked as PAID via payment.processed webhook`);

    return res.json({
      success: true,
      message: 'Payment webhook processed successfully',
      invoiceId,
      providerId,
      status: 'PAID'
    });

  } catch (err) {
    console.error('Error in handlePaymentProcessedWebhook:', err.message);
    return res.status(500).json({
      error: 'Webhook processing failed',
      message: err.message
    });
  }
}

/**
 * UC07: Get payment history for provider
 * GET /api/billing/provider/:providerId/payments
 * Returns list of all payments made by provider
 */
async function getProviderPaymentHistory(req, res) {
  try {
    const { providerId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const parsedLimit = Math.min(parseInt(limit, 10) || 50, 500);
    const parsedOffset = parseInt(offset, 10) || 0;

    // Try to get from payment_history table
    let payments = [];
    try {
      const [records] = await pool.query(
        `SELECT 
          payment_id,
          invoice_id,
          provider_id,
          amount,
          payment_method,
          reference,
          status,
          notes,
          paid_at
         FROM payment_history
         WHERE provider_id = ?
         ORDER BY paid_at DESC
         LIMIT ? OFFSET ?`,
        [parsedProviderId, parsedLimit, parsedOffset]
      );
      payments = records;
    } catch (e) {
      // Fallback: get from invoices where status = paid
      const [records] = await pool.query(
        `SELECT 
          invoice_id as payment_id,
          invoice_id,
          provider_id,
          total_amount as amount,
          'unknown' as payment_method,
          null as reference,
          status,
          null as notes,
          paid_at
         FROM invoices
         WHERE provider_id = ? AND UPPER(status) = 'PAID'
         ORDER BY paid_at DESC
         LIMIT ? OFFSET ?`,
        [parsedProviderId, parsedLimit, parsedOffset]
      );
      payments = records;
    }

    // Calculate totals
    const totalAmount = payments.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

    return res.json({
      provider_id: parsedProviderId,
      total_payments: payments.length,
      total_amount_paid: totalAmount,
      currency: 'EUR',
      payments: payments.map(p => ({
        payment_id: p.payment_id,
        invoice_id: p.invoice_id,
        amount: parseFloat(p.amount),
        payment_method: p.payment_method || 'unknown',
        reference: p.reference,
        status: p.status,
        paid_at: p.paid_at ? (p.paid_at instanceof Date ? new Date(p.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }) : new Date(p.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })) : null,
        notes: p.notes
      })),
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });

  } catch (err) {
    console.error('Error in getProviderPaymentHistory:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch payment history',
      message: err.message
    });
  }
}

/**
 * GET /api/billing/outstanding/:providerId
 * Get all outstanding (unpaid) invoices for a provider
 */
async function getOutstandingInvoices(req, res) {
  try {
    const { providerId } = req.params;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);

    const [invoices] = await pool.query(
      `SELECT * FROM invoices
       WHERE provider_id = ? AND UPPER(status) = 'PENDING'
       ORDER BY due_date ASC`,
      [parsedProviderId]
    );

    // Calculate totals
    const totalOutstanding = invoices.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);
    const overdue = invoices.filter(inv => new Date() > new Date(inv.due_date));
    const totalOverdue = overdue.reduce((sum, inv) => sum + parseFloat(inv.total_amount || 0), 0);

    return res.json({
      provider_id: parsedProviderId,
      total_outstanding_invoices: invoices.length,
      total_outstanding_amount: totalOutstanding,
      overdue_invoices: overdue.length,
      total_overdue_amount: totalOverdue,
      invoices: invoices.map(inv => ({
        invoice_id: inv.invoice_id,
        amount: parseFloat(inv.total_amount),
        status: inv.status,
        due_date: new Date(inv.due_date).toLocaleDateString('el-GR'),
        issued_at: new Date(inv.issued_at).toLocaleDateString('el-GR'),
        days_overdue: new Date() > new Date(inv.due_date) ? Math.floor((new Date() - new Date(inv.due_date)) / (1000 * 60 * 60 * 24)) : 0
      })),
      currency: 'EUR',
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
    });

  } catch (err) {
    console.error('Error in getOutstandingInvoices:', err.message);
    return res.status(500).json({
      error: 'Failed to fetch outstanding invoices',
      message: err.message
    });
  }
}

module.exports = {
  getProviderInvoice,
  getProviderInvoices,
  markInvoicePaid,
  processPayment,
  handlePaymentProcessedWebhook,
  getProviderPaymentHistory,
  getOutstandingInvoices,
  getBillingSummary,
  healthCheck,
  refreshCurrentUsageForAllProviders,
  generateMonthlyInvoicesForAllProviders,
  scheduleDailyBillingTasks,
  subscribeToBrokerEvent,
  publishBrokerEvent
};
