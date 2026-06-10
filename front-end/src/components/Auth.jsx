import { useState } from 'react';
import axios from 'axios';
import { BASE_URL } from '../config';

const Auth = ({ setToken }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // API Gateway exposes auth under /api/auth
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup';

    try {
      const res = await axios.post(`${BASE_URL}${endpoint}`, formData);

      if (isLogin) {
        localStorage.setItem('token', res.data.token);
        localStorage.setItem('username', formData.username);
        setToken(res.data.token);
      } else {
        alert("Account created! Please login.");
        setIsLogin(true);
      }
    } catch (err) {
      setError("Authentication failed. Check credentials or server.");
    }
  };

  return (
    <div className="container d-flex justify-content-center align-items-center vh-100">
      <div className="card p-4 shadow" style={{ width: '400px' }}>
        <h2 className="text-center">⚡ charger.io Access</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        
        <ul className="nav nav-tabs mb-3">
          <li className="nav-item">
            <button className={`nav-link ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setFormData({ username: '', password: '' }); setError(''); }}>Login</button>
          </li>
          <li className="nav-item">
            <button className={`nav-link ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setFormData({ username: '', password: '' }); setError(''); }}>Sign Up</button>
          </li>
        </ul>

        <form onSubmit={handleSubmit}>
          <div className="mb-3">
            <label>Username</label>
            <input type="text" className="form-control" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
          </div>
          <div className="mb-3">
            <label>Password</label>
            <input type="password" className="form-control" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} required />
          </div>
          <button type="submit" className="btn btn-primary w-100">{isLogin ? 'Sign In' : 'Create Account'}</button>
        </form>
      </div>
    </div>
  );
};

export default Auth;