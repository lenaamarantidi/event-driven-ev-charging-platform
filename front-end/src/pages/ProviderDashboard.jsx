import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyticsAPI, billingAPI } from '../utils/apiClient';

const emptyKpis = {
  providerId: null,
  registeredSince: null,
  totalReservations: 0,
  successfulReservations: 0,
  failedReservations: 0,
  uniqueUsers: 0,
  successRate: 0
};

const emptyPeriodStats = {
  totalReservations: 0,
  successfulReservations: 0,
  failedReservations: 0,
  uniqueUsers: 0,
  successRate: 0
};

const periodLabels = {
  day: 'Day',
  week: 'Week',
  month: 'Month'
};

const toNumber = (value) => Number(value || 0);

const formatNumber = (value) => new Intl.NumberFormat('en-US').format(toNumber(value));

const formatPercent = (value) => `${toNumber(value).toFixed(1)}%`;

const formatDate = (value) => {
  if (!value) {
    return 'Not available';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

const toDateInputValue = (date) => date.toISOString().slice(0, 10);

const getPeriodRange = (period) => {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === 'week') {
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    start.setDate(diff);
  }

  if (period === 'month') {
    start.setDate(1);
  }

  const end = new Date(start);
  if (period === 'day') {
    end.setDate(start.getDate() + 1);
  } else if (period === 'week') {
    end.setDate(start.getDate() + 7);
  } else {
    end.setMonth(start.getMonth() + 1);
  }

  return {
    startDate: toDateInputValue(start),
    endDate: toDateInputValue(end)
  };
};

const normalizeLogs = (payload) => {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload?.logs)) {
    return payload.logs;
  }

  if (Array.isArray(payload?.data)) {
    return payload.data;
  }

  return [];
};

const calculatePeriodStats = (logs) => {
  const userIds = new Set();
  let successfulReservations = 0;
  let failedReservations = 0;

  logs.forEach((log) => {
    const status = String(log.status || '').toLowerCase();

    if (status === 'success' || status === 'successful' || status === 'completed') {
      successfulReservations += 1;
    }

    if (status === 'failed' || status === 'failure' || status === 'cancelled') {
      failedReservations += 1;
    }

    const userId = log.userId ?? log.user_id;
    if (userId !== undefined && userId !== null && userId !== '') {
      userIds.add(String(userId));
    }
  });

  const totalReservations = logs.length;

  return {
    totalReservations,
    successfulReservations,
    failedReservations,
    uniqueUsers: userIds.size,
    successRate: totalReservations > 0 ? (successfulReservations / totalReservations) * 100 : 0
  };
};

const buildChartRows = (primaryRows = [], secondaryRows = [], secondaryKey = 'secondary') => {
  const rowsByMonth = new Map();

  primaryRows.forEach((row) => {
    rowsByMonth.set(row.month, {
      month: row.month,
      primary: toNumber(row.count)
    });
  });

  secondaryRows.forEach((row) => {
    const existing = rowsByMonth.get(row.month) || { month: row.month, primary: 0 };
    rowsByMonth.set(row.month, {
      ...existing,
      [secondaryKey]: toNumber(row.count)
    });
  });

  return Array.from(rowsByMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
};

const StatCard = ({ title, value, unit, tone = 'primary' }) => (
  <div className="col-md-6 col-xl-3 mb-3">
    <div className={`analytics-card analytics-card-${tone}`}>
      <p className="analytics-card-label">{title}</p>
      <h3>{value}</h3>
      {unit && <span>{unit}</span>}
    </div>
  </div>
);

const BarChart = ({ title, rows, valueKey, emptyText }) => {
  const maxValue = Math.max(...rows.map((row) => toNumber(row[valueKey])), 0);

  return (
    <div className="analytics-panel h-100">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">{title}</h5>
        <span className="analytics-subtle">Last 6 months</span>
      </div>

      {rows.length === 0 ? (
        <div className="analytics-empty">{emptyText}</div>
      ) : (
        <div className="analytics-bars">
          {rows.map((row) => {
            const value = toNumber(row[valueKey]);
            const height = maxValue > 0 ? Math.max((value / maxValue) * 100, 6) : 6;

            return (
              <div className="analytics-bar-item" key={`${valueKey}-${row.month}`}>
                <div className="analytics-bar-value">{formatNumber(value)}</div>
                <div className="analytics-bar-track">
                  <div className="analytics-bar-fill" style={{ height: `${height}%` }} />
                </div>
                <div className="analytics-bar-label">{row.month}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const ProviderDashboard = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [providerKpis, setProviderKpis] = useState(emptyKpis);
  const [periodStats, setPeriodStats] = useState(emptyPeriodStats);
  const [timeseries, setTimeseries] = useState({
    reservationsPerMonth: [],
    usersPerMonth: []
  });
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState('');
  const [periodError, setPeriodError] = useState('');
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceData, setInvoiceData] = useState(null);
  const [invoiceHistory, setInvoiceHistory] = useState([]);
  const [invoiceError, setInvoiceError] = useState('');
  const [paymentLoading, setPaymentLoading] = useState(false);

  const providerId = localStorage.getItem('providerId') || '1';

  const chartRows = useMemo(
    () => buildChartRows(timeseries.reservationsPerMonth, timeseries.usersPerMonth, 'uniqueUsers'),
    [timeseries]
  );

  const fetchAnalyticsSummary = useCallback(async () => {
    try {
      setAnalyticsLoading(true);
      setAnalyticsError('');

      const [kpisResult, timeseriesResult] = await Promise.all([
        analyticsAPI.getProviderAnalytics(providerId),
        analyticsAPI.getProviderTimeseries(providerId)
      ]);

      if (kpisResult.success) {
        setProviderKpis({
          providerId: kpisResult.data.providerId ?? providerId,
          registeredSince: kpisResult.data.registeredSince ?? null,
          totalReservations: toNumber(kpisResult.data.totalReservations),
          successfulReservations: toNumber(kpisResult.data.successfulReservations),
          failedReservations: toNumber(kpisResult.data.failedReservations),
          uniqueUsers: toNumber(kpisResult.data.uniqueUsers),
          successRate: toNumber(kpisResult.data.successRate)
        });
      } else {
        setAnalyticsError(kpisResult.error || 'Could not load provider analytics.');
      }

      if (timeseriesResult.success) {
        setTimeseries({
          reservationsPerMonth: timeseriesResult.data.reservationsPerMonth || [],
          usersPerMonth: timeseriesResult.data.usersPerMonth || []
        });
      } else {
        setAnalyticsError((current) => current || timeseriesResult.error || 'Could not load analytics timeseries.');
      }
    } catch {
      setAnalyticsError('Could not load provider analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  }, [providerId]);

  const fetchPeriodStats = useCallback(async (period) => {
    try {
      setPeriodLoading(true);
      setPeriodError('');

      const { startDate, endDate } = getPeriodRange(period);
      const result = await analyticsAPI.exportLogs(providerId, 'json', startDate, endDate);

      if (result.success) {
        setPeriodStats(calculatePeriodStats(normalizeLogs(result.data)));
      } else {
        setPeriodStats(emptyPeriodStats);
        setPeriodError(result.error || 'Could not load period analytics.');
      }
    } catch {
      setPeriodStats(emptyPeriodStats);
      setPeriodError('Could not load period analytics.');
    } finally {
      setPeriodLoading(false);
    }
  }, [providerId]);

  useEffect(() => {
    fetchAnalyticsSummary();
  }, [fetchAnalyticsSummary]);

  useEffect(() => {
    fetchPeriodStats(selectedPeriod);
  }, [fetchPeriodStats, selectedPeriod]);

  const fetchInvoiceData = async () => {
    try {
      setInvoiceLoading(true);
      setInvoiceError('');

      const result = await billingAPI.getInvoice(providerId);
      if (result.success) {
        setInvoiceData(result.data);
      } else {
        setInvoiceError(result.error || 'No invoice found.');
      }

      const historyResult = await billingAPI.getInvoiceHistory(providerId);
      if (historyResult.success) {
        setInvoiceHistory(historyResult.data.invoices || []);
      }
    } catch {
      setInvoiceError('Error loading invoice data.');
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handleRequestPayment = async () => {
    if (!invoiceData?.invoice_id) {
      setInvoiceError('No invoice is selected for payment.');
      return;
    }

    try {
      setPaymentLoading(true);
      setInvoiceError('');

      const result = await billingAPI.processPayment(providerId, invoiceData.invoice_id, {
        paymentMethod: 'bank_transfer'
      });

      if (result.success) {
        await fetchInvoiceData();
      } else {
        setInvoiceError(result.error || 'Payment request failed.');
      }
    } catch {
      setInvoiceError('Error processing payment request.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    localStorage.removeItem('providerId');
    setToken(null);
  };

  return (
    <div className="min-vh-100 analytics-shell">
      <nav className="navbar navbar-dark sticky-top">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">Provider Dashboard</span>
          <div className="d-flex gap-2 align-items-center">
            <span className="text-light">{localStorage.getItem('username')}</span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="container-fluid p-4">
        <ul className="nav nav-tabs mb-4" role="tablist">
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
              type="button"
            >
              Analytics
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'invoices' ? 'active' : ''}`}
              onClick={() => setActiveTab('invoices')}
              type="button"
            >
              Invoices
            </button>
          </li>
        </ul>

        {activeTab === 'analytics' && (
          <section>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
              <div>
                <h3 className="mb-1">Analytics</h3>
                <p className="analytics-subtle mb-0">
                  Provider #{providerId} · Registered since {formatDate(providerKpis.registeredSince)}
                </p>
              </div>
              <button className="btn btn-outline-light btn-sm" onClick={fetchAnalyticsSummary} disabled={analyticsLoading}>
                Refresh
              </button>
            </div>

            {analyticsError && <div className="alert alert-warning">{analyticsError}</div>}

            {analyticsLoading ? (
              <div className="text-center p-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <>
                <div className="row mb-4">
                  <StatCard
                    title="Total Reservations"
                    value={formatNumber(providerKpis.totalReservations)}
                    unit="since registration"
                    tone="primary"
                  />
                  <StatCard
                    title="Successful Reservations"
                    value={formatNumber(providerKpis.successfulReservations)}
                    unit="completed"
                    tone="success"
                  />
                  <StatCard
                    title="Failed Reservations"
                    value={formatNumber(providerKpis.failedReservations)}
                    unit="not completed"
                    tone="danger"
                  />
                  <StatCard
                    title="Unique Users"
                    value={formatNumber(providerKpis.uniqueUsers)}
                    unit="with reservations"
                    tone="info"
                  />
                </div>

                <div className="analytics-panel mb-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <div>
                      <h5 className="mb-1">Period Statistics</h5>
                      <p className="analytics-subtle mb-0">
                        {periodLabels[selectedPeriod]} analytics are calculated from Analytics Service reservation logs.
                      </p>
                    </div>
                    <div className="btn-group" role="group" aria-label="Period selector">
                      {Object.entries(periodLabels).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`btn btn-sm ${selectedPeriod === value ? 'btn-primary' : 'btn-outline-light'}`}
                          onClick={() => setSelectedPeriod(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {periodError && <div className="alert alert-warning mb-3">{periodError}</div>}

                  <div className="row">
                    <StatCard
                      title="Total"
                      value={periodLoading ? '...' : formatNumber(periodStats.totalReservations)}
                      unit={`${periodLabels[selectedPeriod].toLowerCase()} reservations`}
                      tone="primary"
                    />
                    <StatCard
                      title="Successful"
                      value={periodLoading ? '...' : formatNumber(periodStats.successfulReservations)}
                      unit="reservations"
                      tone="success"
                    />
                    <StatCard
                      title="Failed"
                      value={periodLoading ? '...' : formatNumber(periodStats.failedReservations)}
                      unit="reservations"
                      tone="danger"
                    />
                    <StatCard
                      title="Success Rate"
                      value={periodLoading ? '...' : formatPercent(periodStats.successRate)}
                      unit={`${formatNumber(periodStats.uniqueUsers)} unique users`}
                      tone="info"
                    />
                  </div>
                </div>

                <div className="row g-3">
                  <div className="col-lg-6">
                    <BarChart
                      title="Reservations Per Month"
                      rows={chartRows}
                      valueKey="primary"
                      emptyText="No reservation timeseries returned by Analytics Service."
                    />
                  </div>
                  <div className="col-lg-6">
                    <BarChart
                      title="Unique Users Per Month"
                      rows={chartRows}
                      valueKey="uniqueUsers"
                      emptyText="No user timeseries returned by Analytics Service."
                    />
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {activeTab === 'invoices' && (
          <section>
            <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4">
              <div>
                <h3 className="mb-1">Invoices</h3>
                <p className="analytics-subtle mb-0">Billing information for provider #{providerId}</p>
              </div>
              <button className="btn btn-primary" onClick={fetchInvoiceData} disabled={invoiceLoading}>
                {invoiceLoading ? 'Loading...' : 'Load Invoice'}
              </button>
            </div>

            {invoiceError && <div className="alert alert-danger">{invoiceError}</div>}

            {invoiceLoading ? (
              <div className="text-center p-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : invoiceData ? (
              <>
                <div className="analytics-panel mb-4">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-3">
                    <h5 className="mb-0">Current Invoice</h5>
                    <span className={`badge bg-${invoiceData.status === 'paid' ? 'success' : 'warning'}`}>
                      {invoiceData.status}
                    </span>
                  </div>

                  <div className="row">
                    <div className="col-md-6">
                      <table className="table table-borderless">
                        <tbody>
                          <tr>
                            <td><strong>Invoice ID:</strong></td>
                            <td>{invoiceData.invoice_id}</td>
                          </tr>
                          <tr>
                            <td><strong>Billing Period:</strong></td>
                            <td>{invoiceData.billing_period?.start} - {invoiceData.billing_period?.end}</td>
                          </tr>
                          <tr>
                            <td><strong>Event Count:</strong></td>
                            <td>{invoiceData.event_count}</td>
                          </tr>
                          <tr>
                            <td><strong>Due Date:</strong></td>
                            <td>{invoiceData.due_date}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="col-md-6">
                      <table className="table table-borderless">
                        <tbody>
                          <tr>
                            <td><strong>Subtotal:</strong></td>
                            <td>€{invoiceData.subtotal?.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td><strong>Tax:</strong></td>
                            <td>€{invoiceData.tax_amount?.toFixed(2)}</td>
                          </tr>
                          <tr>
                            <td><strong>Grand Total:</strong></td>
                            <td><h4 className="text-success mb-0">€{invoiceData.grand_total?.toFixed(2)}</h4></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {invoiceData.status !== 'paid' && (
                    <button className="btn btn-success" onClick={handleRequestPayment} disabled={paymentLoading}>
                      {paymentLoading ? 'Processing...' : 'Request Payment'}
                    </button>
                  )}
                </div>

                {invoiceHistory.length > 0 && (
                  <div className="analytics-panel">
                    <h5 className="mb-3">Invoice History</h5>
                    <div className="table-responsive">
                      <table className="table table-hover">
                        <thead>
                          <tr>
                            <th>Invoice ID</th>
                            <th>Period</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Due Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invoiceHistory.map((invoice) => (
                            <tr key={invoice.invoice_id}>
                              <td>{invoice.invoice_id}</td>
                              <td>{invoice.billing_period}</td>
                              <td>€{parseFloat(invoice.grand_total).toFixed(2)}</td>
                              <td>
                                <span className={`badge bg-${invoice.status === 'paid' ? 'success' : 'warning'}`}>
                                  {invoice.status}
                                </span>
                              </td>
                              <td>{invoice.due_date}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="alert alert-info">No invoice data loaded yet.</div>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default ProviderDashboard;
