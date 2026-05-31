import { useState, useEffect } from 'react';
import { analyticsAPI, billingAPI, reservationAPI } from '../utils/apiClient';

const ProviderDashboard = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState({
    totalStations: 0,
    activeStations: 0,
    totalReservations: 0,
    revenue: 0,
    utilization: 0
  });
  const [dailyRecords, setDailyRecords] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [outstandingInvoices, setOutstandingInvoices] = useState([]);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [invoiceStatus, setInvoiceStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [payingInvoiceId, setPayingInvoiceId] = useState(null);
  const [selectedStation, setSelectedStation] = useState(null);
  const [loading, setLoading] = useState(true);

  const providerId = localStorage.getItem('providerId') || '1';
  const providerName = localStorage.getItem('providerName') || localStorage.getItem('username') || `Provider ${providerId}`;

  useEffect(() => {
    fetchProviderData();
  }, []);

  const fetchProviderData = async () => {
    setLoading(true);
    setInvoiceStatus('');

    try {
      const analyticsResult = await analyticsAPI.getProviderAnalytics(providerId, { period: 'monthly' });
      const dailyResult = await analyticsAPI.getDailyAnalytics(providerId);
      const billingSummaryResult = await billingAPI.getSummary(providerId);
      const outstandingResult = await billingAPI.getOutstandingInvoices(providerId);
      const paymentHistoryResult = await billingAPI.getInvoiceHistory(providerId, 12);
      const reservationResult = await reservationAPI.getAll();

      const summary = analyticsResult.success ? analyticsResult.data.summary || analyticsResult.data : {};
      setAnalytics({
        totalStations: summary.stations_count || summary.total_stations || 0,
        activeStations: summary.active_stations || summary.activeStations || 0,
        totalReservations: summary.total_reservations || summary.reservations || 0,
        revenue: billingSummaryResult.success ? billingSummaryResult.data.summary?.total_paid || billingSummaryResult.data.summary?.total_revenue || 0 : 0,
        utilization: summary.utilization_rate || summary.utilization || 0
      });

      setDailyRecords(dailyResult.success ? dailyResult.data.daily_records || dailyResult.data || [] : []);
      setOutstandingInvoices(outstandingResult.success ? outstandingResult.data.invoices || [] : []);
      setPaymentHistory(paymentHistoryResult.success ? paymentHistoryResult.data.payments || paymentHistoryResult.data.history || [] : []);

      if (reservationResult.success) {
        const resolvedReservations = Array.isArray(reservationResult.data?.reservations)
          ? reservationResult.data.reservations
          : [];

        setReservations(
          resolvedReservations.filter((item) =>
            String(item.provider_id) === String(providerId)
            || String(item.provider_name || '').toLowerCase().includes(providerName.toLowerCase())
          )
        );
      } else {
        setReservations([]);
      }
    } catch (err) {
      console.error('Error fetching provider data:', err);
      setAnalytics({
        totalStations: 0,
        activeStations: 0,
        totalReservations: 0,
        revenue: 0,
        utilization: 0
      });
      setDailyRecords([]);
      setOutstandingInvoices([]);
      setPaymentHistory([]);
      setReservations([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportLogs = async () => {
    setExporting(true);
    setInvoiceStatus('');

    try {
      const response = await analyticsAPI.exportLogs(providerId, 'csv');
      if (!response.success) {
        throw new Error(response.error || 'Failed to export logs');
      }

      const fileData = response.data instanceof Blob ? response.data : new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(fileData);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `provider-${providerId}-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      setInvoiceStatus('Export completed successfully.');
    } catch (err) {
      console.error(err);
      setInvoiceStatus('Unable to export logs. Please try again later.');
    } finally {
      setExporting(false);
    }
  };

  const handleRequestInvoice = async () => {
    setInvoiceStatus('');

    try {
      const response = await analyticsAPI.requestInvoice(providerId);
      if (!response.success) {
        throw new Error(response.error || 'Unable to request invoice');
      }
      setInvoiceStatus(response.data?.message || 'Invoice request submitted successfully.');
      await fetchProviderData();
    } catch (err) {
      console.error(err);
      setInvoiceStatus('Invoice request failed. Please try again.');
    }
  };

  const handlePayInvoice = async (invoiceId) => {
    setPayingInvoiceId(invoiceId);
    try {
      const response = await billingAPI.processPayment(providerId, invoiceId, {
        paymentMethod: 'bank_transfer',
        reference: `frontend-${invoiceId}`
      });
      if (!response.success) {
        throw new Error(response.error || 'Payment failed');
      }
      setInvoiceStatus('Payment completed successfully.');
      await fetchProviderData();
    } catch (err) {
      console.error(err);
      setInvoiceStatus('Payment could not be processed.');
    } finally {
      setPayingInvoiceId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setToken(null);
  };

  const StatCard = ({ title, value, unit, icon, color }) => (
    <div className="col-md-6 col-lg-3 mb-3">
      <div className={`card border-start border-${color} border-5 h-100`}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <p className="text-muted small mb-1">{title}</p>
              <h4 className="mb-0">{value}</h4>
              {unit && <small className="text-muted">{unit}</small>}
            </div>
            <span className="fs-3">{icon}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-vh-100" style={{ backgroundColor: '#f8f9fa' }}>
      {/* Header */}
      <nav className="navbar navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">🏢 Provider Dashboard</span>
          <div className="d-flex gap-2">
            <span className="text-light">{localStorage.getItem('username')}</span>
            <button className="btn btn-outline-light btn-sm" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </nav>

      <div className="container-fluid p-4">
        {/* Tabs */}
        <ul className="nav nav-tabs mb-4" role="tablist">
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              type="button"
            >
              📊 Overview
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'stations' ? 'active' : ''}`}
              onClick={() => setActiveTab('stations')}
              type="button"
            >
              ⚡ Stations
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'reservations' ? 'active' : ''}`}
              onClick={() => setActiveTab('reservations')}
              type="button"
            >
              📅 Reservations
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
              type="button"
            >
              📈 Reports
            </button>
          </li>
        </ul>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <h3 className="mb-4">Dashboard Overview</h3>
            
            {loading ? (
              <div className="text-center p-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <>
                <div className="row mb-4">
                  <StatCard
                    title="Total Stations"
                    value={analytics.totalStations || 0}
                    unit="units"
                    icon="🏗️"
                    color="primary"
                  />
                  <StatCard
                    title="Active Stations"
                    value={analytics.activeStations || 0}
                    unit="online"
                    icon="✅"
                    color="success"
                  />
                  <StatCard
                    title="Total Reservations"
                    value={analytics.totalReservations || 0}
                    unit="bookings"
                    icon="📅"
                    color="info"
                  />
                  <StatCard
                    title="Revenue"
                    value={`€${(analytics.revenue || 0).toFixed(2)}`}
                    unit="this month"
                    icon="💰"
                    color="warning"
                  />
                </div>

                <div className="row">
                  <div className="col-lg-8">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">Network Utilization</h5>
                      </div>
                      <div className="card-body">
                        <div className="progress mb-3" style={{ height: '30px' }}>
                          <div
                            className="progress-bar bg-success"
                            role="progressbar"
                            style={{ width: `${analytics.utilization || 0}%` }}
                          >
                            {analytics.utilization || 0}%
                          </div>
                        </div>
                        <p className="text-muted mb-0">
                          Your stations are at {analytics.utilization || 0}% capacity utilization.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-4">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">Quick Actions</h5>
                      </div>
                      <div className="card-body">
                        <button className="btn btn-primary w-100 mb-2">
                          + Add New Station
                        </button>
                        <button className="btn btn-outline-primary w-100 mb-2">
                          📋 View Reports
                        </button>
                        <button className="btn btn-outline-primary w-100">
                          ⚙️ Settings
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Stations Tab */}
        {activeTab === 'stations' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3>Charging Stations</h3>
              <button className="btn btn-primary">+ Add Station</button>
            </div>

            {dailyRecords.length === 0 ? (
              <div className="alert alert-info text-center p-5">
                <p>No station analytics available yet.</p>
              </div>
            ) : (
              <div className="row">
                {dailyRecords.map((record, index) => (
                  <div key={`station-${index}`} className="col-md-6 col-lg-4 mb-3">
                    <div
                      className="card cursor-pointer"
                      onClick={() => setSelectedStation(record)}
                      style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                    >
                      <div className="card-body">
                        <h5 className="card-title">{record.station_name || `Station ${index + 1}`}</h5>
                        <p className="card-text text-muted small mb-2">{record.location || 'Provider Station'}</p>
                        <div className="mb-3">
                          <span className={`badge bg-${record.status === 'active' ? 'success' : 'warning'}`}>
                            {record.status === 'active' ? '🟢 Active' : '🟡 Maintenance'}
                          </span>
                        </div>

                        <div className="small">
                          <p className="mb-1">
                            <strong>Reservations:</strong> {record.total_reservations ?? record.reservations ?? 0}
                          </p>
                          <p className="mb-1">
                            <strong>Searches:</strong> {record.total_searches ?? record.searches ?? 0}
                          </p>
                          <p className="mb-0">
                            <strong>Utilization:</strong> {record.utilization_rate ?? record.utilization ?? 0}%
                          </p>
                        </div>
                      </div>
                      <div className="card-footer bg-light">
                        <button className="btn btn-sm btn-outline-primary w-100">View Details</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedStation && (
              <div className="modal d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                <div className="modal-dialog">
                  <div className="modal-content">
                    <div className="modal-header">
                      <h5 className="modal-title">{selectedStation.station_name || 'Station details'}</h5>
                      <button type="button" className="btn-close" onClick={() => setSelectedStation(null)}></button>
                    </div>
                    <div className="modal-body">
                      <p><strong>Status:</strong> {selectedStation.status || 'active'}</p>
                      <p><strong>Location:</strong> {selectedStation.location || 'Unknown'}</p>
                      <p><strong>Reservations:</strong> {selectedStation.total_reservations ?? selectedStation.reservations ?? 0}</p>
                      <p><strong>Searches:</strong> {selectedStation.total_searches ?? selectedStation.searches ?? 0}</p>
                      <p><strong>Utilization:</strong> {selectedStation.utilization_rate ?? selectedStation.utilization ?? 0}%</p>
                    </div>
                    <div className="modal-footer">
                      <button type="button" className="btn btn-secondary" onClick={() => setSelectedStation(null)}>Close</button>
                      <button type="button" className="btn btn-primary">Edit Station</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reservations Tab */}
        {activeTab === 'reservations' && (
          <div>
            <h3 className="mb-4">Reservations</h3>
            <div className="card">
              <div className="card-body">
                {reservations.length === 0 ? (
                  <div className="alert alert-info text-center p-5">
                    <p>No reservation history available yet.</p>
                  </div>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-hover">
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Station</th>
                          <th>User</th>
                          <th>Duration</th>
                          <th>Price</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reservations.map((reservation) => (
                          <tr key={reservation.reservation_id || `${reservation.point_id}-${reservation.user_id}`}>
                            <td>{new Date(reservation.created_at || reservation.timestamp || Date.now()).toLocaleDateString()}</td>
                            <td>{reservation.station_name || reservation.provider_name || `Point ${reservation.point_id}`}</td>
                            <td>{reservation.user_id || reservation.user_name || 'Guest'}</td>
                            <td>{reservation.duration ? `${reservation.duration} min` : 'N/A'}</td>
                            <td>{reservation.price ? `€${reservation.price.toFixed(2)}` : 'N/A'}</td>
                            <td>
                              <span className={`badge bg-${reservation.status === 'completed' ? 'success' : reservation.status === 'in_progress' ? 'info' : 'secondary'}`}>
                                {reservation.status || 'unknown'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            <h3 className="mb-4">Reports & Analytics</h3>
            <div className="row mb-4">
              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Billing Summary</h5>
                  </div>
                  <div className="card-body">
                    <p className="text-muted small">Outstanding Invoices</p>
                    <h3>{outstandingInvoices.length}</h3>
                    <p className="text-muted small">Total Due</p>
                    <h4>€{outstandingInvoices.reduce((sum, invoice) => sum + (invoice.amount || 0), 0).toFixed(2)}</h4>
                    <button className="btn btn-primary mt-3" onClick={handleRequestInvoice}>
                      Request Invoice
                    </button>
                  </div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card h-100">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Export Logs</h5>
                  </div>
                  <div className="card-body">
                    <p className="text-muted small">Download provider analytics logs for review.</p>
                    <button className="btn btn-outline-primary" onClick={handleExportLogs} disabled={exporting}>
                      {exporting ? 'Exporting...' : 'Export CSV'}
                    </button>
                    {invoiceStatus && <p className="text-success mt-3">{invoiceStatus}</p>}
                  </div>
                </div>
              </div>
            </div>

            <div className="row">
              <div className="col-lg-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Outstanding Invoices</h5>
                  </div>
                  <div className="card-body p-0">
                    {outstandingInvoices.length === 0 ? (
                      <div className="p-4 text-center text-muted">No outstanding invoices.</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-bordered mb-0">
                          <thead>
                            <tr>
                              <th>Invoice</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {outstandingInvoices.map((invoice) => (
                              <tr key={invoice.invoice_id || invoice.id}>
                                <td>{invoice.invoice_id || invoice.id}</td>
                                <td>€{(invoice.amount || 0).toFixed(2)}</td>
                                <td>{invoice.status || 'pending'}</td>
                                <td>
                                  <button
                                    className="btn btn-sm btn-success"
                                    onClick={() => handlePayInvoice(invoice.invoice_id || invoice.id)}
                                    disabled={payingInvoiceId === (invoice.invoice_id || invoice.id)}
                                  >
                                    {payingInvoiceId === (invoice.invoice_id || invoice.id) ? 'Paying...' : 'Pay'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="col-lg-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Payment History</h5>
                  </div>
                  <div className="card-body p-0">
                    {paymentHistory.length === 0 ? (
                      <div className="p-4 text-center text-muted">No payment history available.</div>
                    ) : (
                      <div className="table-responsive">
                        <table className="table table-bordered mb-0">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Reference</th>
                              <th>Amount</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {paymentHistory.map((payment) => (
                              <tr key={payment.payment_id || payment.id || payment.reference}>
                                <td>{new Date(payment.paid_at || payment.date || Date.now()).toLocaleDateString()}</td>
                                <td>{payment.reference || payment.invoice_id || '–'}</td>
                                <td>€{(payment.amount || 0).toFixed(2)}</td>
                                <td>{payment.status || 'completed'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProviderDashboard;
