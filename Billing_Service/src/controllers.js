/**
 * Billing Controllers
 * UC05: View invoice
 * 
 * Generates and serves invoices for providers
 * Invoices are calculated from billable events (reservations)
 */

const { pool } = require('./db');

/**
 * Calculate the current month's invoice data
 */
function getCurrentMonthBillingPeriod() {
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1);
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const dueDate = new Date(endDate);
  dueDate.setDate(dueDate.getDate() + 30); // 30 days payment terms

  return {
    startDate,
    endDate,
    dueDate,
    periodStr: new Date(startDate).toLocaleDateString('el-GR')
  };
}

/**
 * GET /api/billing/invoice/:providerId
 * Get invoice for a provider for the current month
 * Calculates the total amount owed based on billable events
 */
async function getProviderInvoice(req, res) {
  try {
    const { providerId } = req.params;
    const { period = 'current' } = req.query;

    if (!providerId || isNaN(parseInt(providerId, 10))) {
      return res.status(400).json({
        error: 'Invalid providerId'
      });
    }

    const parsedProviderId = parseInt(providerId, 10);
    const billing = getCurrentMonthBillingPeriod();

    // Check if invoice already exists for this period
    const [existingInvoices] = await pool.query(
      `SELECT * FROM invoices 
       WHERE provider_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
      [parsedProviderId, billing.startDate, billing.endDate]
    );

    let invoice;

    if (existingInvoices.length > 0) {
      // Invoice already exists
      invoice = existingInvoices[0];
    } else {
      // Generate new invoice from billable events
      const [events] = await pool.query(
        `SELECT SUM(amount) as total_amount, COUNT(*) as event_count
         FROM billable_events
         WHERE provider_id = ? AND billing_month = ?`,
        [parsedProviderId, billing.periodStr]
      );

      const totalAmount = events[0].total_amount || 0;
      const eventCount = events[0].event_count || 0;
      const taxAmount = totalAmount * 0.21; // 21% VAT
      const grandTotal = totalAmount + taxAmount;

    // Create invoice record
      let result;
      try {
        [result] = await pool.query(
          `INSERT INTO invoices (provider_id, billing_period_start, billing_period_end, total_amount, tax_amount, grand_total, due_date, event_count, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
          [
            parsedProviderId,
            billing.startDate,
            billing.endDate,
            totalAmount,
            taxAmount,
            grandTotal,
            billing.dueDate,
            eventCount
          ]
        );
      } catch (e) {
        // Unique constraint race: invoice got created concurrently. Fetch it.
        if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').toLowerCase().includes('duplicate'))) {
          const [existingAfterInsert] = await pool.query(
            `SELECT * FROM invoices 
             WHERE provider_id = ? AND billing_period_start = ? AND billing_period_end = ?`,
            [parsedProviderId, billing.startDate, billing.endDate]
          );
          invoice = existingAfterInsert[0];
        } else {
          throw e;
        }
      }


      if (!invoice) {
        // Fetch the created invoice
        const [invoices] = await pool.query(
          'SELECT * FROM invoices WHERE invoice_id = ?',
          [result.insertId]
        );

        invoice = invoices[0];

        // Create line item
        if (eventCount > 0) {
          await pool.query(
            `INSERT INTO invoice_line_items (invoice_id, description, quantity, unit_price, line_total)
             VALUES (?, ?, ?, ?, ?)`,
            [
              result.insertId,
              `Reservation Services (${eventCount} reservations)`,
              eventCount,
              totalAmount / eventCount,
              totalAmount
            ]
          );
        }
      }

    }

    // Fetch line items
    const [lineItems] = await pool.query(
      'SELECT * FROM invoice_line_items WHERE invoice_id = ?',
      [invoice.invoice_id]
    );

    return res.json({
      invoice_id: invoice.invoice_id,
      provider_id: invoice.provider_id,
      billing_period: {
        start: new Date(invoice.billing_period_start).toLocaleDateString('el-GR'),
        end: new Date(invoice.billing_period_end).toLocaleDateString('el-GR')
      },
      summary: {
        subtotal: parseFloat(invoice.total_amount),
        tax_amount: parseFloat(invoice.tax_amount),
        tax_rate: '21%',
        grand_total: parseFloat(invoice.grand_total)
      },
      line_items: lineItems.map(item => ({
        description: item.description,
        quantity: item.quantity,
        unit_price: parseFloat(item.unit_price),
        line_total: parseFloat(item.line_total)
      })),
      metadata: {
        status: invoice.status,
        event_count: invoice.event_count,
        issued_at: new Date(invoice.issued_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }),
        due_date: new Date(invoice.due_date).toLocaleDateString('el-GR'),
        paid_at: invoice.paid_at ? new Date(invoice.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false }) : null
      },
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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
        billing_period_start: new Date(inv.billing_period_start).toLocaleDateString('el-GR'),
        billing_period_end: new Date(inv.billing_period_end).toLocaleDateString('el-GR'),
        total_amount: parseFloat(inv.total_amount),
        grand_total: parseFloat(inv.grand_total),
        status: inv.status,
        issued_at: new Date(inv.issued_at).toLocaleDateString('el-GR'),
        due_date: new Date(inv.due_date).toLocaleDateString('el-GR'),
        event_count: inv.event_count
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
      ['paid', parsedInvoiceId]
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
      `SELECT SUM(grand_total) as total FROM invoices 
       WHERE provider_id = ? AND status IN ('draft', 'sent', 'overdue')`,
      [parsedProviderId]
    );

    // Get total paid
    const [totalPaid] = await pool.query(
      `SELECT SUM(grand_total) as total FROM invoices 
       WHERE provider_id = ? AND status = 'paid'`,
      [parsedProviderId]
    );

    // Get recent billable events
    const [recentEvents] = await pool.query(
      `SELECT COUNT(*) as count, SUM(amount) as total FROM billable_events 
       WHERE provider_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      [parsedProviderId]
    );

    return res.json({
      provider_id: parsedProviderId,
      summary: {
        outstanding_amount: parseFloat(outstanding[0].total || 0),
        total_paid: parseFloat(totalPaid[0].total || 0),
        recent_billable_events: recentEvents[0].count || 0,
        recent_events_total: parseFloat(recentEvents[0].total || 0)
      },
      timestamp: new Date().toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
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
    if (invoice.status === 'paid') {
      return res.status(400).json({
        error: 'Invoice already paid',
        paid_at: new Date(invoice.paid_at).toLocaleString('el-GR', { timeZone: 'Europe/Athens', hour12: false })
      });
    }

    // Check if overdue
    const isOverdue = new Date() > new Date(invoice.due_date);

    // Update invoice status to paid
    await pool.query(
      'UPDATE invoices SET status = ?, paid_at = CURRENT_TIMESTAMP WHERE invoice_id = ?',
      ['paid', parsedInvoiceId]
    );

    // Create payment record (idempotent for same invoice)
    try {
      await pool.query(
        `INSERT INTO payment_history (invoice_id, provider_id, amount, payment_method, reference, status, notes, paid_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          parsedInvoiceId,
          parsedProviderId,
          invoice.grand_total,
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
        amount: parseFloat(updatedInvoice.grand_total),
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
          grand_total as amount,
          'unknown' as payment_method,
          null as reference,
          status,
          null as notes,
          paid_at
         FROM invoices
         WHERE provider_id = ? AND status = 'paid'
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
       WHERE provider_id = ? AND status IN ('draft', 'sent', 'overdue')
       ORDER BY due_date ASC`,
      [parsedProviderId]
    );

    // Calculate totals
    const totalOutstanding = invoices.reduce((sum, inv) => sum + parseFloat(inv.grand_total || 0), 0);
    const overdue = invoices.filter(inv => new Date() > new Date(inv.due_date));
    const totalOverdue = overdue.reduce((sum, inv) => sum + parseFloat(inv.grand_total || 0), 0);

    return res.json({
      provider_id: parsedProviderId,
      total_outstanding_invoices: invoices.length,
      total_outstanding_amount: totalOutstanding,
      overdue_invoices: overdue.length,
      total_overdue_amount: totalOverdue,
      invoices: invoices.map(inv => ({
        invoice_id: inv.invoice_id,
        amount: parseFloat(inv.grand_total),
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
  getProviderPaymentHistory,
  getOutstandingInvoices,
  getBillingSummary,
  healthCheck
};
