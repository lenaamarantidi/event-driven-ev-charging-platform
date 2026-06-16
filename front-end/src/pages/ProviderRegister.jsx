import { useState } from 'react';
import { providerAPI } from '../utils/apiClient';

const ProviderRegister = ({ onRegistered }) => {
  const [formData, setFormData] = useState({
    provider_name: '',
    base_url: '',
    api_key: '',
    endpoint_list_points: '',
    endpoint_point_details: '',
    endpoint_reserve: '',
    endpoint_reserve_duration: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [registeredProvider, setRegisteredProvider] = useState(null);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await providerAPI.register(formData);

      if (result.success) {
        setRegisteredProvider(result.data.provider);
        setSuccess(true);

        // Save provider session locally
        localStorage.setItem('provider', JSON.stringify(result.data.provider));

        if (onRegistered) {
          onRegistered(result.data.provider);
        }
      } else {
        setError(result.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success && registeredProvider) {
    return (
      <div className="container d-flex justify-content-center align-items-center vh-100">
        <div className="card p-4 shadow" style={{ width: '500px' }}>
          <div className="text-center">
            <div className="mb-3">
              <span style={{ fontSize: '48px' }}>✓</span>
            </div>
            <h3 className="text-success">Registration Successful!</h3>
            <p className="text-muted mt-3">
              Your provider "{registeredProvider.provider_name}" has been registered with saasCharge.
            </p>
          </div>

          <div className="card bg-light mt-4">
            <div className="card-body">
              <h5 className="card-title">Provider Details</h5>
              <table className="table table-sm">
                <tbody>
                  <tr>
                    <td><strong>Provider ID:</strong></td>
                    <td>{registeredProvider.provider_id}</td>
                  </tr>
                  <tr>
                    <td><strong>Status:</strong></td>
                    <td><span className="badge bg-success">{registeredProvider.status}</span></td>
                  </tr>
                  <tr>
                    <td><strong>Registered:</strong></td>
                    <td>{new Date(registeredProvider.registered_at).toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-4 text-center">
            <button
              className="btn btn-primary"
              onClick={() => window.location.href = '/#/provider/dashboard'}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-5">
      <div className="row justify-content-center">
        <div className="col-lg-8">
          <div className="card shadow">
            <div className="card-header bg-primary text-white">
              <h3 className="mb-0">Register with saasCharge</h3>
              <p className="mb-0 small">UC03: Provider Registration</p>
            </div>

            <div className="card-body">
              {error && (
                <div className="alert alert-danger">{error}</div>
              )}

              <form onSubmit={handleSubmit}>
                <h5 className="mb-3 text-muted">Company Information</h5>

                <div className="mb-3">
                  <label className="form-label">
                    Company Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    name="provider_name"
                    value={formData.provider_name}
                    onChange={handleChange}
                    placeholder="e.g., My Charging Company"
                    required
                  />
                </div>

                <hr className="my-4" />

                <h5 className="mb-3 text-muted">API Configuration</h5>
                <p className="small text-muted mb-3">
                  Enter your API credentials to allow saasCharge to communicate with your charging network.
                </p>

                <div className="mb-3">
                  <label className="form-label">
                    Base URL <span className="text-danger">*</span>
                  </label>
                  <input
                    type="url"
                    className="form-control"
                    name="base_url"
                    value={formData.base_url}
                    onChange={handleChange}
                    placeholder="e.g., https://api.davinci-charging.com"
                    required
                  />
                  <div className="form-text">
                    The base URL of your provider's API server
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    API Key <span className="text-danger">*</span>
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    name="api_key"
                    value={formData.api_key}
                    onChange={handleChange}
                    placeholder="Your API key"
                    required
                  />
                  <div className="form-text">
                    Your secret API key for authentication
                  </div>
                </div>

                <hr className="my-4" />

                <h5 className="mb-3 text-muted">API Endpoints</h5>
                <p className="small text-muted mb-3">
                  Specify the endpoint paths for each operation.
                </p>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      List Points Endpoint <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_list_points"
                      value={formData.endpoint_list_points}
                      onChange={handleChange}
                      placeholder="/api/points"
                      required
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Point Details Endpoint <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_point_details"
                      value={formData.endpoint_point_details}
                      onChange={handleChange}
                      placeholder="/api/points/{id}"
                      required
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Reserve Endpoint <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_reserve"
                      value={formData.endpoint_reserve}
                      onChange={handleChange}
                      placeholder="/api/reserve"
                      required
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Reserve Duration Endpoint <span className="text-danger">*</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_reserve_duration"
                      value={formData.endpoint_reserve_duration}
                      onChange={handleChange}
                      placeholder="/api/reserve/{id}/duration"
                      required
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary btn-lg w-100"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Registering...
                      </>
                    ) : (
                      'Register Provider'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProviderRegister;