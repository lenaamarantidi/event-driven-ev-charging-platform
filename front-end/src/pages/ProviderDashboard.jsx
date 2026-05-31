import { useState, useEffect } from 'react';
import axios from 'axios';
import { BASE_URL, SERVICES } from '../config';
import { analyticsAPI, billingAPI } from '../utils/apiClient';

const ProviderDashboard = ({ setToken }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [stations, setStations] = useState([]);
  const [analytics, setAnalytics] = useState({
    totalStations: 0,
    activeStations: 0,
    totalReservations: 0,
    revenue: 0,
    utilization: 0
  });
  const [selectedStation, setSelectedStation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProviderData();
  }, []);

  const fetchProviderData = async () => {
    try {
      // Λήψη provider ID από token ή session
      const providerId = localStorage.getItem('providerId') || '1'; // Default fallback
      
      // Κάλεσμα στο Analytics Service
      // GET /api/analytics/provider/:providerId?period=monthly
      const analyticsResult = await analyticsAPI.getProviderAnalytics(providerId, { period: 'monthly' });
      
      // Κάλεσμα στο Billing Service
      // GET /api/billing/summary/:providerId
      const billingResult = await billingAPI.getSummary(providerId);

      // Κανονικοποίηση δεδομένων analytics
      if (analyticsResult.success) {
        const analyticsData = analyticsResult.data;
        setAnalytics({
          totalStations: analyticsData.stations_count || 0,
          activeStations: analyticsData.active_stations || 0,
          totalReservations: analyticsData.reservations || 0,
          revenue: billingResult.success ? billingResult.data.total_revenue || 0 : 0,
          utilization: analyticsData.utilization_rate || 0
        });
      } else {
        console.warn('Analytics error:', analyticsResult.error);
      }

      // Κάλεσμα για λήψη σταθμών (stations)
      // Μπορούμε να χρησιμοποιήσουμε ημερήσια analytics για stations data
      const dailyResult = await analyticsAPI.getDailyAnalytics(providerId);
      if (dailyResult.success) {
        setStations(dailyResult.data || []);
      }

      setLoading(false);
    } catch (err) {
      console.error('Error fetching provider data:', err);
      setAnalytics({
        totalStations: 0,
        activeStations: 0,
        totalReservations: 0,
        revenue: 0,
        utilization: 0
      });
      setLoading(false);
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

            {stations.length === 0 ? (
              <div className="alert alert-info text-center p-5">
                <p>No stations found. Add your first station to get started!</p>
              </div>
            ) : (
              <div className="row">
                {stations.map((station) => (
                  <div key={station.id} className="col-md-6 col-lg-4 mb-3">
                    <div
                      className="card cursor-pointer"
                      onClick={() => setSelectedStation(station)}
                      style={{ cursor: 'pointer', transition: 'transform 0.2s' }}
                    >
                      <div className="card-body">
                        <h5 className="card-title">{station.name}</h5>
                        <p className="card-text text-muted small mb-2">{station.address}</p>
                        
                        <div className="mb-3">
                          <span className={`badge bg-${station.status === 'active' ? 'success' : 'warning'}`}>
                            {station.status === 'active' ? '🟢 Active' : '🟡 Maintenance'}
                          </span>
                        </div>

                        <div className="small">
                          <p className="mb-1">
                            <strong>Outlets:</strong> {station.outlets_count || 0}
                          </p>
                          <p className="mb-1">
                            <strong>Available:</strong> {station.available_count || 0}
                          </p>
                          <p className="mb-0">
                            <strong>Utilization:</strong> {station.utilization || 0}%
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
                      <h5 className="modal-title">{selectedStation.name}</h5>
                      <button type="button" className="btn-close" onClick={() => setSelectedStation(null)}></button>
                    </div>
                    <div className="modal-body">
                      <p><strong>Status:</strong> {selectedStation.status}</p>
                      <p><strong>Location:</strong> {selectedStation.address}</p>
                      <p><strong>Total Outlets:</strong> {selectedStation.outlets_count}</p>
                      <p><strong>Available:</strong> {selectedStation.available_count}</p>
                      <p><strong>Utilization:</strong> {selectedStation.utilization}%</p>
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
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Station</th>
                        <th>User</th>
                        <th>Duration</th>
                        <th>Revenue</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>2025-05-04</td>
                        <td>Station A</td>
                        <td>User123</td>
                        <td>45 min</td>
                        <td>€12.50</td>
                        <td><span className="badge bg-success">Completed</span></td>
                      </tr>
                      <tr>
                        <td>2025-05-04</td>
                        <td>Station B</td>
                        <td>User456</td>
                        <td>30 min</td>
                        <td>€8.75</td>
                        <td><span className="badge bg-info">In Progress</span></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Reports Tab */}
        {activeTab === 'reports' && (
          <div>
            <h3 className="mb-4">Reports & Analytics</h3>
            <div className="row">
              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Revenue Report</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">Monthly Revenue</p>
                      <h3>€5,250.00</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Weekly Average</p>
                      <h4>€1,312.50</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">Download Report</button>
                  </div>
                </div>
              </div>

              <div className="col-md-6 mb-3">
                <div className="card">
                  <div className="card-header bg-light">
                    <h5 className="mb-0">Usage Statistics</h5>
                  </div>
                  <div className="card-body">
                    <div className="mb-3">
                      <p className="text-muted small">Total Sessions</p>
                      <h3>842</h3>
                    </div>
                    <div className="mb-3">
                      <p className="text-muted small">Average Session Duration</p>
                      <h4>38 minutes</h4>
                    </div>
                    <button className="btn btn-sm btn-outline-primary">View Details</button>
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
