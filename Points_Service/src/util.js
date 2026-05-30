const os = require('os');

function getAccessibleIps() {
  const interfaces = os.networkInterfaces();
  const ips = ['localhost'];

  return ips;
}

module.exports = { getAccessibleIps };