import { HttpError } from '../util.js';

/** Jednoduchý limit požadavků v paměti (na jeden proces). limiter('login', 10) = 10 za minutu. */
export function createLimiter({ enabled = true } = {}) {
  const hits = new Map();
  let calls = 0;

  return (name, perMinute) => (req, _res, next) => {
    if (!enabled) return next();
    const now = Date.now();
    if (++calls % 1000 === 0) {
      for (const [key, times] of hits) if (now - times[times.length - 1] > 60_000) hits.delete(key);
    }
    const key = `${name}:${req.user?.id ?? req.ip}`;
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) throw new HttpError(429, 'errors.rateLimited');
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
