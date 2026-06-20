// src/App.jsx
import { useState } from 'react';
import Auth from './components/Auth';
import RoleSelect from './components/RoleSelect';
import Home from './pages/Home';
import EVUserMap from './pages/EVUserMap';
import ProviderDashboard from './pages/ProviderDashboard';
import ProviderRegister from './pages/ProviderRegister';
import OperatorDashboard from './pages/OperatorDashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || null);
  const [showRoleSelect, setShowRoleSelect] = useState(false);

  // If no token, show auth
  if (!token) {
    return (
      <Auth
        setToken={(newToken) => {
          setToken(newToken);
          localStorage.setItem('token', newToken);
        }}
        setUserRole={(role) => {
          setUserRole(role);
          localStorage.setItem('userRole', role);
        }}
      />
    );
  }

  // If token but no role, show role select
  if (!userRole) {
    return <RoleSelect onRoleSelect={(role) => { setUserRole(role); localStorage.setItem('userRole', role); }} />;
  }

  // Route based on role
  const handleRoleChange = () => {
    setShowRoleSelect(true);
  };

  const handleLogoutAndSelectRole = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('userRole');
    localStorage.removeItem('providerId');
    setToken(null);
    setUserRole(null);
  };

  // Check for provider registration
  const needsProviderRegistration = userRole === 'provider' && !localStorage.getItem('providerId');

  switch (userRole) {
    case 'ev_user':
      return <EVUserMap setToken={handleLogoutAndSelectRole} />;
    case 'provider':
      // If provider hasn't registered yet, show registration form
      if (needsProviderRegistration) {
        return <ProviderRegister onRegistered={(provider) => {
          localStorage.setItem('providerId', provider.provider_id);
          window.location.reload();
        }} />;
      }
      return <ProviderDashboard setToken={handleLogoutAndSelectRole} />;
    case 'operator':
      return <OperatorDashboard setToken={handleLogoutAndSelectRole} />;
    case 'admin':
      // Admin can see operator dashboard for now
      return <OperatorDashboard setToken={handleLogoutAndSelectRole} />;
    default:
      return <Home setToken={handleLogoutAndSelectRole} />;
  }
}

export default App;