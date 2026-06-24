import { useState } from 'react';
import { providerAPI } from '../utils/apiClient';

const ProviderRegister = ({ onRegistered }) => {
  const [formData, setFormData] = useState({
    provider_name: '',
    provider_email: '',
    company_tin: '',
    password: '',
    base_url: '',
    api_key: '',
    openapi_url: '',
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
    } catch {
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

                <div className="mb-3">
                  <label className="form-label">
                    Company Email <span className="text-danger">*</span>
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    name="provider_email"
                    value={formData.provider_email}
                    onChange={handleChange}
                    placeholder="billing@example.com"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    Company TIN <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    name="company_tin"
                    value={formData.company_tin}
                    onChange={handleChange}
                    placeholder="9 digits"
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    Password <span className="text-danger">*</span>
                  </label>
                  <input
                    type="password"
                    className="form-control"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    minLength={8}
                    required
                  />
                </div>

                <hr className="my-4" />

                <h5 className="mb-3 text-muted">API Configuration</h5>
                <p className="small text-muted mb-3">
                  Enter your API credentials and OpenAPI YAML URL to allow saasCharge to discover your charging network endpoints.
                </p>

                <div className="mb-3">
                  <label className="form-label">
                    OpenAPI YAML URL <span className="text-danger">*</span>
                  </label>
                  <input
                    type="url"
                    className="form-control"
                    name="openapi_url"
                    value={formData.openapi_url}
                    onChange={handleChange}
                    placeholder="e.g., https://api.davinci-charging.com/openapi.yaml"
                    required
                  />
                  <div className="form-text">
                    The OpenAPI YAML file that describes your provider API.
                  </div>
                </div>

                <div className="mb-3">
                  <label className="form-label">
                    Base URL fallback
                  </label>
                  <input
                    type="url"
                    className="form-control"
                    name="base_url"
                    value={formData.base_url}
                    onChange={handleChange}
                    placeholder="e.g., https://api.davinci-charging.com"
                  />
                  <div className="form-text">
                    Optional if the YAML includes servers[0].url.
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

                <h5 className="mb-3 text-muted">Manual Endpoint Fallbacks</h5>
                <p className="small text-muted mb-3">
                  Optional overrides if endpoint discovery from the OpenAPI YAML is incomplete.
                </p>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      List Points Endpoint
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_list_points"
                      value={formData.endpoint_list_points}
                      onChange={handleChange}
                      placeholder="/api/points"
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Point Details Endpoint
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_point_details"
                      value={formData.endpoint_point_details}
                      onChange={handleChange}
                      placeholder="/api/points/{id}"
                    />
                  </div>
                </div>

                <div className="row">
                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Reserve Endpoint
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_reserve"
                      value={formData.endpoint_reserve}
                      onChange={handleChange}
                      placeholder="/api/reserve"
                    />
                  </div>

                  <div className="col-md-6 mb-3">
                    <label className="form-label">
                      Reserve Duration Endpoint <span className="text-muted">(optional)</span>
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      name="endpoint_reserve_duration"
                      value={formData.endpoint_reserve_duration}
                      onChange={handleChange}
                      placeholder="Leave blank if not supported"
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
