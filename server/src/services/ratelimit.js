import { HttpError } from '../util.js';

/**
 * Limit požadavků: limiter('login', 10) = 10 za minutu na přihlášeného uživatele, jinak na IP adresu.
 * Počítadla jsou v databázi (pevné minutové okno), takže platí i po restartu serveru.
 */
export function createLimiter({ enabled = true, db } = {}) {
  let calls = 0;
  return (name, perMinute) => (req, _res, next) => {
    if (!enabled) return next();
    const window = Math.floor(Date.now() / 60_000);
    if (++calls % 500 === 0) db.prepare('DELETE FROM rate_hits WHERE win < ?').run(window - 1);
    const key = `${name}:${req.user?.id ?? req.ip}`;
    const row = db
      .prepare(
        `INSERT INTO rate_hits (key, win, hits) VALUES (?, ?, 1)
         ON CONFLICT(key, win) DO UPDATE SET hits = hits + 1 RETURNING hits`,
      )
      .get(key, window);
    if (row.hits > perMinute) throw new HttpError(429, 'errors.rateLimited');
    next();
  };
}
