import { useState, useEffect } from 'react';
import { analyticsAPI, providerAPI, pointsAPI } from '../utils/apiClient';

const PERIOD_OPTIONS = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6months', label: 'Last 6 months' },
  { value: 'yearly', label: 'Last year' },
  { value: 'all', label: 'All time' }
];

const STATUS_OPTIONS = ['all', 'available', 'charging', 'reserved', 'held', 'offline', 'malfunction'];

const toNumber = (value) => Number(value || 0);

const getRankingFailedReservations = (provider) => {
  if (provider.failedReservations !== undefined && provider.failedReservations !== null) {
    return toNumber(provider.failedReservations);
  }
  return Math.max(0, toNumber(provider.totalReservations) - toNumber(provider.successfulReservations));
};

const getRankingSuccessRate = (provider) => {
  if (provider.successRate !== undefined && provider.successRate !== null) {
    return toNumber(provider.successRate);
  }
  const total = toNumber(provider.totalReservations);
  if (total === 0) return 0;
  return Number(((toNumber(provider.successfulReservations) / total) * 100).toFixed(2));
};

const normalizeProviderId = (provider) => (
  provider.provider_id ?? provider.providerId ?? provider.id ?? provider.providerID
);

const normalizeProviderName = (provider) => (
  provider.provider_name ?? provider.providerName ?? provider.name ?? `Provider ${normalizeProviderId(provider)}`
);

const normalizePointStatus = (point) => String(point.status || point.state || 'unknown').toLowerCase();

const getBarWidth = (value, max) => {
  if (!max) return '0%';
  return `${Math.max(4, Math.round((Number(value || 0) / max) * 100))}%`;
};

const OperatorDashboard = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('analytics');
  const [providers, setProviders] = useState([]);
  const [filters, setFilters] = useState({
    providerId: 'all',
    providerName: 'all',
    period: '30d',
    status: 'all',
    startDate: '',
    endDate: ''
  });
  const [systemMetrics, setSystemMetrics] = useState({
    totalProviders: 0,
    totalPoints: 0,
    availablePoints: 0,
    occupiedPoints: 0,
    unavailablePoints: 0,
    totalUsers: 0,
    uniqueUsers: 0,
    totalReservations: 0,
    successfulReservations: 0,
    failedReservations: 0,
    successRate: 0
  });
  const [pointStatusCounts, setPointStatusCounts] = useState({});
  const [timeseries, setTimeseries] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchOperatorData();
  }, [filters]);

  const fetchOperatorData = async () => {
    setLoading(true);
    setError('');
    try {
      const analyticsFilters = {
        providerId: filters.providerId,
        startDate: filters.startDate,
        endDate: filters.endDate
      };
      const pointsFilters = {
        provider: filters.providerName,
        status: filters.status
      };

      const [
        globalAnalyticsResult,
        globalTimeseriesResult,
        globalRankingsResult,
        providersResult,
        pointsResult
      ] = await Promise.all([
        analyticsAPI.getGlobalAnalytics(filters.period, analyticsFilters),
        analyticsAPI.getGlobalTimeseries(filters.period, analyticsFilters),
        analyticsAPI.getGlobalRankings(filters.period, analyticsFilters),
        providerAPI.getAll(),
        pointsAPI.getAll(pointsFilters)
      ]);

      if (!globalAnalyticsResult.success) {
        throw new Error(globalAnalyticsResult.error || 'Global analytics unavailable');
      }

      const providerList = providersResult.success && providersResult.data
        ? providersResult.data.providers || providersResult.data || []
        : [];
      const points = pointsResult.success
        ? pointsResult.data.points || pointsResult.data || []
        : [];
      const statusCounts = points.reduce((acc, point) => {
        const status = normalizePointStatus(point);
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const availablePoints = statusCounts.available || 0;
      const occupiedPoints = ['charging', 'reserved', 'held', 'occupied']
        .reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
      const unavailablePoints = ['offline', 'malfunction', 'unknown']
        .reduce((sum, status) => sum + (statusCounts[status] || 0), 0);
      const data = globalAnalyticsResult.data;

      setProviders(providerList);
      setPointStatusCounts(statusCounts);
      setTimeseries(globalTimeseriesResult.success
        ? globalTimeseriesResult.data.reservationsPerMonth || []
        : []);
      setRankings(globalRankingsResult.success
        ? globalRankingsResult.data.providerRanking || []
        : []);
      setSystemMetrics({
        totalProviders: data.totalProviders || providerList.length || 0,
        totalPoints: points.length,
        availablePoints,
        occupiedPoints,
        unavailablePoints,
        totalUsers: data.totalUsers || 0,
        uniqueUsers: data.uniqueUsers || 0,
        totalReservations: data.totalReservations || 0,
        successfulReservations: data.successfulReservations || 0,
        failedReservations: data.failedReservations || 0,
        successRate: data.successRate || 0
      });

    } catch (err) {
      console.error('Error fetching operator data:', err);
      setError(err.message || 'Failed to load global analytics');
      setSystemMetrics({
        totalProviders: 0,
        totalPoints: 0,
        availablePoints: 0,
        occupiedPoints: 0,
        unavailablePoints: 0,
        totalUsers: 0,
        uniqueUsers: 0,
        totalReservations: 0,
        successfulReservations: 0,
        failedReservations: 0,
        successRate: 0
      });
      setPointStatusCounts({});
      setTimeseries([]);
      setRankings([]);
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = (field, value) => {
    if (field === 'providerId') {
      const selectedProvider = providers.find((provider) => String(normalizeProviderId(provider)) === String(value));
      setFilters((prev) => ({
        ...prev,
        providerId: value,
        providerName: value === 'all' ? 'all' : normalizeProviderName(selectedProvider || {})
      }));
      return;
    }
    setFilters((prev) => ({ ...prev, [field]: value }));
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setToken(null);
  };

  const MetricCard = ({ title, value, unit, icon, color }) => (
    <div className="col-md-6 col-lg-3 mb-3">
      <div className={`card border-start border-${color} border-5 h-100`}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <p className="small mb-1 text-white">{title}</p>
              <h4 className="mb-0 text-white">{value}</h4>
              {unit && <small className="text-white">{unit}</small>}
            </div>
            <span className="fs-3 text-white">{icon}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const maxTimeseriesValue = Math.max(...timeseries.map((item) => Number(item.count || 0)), 0);
  const totalStatusPoints = Object.values(pointStatusCounts).reduce((sum, count) => sum + Number(count || 0), 0);

  return (
    <div className="min-vh-100 analytics-shell">
      {/* Header */}
      <nav className="navbar navbar-dark bg-dark sticky-top">
        <div className="container-fluid">
          <span className="navbar-brand mb-0 h1">👔 System Operator Dashboard</span>
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
              className={`nav-link ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
              type="button"
            >
              📊 Global Analytics
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'providers' ? 'active' : ''}`}
              onClick={() => setActiveTab('providers')}
              type="button"
            >
              🏢 Providers
            </button>
          </li>
        </ul>

        {/* Global Analytics Tab */}
        {activeTab === 'analytics' && (
          <div>
            <div className="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
              <div>
                <h3 className="mb-1">Global Analytics</h3>
                <p className="text-white mb-0">
                  Network-wide analytics across charging points, providers, users, and reservations.
                </p>
              </div>
              <button className="btn btn-outline-primary btn-sm" onClick={fetchOperatorData} disabled={loading}>
                Refresh
              </button>
            </div>

            <div className="card mb-4">
              <div className="card-body">
                <div className="row g-3 align-items-end">
                  <div className="col-md-3">
                    <label className="form-label">Provider</label>
                    <select
                      className="form-select"
                      value={filters.providerId}
                      onChange={(e) => updateFilter('providerId', e.target.value)}
                    >
                      <option value="all">All providers</option>
                      {providers.map((provider) => {
                        const providerId = normalizeProviderId(provider);
                        return (
                          <option key={providerId} value={providerId}>
                            {normalizeProviderName(provider)}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Period</label>
                    <select
                      className="form-select"
                      value={filters.period}
                      onChange={(e) => updateFilter('period', e.target.value)}
                    >
                      {PERIOD_OPTIONS.map((period) => (
                        <option key={period.value} value={period.value}>{period.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Point Status</label>
                    <select
                      className="form-select"
                      value={filters.status}
                      onChange={(e) => updateFilter('status', e.target.value)}
                    >
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status === 'all' ? 'All statuses' : status}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">Start Date</label>
                    <input
                      className="form-control"
                      type="date"
                      value={filters.startDate}
                      onChange={(e) => updateFilter('startDate', e.target.value)}
                    />
                  </div>
                  <div className="col-md-2">
                    <label className="form-label">End Date</label>
                    <input
                      className="form-control"
                      type="date"
                      value={filters.endDate}
                      onChange={(e) => updateFilter('endDate', e.target.value)}
                    />
                  </div>
                  <div className="col-md-1 d-grid">
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setFilters({
                        providerId: 'all',
                        providerName: 'all',
                        period: '30d',
                        status: 'all',
                        startDate: '',
                        endDate: ''
                      })}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {error && <div className="alert alert-warning">{error}</div>}
            
            {loading ? (
              <div className="text-center p-5">
                <div className="spinner-border" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
              </div>
            ) : (
              <>
                <div className="row mb-4">
                  <MetricCard
                    title="Total Providers"
                    value={systemMetrics.totalProviders || 0}
                    unit={filters.providerId === 'all' ? 'in scope' : 'selected'}
                    icon="🏢"
                    color="primary"
                  />
                  <MetricCard
                    title="Charging Points"
                    value={systemMetrics.totalPoints || 0}
                    unit="matching filters"
                    icon="⚡"
                    color="success"
                  />
                  <MetricCard
                    title="Available Points"
                    value={systemMetrics.availablePoints || 0}
                    unit="ready"
                    icon="✅"
                    color="info"
                  />
                  <MetricCard
                    title="Occupied Points"
                    value={systemMetrics.occupiedPoints || 0}
                    unit="charging/reserved"
                    icon="⏱"
                    color="warning"
                  />
                </div>

                <div className="row mb-4">
                  <MetricCard
                    title="Reservations"
                    value={systemMetrics.totalReservations || 0}
                    unit="selected period"
                    icon="📋"
                    color="primary"
                  />
                  <MetricCard
                    title="Successful"
                    value={systemMetrics.successfulReservations || 0}
                    unit={`${systemMetrics.successRate || 0}% success rate`}
                    icon="✓"
                    color="success"
                  />
                  <MetricCard
                    title="Failed"
                    value={systemMetrics.failedReservations || 0}
                    unit="reservation attempts"
                    icon="!"
                    color="danger"
                  />
                  <MetricCard
                    title="Users"
                    value={filters.providerId === 'all' ? systemMetrics.totalUsers : systemMetrics.uniqueUsers}
                    unit={filters.providerId === 'all' ? 'registered total' : 'unique in period'}
                    icon="👥"
                    color="warning"
                  />
                </div>

                <div className="row">
                  <div className="col-lg-7 mb-3">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">Reservations Over Time</h5>
                      </div>
                      <div className="card-body">
                        {timeseries.length === 0 ? (
                          <p className="text-muted mb-0">No reservation activity for the selected filters.</p>
                        ) : (
                          <div className="d-flex flex-column gap-3">
                            {timeseries.slice(-12).map((point) => (
                              <div key={point.month}>
                                <div className="d-flex justify-content-between small mb-1">
                                  <span>{point.month}</span>
                                  <strong>{point.count}</strong>
                                </div>
                                <div className="progress" style={{ height: '14px' }}>
                                  <div
                                    className="progress-bar bg-primary"
                                    style={{ width: getBarWidth(point.count, maxTimeseriesValue) }}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-5 mb-3">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">Charging Point Status</h5>
                      </div>
                      <div className="card-body">
                        {totalStatusPoints === 0 ? (
                          <p className="text-muted mb-0">No charging points found for the selected filters.</p>
                        ) : (
                          Object.entries(pointStatusCounts)
                            .sort((a, b) => b[1] - a[1])
                            .map(([status, count]) => (
                              <div key={status} className="mb-3">
                                <div className="d-flex justify-content-between small mb-1">
                                  <span className="text-capitalize">{status}</span>
                                  <strong>{count}</strong>
                                </div>
                                <div className="progress" style={{ height: '14px' }}>
                                  <div
                                    className="progress-bar bg-success"
                                    style={{ width: getBarWidth(count, totalStatusPoints) }}
                                  />
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Provider Ranking</h5>
                  </div>
                  <div className="table-responsive">
                    <table className="table table-hover mb-0">
                      <thead>
                        <tr className="table-light">
                          <th>Rank</th>
                          <th>Provider</th>
                          <th>Total Reservations</th>
                          <th>Successful</th>
                          <th>Failed</th>
                          <th>Success Rate</th>
                          <th>Unique Users</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankings.length === 0 ? (
                          <tr>
                            <td colSpan="7" className="text-center text-muted py-4">
                              No provider reservation data for the selected filters.
                            </td>
                          </tr>
                        ) : rankings.map((provider) => (
                          <tr key={`${provider.rank}-${provider.providerId}`}>
                            <td>{provider.rank}</td>
                            <td className="fw-bold">{provider.providerName}</td>
                            <td>{toNumber(provider.totalReservations)}</td>
                            <td>{toNumber(provider.successfulReservations)}</td>
                            <td>{getRankingFailedReservations(provider)}</td>
                            <td>{getRankingSuccessRate(provider)}%</td>
                            <td>{toNumber(provider.uniqueUsers)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div>
            <div className="d-flex justify-content-between align-items-center mb-4">
              <h3>Provider Management</h3>
              <button className="btn btn-primary">+ Add Provider</button>
            </div>

            {providers.length === 0 ? (
              <div className="alert alert-info text-center p-5">
                <p>No providers registered yet.</p>
              </div>
            ) : (
              <div className="card">
                <div className="table-responsive">
                  <table className="table table-hover mb-0">
                    <thead>
                      <tr className="table-light">
                        <th>Provider Name</th>
                        <th>Status</th>
                        <th>Base URL</th>
                        <th>State</th>
                        <th>Registered</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((provider) => (
                        <tr key={provider.provider_id}>
                          <td className="fw-bold">{provider.provider_name}</td>
                          <td>
                            <span className={`badge bg-${provider.status === 'active' ? 'success' : 'warning'}`}>
                              {provider.status === 'active' ? '🟢 Active' : '🟡 Inactive'}
                            </span>
                          </td>
                          <td>{provider.base_url || '-'}</td>
                          <td>{provider.status}</td>
                          <td>{provider.registered_at ? new Date(provider.registered_at).toLocaleDateString() : 'N/A'}</td>
                          <td>
                            <button className="btn btn-sm btn-outline-primary">View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default OperatorDashboard;
