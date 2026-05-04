// src/App.jsx
import { useState } from 'react';
import Auth from './components/Auth';
import Home from './pages/Home';

function App() {
  const [token, setToken] = useState(null);

  if (!token) {
    return <Auth setToken={setToken} />;
  }

  return <Home setToken={setToken} />;
}

export default App;