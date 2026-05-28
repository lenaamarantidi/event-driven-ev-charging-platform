const PROVIDER_MAP = {
  redPlug: {
    providerName: 'redPlug',
    baseUrlDefault: 'https://davinci.softlab.ntua.gr/saas26/redPlug/api',
    listPath: '/points',
    detailPath: '/point/${pointId}',
    reservePath: '/reserve/${pointId}',
    reservePathWduration: '/reserve/${pointId}/${minutes}',
  },
  greenPlug: {
    providerName: 'greenPlug',
    baseUrlDefault: 'https://davinci.softlab.ntua.gr/saas26/greenPlug/api',
    listPath: '/chargingPoints',
    detailPath: '/chargingPoints/${pointId}',
    reservePath: '/chargingPoints/${pointId}/reservations',
  },
  bluePlug: {
    providerName: 'bluePlug',
    baseUrlDefault: 'https://davinci.softlab.ntua.gr/saas26/bluePlug/api',
    listPath: '/locations',
    detailPath: '/location/${pointId}',
    reservePath: '/location/${pointId}/hold',
    statusPath: '/location/${pointId}/status'
  },
};

function parsePathArgs(pathArgs) {
  // Supported formats (pathArgs is a string):
  // A) (key1, value1), (key2, value2), (key3, value3) ...
  // B) value1, value2, value3 ... (values-only, positional)
  // C) {key1:value1, key2:value2} (JSON object-like)

  if (typeof pathArgs !== 'string') return {};

  const trimmed = pathArgs.trim();
  if (!trimmed) return {};

  // C) JSON object
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      // Allow missing quotes around keys by converting to JSON-ish via Function.
      // If the string is already valid JSON, JSON.parse will work.
      try {
        return JSON.parse(trimmed);
      } catch {
        // Best-effort: evaluate as an object literal.
        // eslint-disable-next-line no-new-func
        const obj = new Function(`return (${trimmed});`)();
        if (obj && typeof obj === 'object') return obj;
      }
    } catch (e) {
      throw new Error(`Unsupported pathArgs format: ${pathArgs}`);
    }
  }

  const withoutPrefix = trimmed;


  // A) (key,value), (key2,value2)
  const tupleRegex = /\(\s*([^,()]+?)\s*,\s*([^,()]+?)\s*\)/g;
  const matches = [...withoutPrefix.matchAll(tupleRegex)];
  if (matches.length > 0) {
    const out = {};
    for (const m of matches) {
      const key = m[1].trim();
      const value = m[2].trim();
      out[key] = value;
    }
    return out;
  }

  // key=value pairs (best-effort)
  const kvRegex = /([^=,(){}]+?)=([^,(){}]+?)(?=\s*,\s*|\s*$)/g;
  const kvMatches = [...withoutPrefix.matchAll(kvRegex)];
  if (kvMatches.length > 0) {
    const out = {};
    for (const m of kvMatches) {
      const key = m[1].trim();
      const value = m[2].trim();
      out[key] = value;
    }
    return out;
  }

  // B) VALUES ONLY (positional): value1,value2,value3...
  if (!/[()=]/.test(withoutPrefix)) {
    const parts = withoutPrefix
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    if (parts.length > 0) {
      const out = {};
      parts.forEach((v, idx) => {
        out[`$${idx + 1}`] = v;
      });
      return out;
    }
  }

  throw new Error(`Unsupported pathArgs format: ${pathArgs}`);
}


/**
 * Build full URL for a provider.
 * @param {string} plugKey - e.g. "redPlug"
 * @param {string} pathKey - e.g. "listPath", "detailPath"
 * @param {string} pathArgs - used to fill ${...} tokens in the path template

 * @returns {string}
 */
function buildProviderUrl(plugKey, pathKey, pathArgs) {
  if (!plugKey || typeof plugKey !== 'string') {
    throw new Error('buildProviderUrl: plugKey must be a non-empty string');
  }
  if (!pathKey || typeof pathKey !== 'string') {
    throw new Error('buildProviderUrl: pathKey must be a non-empty string');
  }

  const providerConfig = PROVIDER_MAP[plugKey];
  if (!providerConfig) throw new Error(`Unknown plugKey: ${plugKey}`);

  const baseUrl = providerConfig.baseUrlDefault;
  if (!baseUrl) throw new Error(`Missing baseUrlDefault for plugKey: ${plugKey}`);

  const templatePath = providerConfig[pathKey];
  if (!templatePath) throw new Error(`Unknown pathKey: ${pathKey} for plugKey: ${plugKey}`);

  const argsObj = parsePathArgs(pathArgs);


  // Fill ${token} either by key match (token name)
  // or by positional fallback using $1,$2,... injected from "values only".
  const resolvedPath = templatePath.replace(/\$\{([^}]+)\}/g, (match, token) => {
    const key = String(token).trim();
    if (argsObj[key] !== undefined) {
      return encodeURIComponent(String(argsObj[key]));
    }

    // Positional fallback: ${anything} uses $1,$2,... in order.
    // We assume tokens appear left-to-right in the template.
    const allTokens = [...templatePath.matchAll(/\$\{([^}]+)\}/g)].map(m => m[1].trim());
    const index = allTokens.indexOf(key);

    if (index >= 0 && argsObj[`$${index + 1}`] !== undefined) {
      return encodeURIComponent(String(argsObj[`$${index + 1}`]));
    }

    throw new Error(`Missing path argument '${key}' required by ${pathKey} (${plugKey})`);
  });

  return `${baseUrl}${resolvedPath}`;
}

module.exports = {
  PROVIDER_MAP,
  buildProviderUrl,
};
