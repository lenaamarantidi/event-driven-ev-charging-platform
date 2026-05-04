// src/App.jsx
import { useState } from 'react';
import Auth from './components/Auth';
import RoleSelect from './components/RoleSelect';
import Home from './pages/Home';
import EVUserMap from './pages/EVUserMap';
import ProviderDashboard from './pages/ProviderDashboard';
import OperatorDashboard from './pages/OperatorDashboard';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [userRole, setUserRole] = useState(localStorage.getItem('userRole') || null);
  const [showRoleSelect, setShowRoleSelect] = useState(false);

  // If no token, show auth
  if (!token) {
    return <Auth setToken={(newToken) => { setToken(newToken); localStorage.setItem('token', newToken); }} />;
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
    setToken(null);
    setUserRole(null);
  };

  switch (userRole) {
    case 'ev_user':
      return <EVUserMap setToken={handleLogoutAndSelectRole} />;
    case 'provider':
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