// File: api/src/services/cache.js
import NodeCache from 'node-cache';

// Renamed from priceCache to appCache
// stdTTL: 3 seconds will be the default TTL if not specified in .set()
// checkperiod: 1 s (how often to check for expired items)
const appCache = new NodeCache({ stdTTL: 60, checkperiod: 1 });

// You can now use appCache.set(key, value, ttlInSeconds) elsewhere
// or appCache.set(key, value) to use the stdTTL of 3 seconds.

export default appCache;
