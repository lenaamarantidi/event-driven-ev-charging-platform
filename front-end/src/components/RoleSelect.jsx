import { useState } from 'react';

const RoleSelect = ({ onRoleSelect }) => {
  const [selectedRole, setSelectedRole] = useState(null);

  const handleContinue = () => {
    if (selectedRole) {
      onRoleSelect(selectedRole);
    }
  };

  return (
    <div className="container d-flex justify-content-center align-items-center vh-100">
      <div className="card p-5 shadow" style={{ width: '600px' }}>
        <h2 className="text-center mb-4">⚡ Choose Your Role</h2>
        <p className="text-center text-muted mb-4">Select how you want to access charger.io</p>

        <div className="row gap-3">
          {/* EV User Role */}
          <div className="col-md-6">
            <div
              className={`card p-4 cursor-pointer border-2 ${selectedRole === 'ev_user' ? 'border-primary bg-light' : 'border-secondary'}`}
              onClick={() => setSelectedRole('ev_user')}
              style={{ cursor: 'pointer', transition: 'all 0.3s' }}
            >
              <h5 className="card-title">🚗 EV Driver</h5>
              <p className="card-text text-muted">
                Find and book charging stations nearby with real-time availability and pricing.
              </p>
              <div className="mt-3">
                <small className="text-success">✓ Map & Search</small>
                <br />
                <small className="text-success">✓ Booking & Reservations</small>
                <br />
                <small className="text-success">✓ Payment Integration</small>
              </div>
            </div>
          </div>

          {/* Provider Role */}
          <div className="col-md-6">
            <div
              className={`card p-4 cursor-pointer border-2 ${selectedRole === 'provider' ? 'border-primary bg-light' : 'border-secondary'}`}
              onClick={() => setSelectedRole('provider')}
              style={{ cursor: 'pointer', transition: 'all 0.3s' }}
            >
              <h5 className="card-title">🏢 Provider</h5>
              <p className="card-text text-muted">
                Manage your charging network, monitor stations, and track performance metrics.
              </p>
              <div className="mt-3">
                <small className="text-success">✓ Network Management</small>
                <br />
                <small className="text-success">✓ Real-time Monitoring</small>
                <br />
                <small className="text-success">✓ Analytics & Reports</small>
              </div>
            </div>
          </div>

          {/* Operator Role */}
          <div className="col-md-6">
            <div
              className={`card p-4 cursor-pointer border-2 ${selectedRole === 'operator' ? 'border-primary bg-light' : 'border-secondary'}`}
              onClick={() => setSelectedRole('operator')}
              style={{ cursor: 'pointer', transition: 'all 0.3s' }}
            >
              <h5 className="card-title">👔 System Operator</h5>
              <p className="card-text text-muted">
                Oversee the entire network, manage providers, and maintain system operations.
              </p>
              <div className="mt-3">
                <small className="text-success">✓ System Management</small>
                <br />
                <small className="text-success">✓ Provider Oversight</small>
                <br />
                <small className="text-success">✓ System Analytics</small>
              </div>
            </div>
          </div>

          {/* Admin Role */}
          <div className="col-md-6">
            <div
              className={`card p-4 cursor-pointer border-2 ${selectedRole === 'admin' ? 'border-primary bg-light' : 'border-secondary'}`}
              onClick={() => setSelectedRole('admin')}
              style={{ cursor: 'pointer', transition: 'all 0.3s' }}
            >
              <h5 className="card-title">🛡️ Administrator</h5>
              <p className="card-text text-muted">
                Full system control, user management, and platform configuration.
              </p>
              <div className="mt-3">
                <small className="text-success">✓ User Management</small>
                <br />
                <small className="text-success">✓ System Configuration</small>
                <br />
                <small className="text-success">✓ Security Controls</small>
              </div>
            </div>
          </div>
        </div>

        <div className="d-grid gap-2 mt-5">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleContinue}
            disabled={!selectedRole}
          >
            Continue as {selectedRole === 'ev_user' ? 'EV Driver' : selectedRole === 'provider' ? 'Provider' : selectedRole === 'operator' ? 'Operator' : selectedRole === 'admin' ? 'Administrator' : ''}
          </button>
          <button className="btn btn-outline-secondary" onClick={() => setSelectedRole(null)}>
            Clear Selection
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoleSelect;
