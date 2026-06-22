const os = require('os');
const { PROVIDER_MAP } = require('./plugs_api');

function getAccessibleIps() {
  const interfaces = os.networkInterfaces();
  const ips = ['localhost'];

  return ips;
}

function getProviderNames() {
  return Object.values(PROVIDER_MAP).map(provider => provider.providerName);
}

module.exports = { getAccessibleIps, getProviderNames };