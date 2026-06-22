import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL, SERVICES } from '../config';
import { analyticsAPI, providerAPI } from '../utils/apiClient';

const OperatorDashboard = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [providers, setProviders] = useState([]);
  const [systemMetrics, setSystemMetrics] = useState({
    totalProviders: 0,
    totalStations: 0,
    activeStations: 0,
    totalUsers: 0,
    systemUtilization: 0,
    totalTransactions: 0
  });
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOperatorData();
  }, []);

  const fetchOperatorData = async () => {
    try {
      // Κάλεσμα στο Analytics Service για global metrics
      // GET /api/analytics/global?period=monthly
      const globalAnalyticsResult = await analyticsAPI.getGlobalAnalytics('monthly');

      // Κάλεσμα στο Provider Management Service για λίστα providers
      // GET /api/providers
      const providersResult = await providerAPI.getAll();

      // Κανονικοποίηση global metrics
      if (globalAnalyticsResult.success) {
        const data = globalAnalyticsResult.data;
        setSystemMetrics({
          totalProviders: data.total_providers || 0,
          totalStations: data.total_stations || 0,
          activeStations: data.active_stations || 0,
          totalUsers: data.total_users || 0,
          systemUtilization: data.system_utilization || 0,
          totalTransactions: data.total_transactions || 0
        });
      } else {
        console.warn('Global analytics error:', globalAnalyticsResult.error);
      }

      // Κανονικοποίηση providers list
      // providerAPI.getAll() returns { total, providers: [...] }
      if (providersResult.success && providersResult.data) {
        const providerList = providersResult.data.providers || providersResult.data || [];
        setProviders(providerList);
      } else {
        console.warn('Providers fetch error:', providersResult.error);
      }

      // Alert simulation - σε πραγματική περίπτωση θα ήταν από ένα alerts endpoint
      setAlerts([
        {
          severity: 'info',
          title: 'System Running Normally',
          message: 'All services are operational',
          time: new Date().toLocaleTimeString()
        }
      ]);

      setLoading(false);
    } catch (err) {
      console.error('Error fetching operator data:', err);
      setSystemMetrics({
        totalProviders: 0,
        totalStations: 0,
        activeStations: 0,
        totalUsers: 0,
        systemUtilization: 0,
        totalTransactions: 0
      });
      setProviders([]);
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    setToken(null);
  };

  const MetricCard = ({ title, value, unit, icon, color, trend }) => (
    <div className="col-md-6 col-lg-3 mb-3">
      <div className={`card border-start border-${color} border-5 h-100`}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start">
            <div>
              <p className="text-muted small mb-1">{title}</p>
              <h4 className="mb-0">{value}</h4>
              {unit && <small className="text-muted">{unit}</small>}
              {trend && <small className={`text-${trend > 0 ? 'success' : 'danger'}`}>{trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%</small>}
            </div>
            <span className="fs-3">{icon}</span>
          </div>
        </div>
      </div>
    </div>
  );

  const AlertItem = ({ alert }) => (
    <div className={`alert alert-${alert.severity === 'critical' ? 'danger' : alert.severity === 'warning' ? 'warning' : 'info'} mb-2`}>
      <div className="d-flex justify-content-between">
        <strong>{alert.title}</strong>
        <small className="text-muted">{alert.time}</small>
      </div>
      <p className="mb-0 small">{alert.message}</p>
    </div>
  );

  return (
    <div className="min-vh-100" style={{ backgroundColor: '#f8f9fa' }}>
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
              className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
              type="button"
            >
              📊 System Overview
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
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'alerts' ? 'active' : ''}`}
              onClick={() => setActiveTab('alerts')}
              type="button"
            >
              ⚠️ Alerts & Monitoring
            </button>
          </li>
          <li className="nav-item" role="presentation">
            <button
              className={`nav-link ${activeTab === 'reports' ? 'active' : ''}`}
              onClick={() => setActiveTab('reports')}
              type="button"
            >
              📈 System Reports
            </button>
          </li>
        </ul>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div>
            <h3 className="mb-4">System Overview</h3>
            
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
                    unit="active"
                    icon="🏢"
                    color="primary"
                    trend={12}
                  />
                  <MetricCard
                    title="Total Stations"
                    value={systemMetrics.totalStations || 0}
                    unit="network-wide"
                    icon="⚡"
                    color="success"
                    trend={8}
                  />
                  <MetricCard
                    title="Active Stations"
                    value={systemMetrics.activeStations || 0}
                    unit="online"
                    icon="✅"
                    color="info"
                    trend={5}
                  />
                  <MetricCard
                    title="Total Users"
                    value={systemMetrics.totalUsers || 0}
                    unit="registered"
                    icon="👥"
                    color="warning"
                    trend={15}
                  />
                </div>

                <div className="row mb-4">
                  <MetricCard
                    title="System Utilization"
                    value={`${systemMetrics.systemUtilization || 0}%`}
                    unit="capacity"
                    icon="📈"
                    color="success"
                    trend={3}
                  />
                  <MetricCard
                    title="Total Transactions"
                    value={systemMetrics.totalTransactions || 0}
                    unit="this month"
                    icon="💳"
                    color="warning"
                    trend={22}
                  />
                </div>

                <div className="row">
                  <div className="col-lg-8">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">System Health</h5>
                      </div>
                      <div className="card-body">
                        <div className="mb-3">
                          <div className="d-flex justify-content-between mb-2">
                            <span>Network Performance</span>
                            <span className="text-success fw-bold">99.8%</span>
                          </div>
                          <div className="progress" style={{ height: '20px' }}>
                            <div className="progress-bar bg-success" style={{ width: '99.8%' }}></div>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between mb-2">
                            <span>API Response Time</span>
                            <span className="text-success fw-bold">45ms</span>
                          </div>
                          <div className="progress" style={{ height: '20px' }}>
                            <div className="progress-bar bg-info" style={{ width: '75%' }}></div>
                          </div>
                        </div>

                        <div className="mb-3">
                          <div className="d-flex justify-content-between mb-2">
                            <span>Database Load</span>
                            <span className="text-warning fw-bold">68%</span>
                          </div>
                          <div className="progress" style={{ height: '20px' }}>
                            <div className="progress-bar bg-warning" style={{ width: '68%' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-4">
                    <div className="card">
                      <div className="card-header bg-light">
                        <h5 className="mb-0">Recent Alerts</h5>
                      </div>
                      <div className="card-body" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {alerts.length === 0 ? (
                          <p className="text-muted small mb-0">✅ No critical alerts</p>
                        ) : (
                          alerts.slice(0, 3).map((alert, idx) => (
                            <AlertItem key={idx} alert={alert} />
                          ))
                        )}
                      </div>
                    </div>
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

        {/* Alerts Tab */}
        {activeTab === 'alerts' && (
          <div>
            <h3 className="mb-4">System Alerts & Monitoring</h3>

            <div className="row mb-4">
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h4 className="text-danger">
                      {alerts.filter(a => a.severity === 'critical').length}
                    </h4>
                    <p className="text-muted mb-0">Critical Alerts</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h4 className="text-warning">
                      {alerts.filter(a => a.severity === 'warning').length}
                    </h4>
                    <p className="text-muted mb-0">Warnings</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h4 className="text-info">
                      {alerts.filter(a => a.severity === 'info').length}
                    </h4>
                    <p className="text-muted mb-0">Info Messages</p>
                  </div>
                </div>
              </div>
              <div className="col-md-3">
                <div className="card text-center">
                  <div className="card-body">
                    <h4 className="text-success">{alerts.length}</h4>
                    <p className="text-muted mb-0">Total Events</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header bg-light">
                <h5 className="mb-0">Alert History</h5>
              </div>
              <div className="card-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {alerts.length === 0 ? (
                  <p className="text-muted">No alerts at this time.</p>
                ) : (
                  alerts.map((alert, idx) => (
                    <AlertItem key={idx} alert={alert} />
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            <h3 className="mb-4">System Reports & Analytics</h3>

            <div className="row">
              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">System Revenue</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">Total Revenue (Current Month)</p>
                      <h3>€45,250.00</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Daily Average</p>
                      <h4>€1,508.33</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">Export Report</button>
                  </div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Network Statistics</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">Total Charging Sessions</p>
                      <h3>8,432</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Average Session Duration</p>
                      <h4>42 minutes</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">View Analytics</button>
                  </div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">User Growth</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">New Users (This Month)</p>
                      <h3>+542</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Active Users</p>
                      <h4>12,458</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">View Details</button>
                  </div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Provider Performance</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">Average Availability</p>
                      <h3>98.5%</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Service Quality Score</p>
                      <h4>4.8/5.0</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">View Report</button>
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

export default OperatorDashboard;
