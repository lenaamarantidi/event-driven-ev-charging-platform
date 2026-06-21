import { useState } from 'react';
import axios from 'axios';
import { getServiceURL } from '../config';

const Auth = ({ setToken, setUserRole }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [role, setRole] = useState('ev_user');
  const [formData, setFormData] = useState({
    login_email: '',
    username: '',
    email: '',
    password: '',
    provider_name: '',
    provider_email: '',
    base_url: '',
    api_key: '',
    endpoint_list_points: '',
    endpoint_point_details: '',
    endpoint_reserve: '',
    endpoint_reserve_duration: ''
  });
  const [error, setError] = useState('');

  const handleFieldChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
  };

  const getEndpoint = () => {
    if (role === 'provider') {
      const serviceUrl = getServiceURL('providers');
      return `${serviceUrl}/${isLogin ? 'login' : 'register'}`;
    }
    const serviceUrl = getServiceURL('auth');
    return `${serviceUrl}/${isLogin ? 'login' : 'register'}`;
  };

  const getPayload = () => {
    if (role === 'provider') {
      if (isLogin) {
        return {
          provider_name: formData.provider_name.trim(),
          password: formData.password
        };
      }

      return {
        provider_name: formData.provider_name.trim(),
        provider_email: formData.provider_email.trim(),
        password: formData.password,
        base_url: formData.base_url.trim(),
        api_key: formData.api_key.trim(),
        endpoint_list_points: formData.endpoint_list_points.trim(),
        endpoint_point_details: formData.endpoint_point_details.trim(),
        endpoint_reserve: formData.endpoint_reserve.trim(),
        endpoint_reserve_duration: formData.endpoint_reserve_duration.trim()
      };
    }

    if (isLogin) {
      return {
        email: formData.login_email.trim(),
        password: formData.password
      };
    }

    return {
      username: formData.username.trim(),
      email: formData.email.trim(),
      password: formData.password
    };
  };
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    // Client-side validation for signup flows: show clear error for short passwords
    if (!isLogin) {
      if (!formData.password || formData.password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    try {
      const payload = getPayload();
      const endpoint = getEndpoint();
      const res = await axios.post(endpoint, payload, { timeout: 8000 });

      if (isLogin) {
        const token = res.data.accessToken || res.data.token || res.data.access_token;
        if (!token) {
          throw new Error('Missing authentication token');
        }

        localStorage.setItem('token', token);
        if (role === 'provider') {
          localStorage.setItem('providerName', formData.provider_name.trim());
        } else {
          localStorage.setItem('username', formData.username.trim() || formData.login_email.trim());
        }
        setToken(token);
        setUserRole(role === 'provider' ? 'provider' : 'ev_user');
      } else {
        alert(`${role === 'provider' ? 'Provider account' : 'Account'} created! Please login.`);
        setIsLogin(true);
      }
    } catch (err) {
      let message = 'Authentication failed. Check credentials or server.';
      
      // Handle specific error messages from backend
      const errorText = (err.response?.data?.error || '').toLowerCase();
      
      if (err.response?.status === 409) {
        if (errorText.includes('email')) {
          message = 'This email is already registered, please use another one.';
        } else if (errorText.includes('username')) {
          message = 'This username is taken, please choose another one.';
        } else {
          message = err.response.data.error || 'This account already exists.';
        }
      } else if (err.response?.data?.error) {
        // Check for username taken error in the error message text (case-insensitive)
        if (errorText.includes('username') && (errorText.includes('taken') || errorText.includes('exists'))) {
          message = 'This username is taken, please choose another one.';
        } else if (errorText.includes('email') && (errorText.includes('registered') || errorText.includes('exists'))) {
          message = 'This email is already registered, please use another one.';
        } else {
          message = err.response.data.error;
        }
      } else if (err.message) {
        message = err.message === 'Network Error'
          ? 'Network error. Please check that API Gateway is running on port 8001.'
          : err.message;
      }
      
      setError(message);
    }
  };

  const resetForm = (newRole, newLoginState) => {
    setRole(newRole);
    setIsLogin(newLoginState);
    setFormData({
      login_email: '',
      username: '',
      email: '',
      password: '',
      provider_name: '',
      provider_email: '',
      base_url: '',
      api_key: '',
      endpoint_list_points: '',
      endpoint_point_details: '',
      endpoint_reserve: '',
      endpoint_reserve_duration: ''
    });
    setError('');
  };

  return (
    <div className="container d-flex justify-content-center align-items-center vh-100">
      <div className="card p-4 shadow" style={{ width: '500px' }}>
        <h2 className="text-center">⚡ charger.io Access</h2>
        {error && <div className="alert alert-danger">{error}</div>}

        <div className="d-flex justify-content-between mb-3">
          <button
            type="button"
            className={`btn btn-sm ${isLogin ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => resetForm(role, true)}
          >
            Login
          </button>
          <button
            type="button"
            className={`btn btn-sm ${!isLogin ? 'btn-primary' : 'btn-outline-secondary'}`}
            onClick={() => resetForm(role, false)}
          >
            Sign Up
          </button>
        </div>

        <div className="mb-4">
          <label className="form-label">Role</label>
          <select className="form-select" value={role} onChange={e => resetForm(e.target.value, isLogin)}>
            <option value="ev_user">EV Driver</option>
            <option value="provider">Provider</option>
          </select>
        </div>

        <form onSubmit={handleSubmit}>
          {role === 'provider' ? (
            <>
              <div className="mb-3">
                <label>{isLogin ? 'Provider Name' : 'Provider Name'}</label>
                <input
                  type="text"
                  className="form-control"
                  value={formData.provider_name}
                  onChange={handleFieldChange('provider_name')}
                  required
                />
              </div>
              {!isLogin && (
                <>
                  <div className="mb-3">
                    <label>Provider Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formData.provider_email}
                      onChange={handleFieldChange('provider_email')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>Base URL</label>
                    <input
                      type="url"
                      className="form-control"
                      value={formData.base_url}
                      onChange={handleFieldChange('base_url')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>API Key</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.api_key}
                      onChange={handleFieldChange('api_key')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>List Points Endpoint</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.endpoint_list_points}
                      onChange={handleFieldChange('endpoint_list_points')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>Point Details Endpoint</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.endpoint_point_details}
                      onChange={handleFieldChange('endpoint_point_details')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>Reserve Endpoint</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.endpoint_reserve}
                      onChange={handleFieldChange('endpoint_reserve')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>Reserve Duration Endpoint</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.endpoint_reserve_duration}
                      onChange={handleFieldChange('endpoint_reserve_duration')}
                      required
                    />
                  </div>
                </>
              )}
              <div className="mb-3">
                <label>Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={formData.password}
                  onChange={handleFieldChange('password')}
                  required
                />
              </div>
            </>
          ) : (
            <>
              {isLogin ? (
                <div className="mb-3">
                  <label>Email</label>
                  <input
                    type="email"
                    className="form-control"
                    value={formData.login_email}
                    onChange={handleFieldChange('login_email')}
                    required
                  />
                </div>
              ) : (
                <>
                  <div className="mb-3">
                    <label>Username</label>
                    <input
                      type="text"
                      className="form-control"
                      value={formData.username}
                      onChange={handleFieldChange('username')}
                      required
                    />
                  </div>
                  <div className="mb-3">
                    <label>Email</label>
                    <input
                      type="email"
                      className="form-control"
                      value={formData.email}
                      onChange={handleFieldChange('email')}
                      required
                    />
                  </div>
                </>
              )}
              <div className="mb-3">
                <label>Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={formData.password}
                  onChange={handleFieldChange('password')}
                  required
                />
              </div>
            </>
          )}

          <button type="submit" className="btn btn-primary w-100">
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Auth;