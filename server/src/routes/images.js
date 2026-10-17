import { Router } from 'express';
import { isBlocked } from '../model.js';
import { HttpError } from '../util.js';
import { requireAuth } from './auth.js';

// Fotky se servírují jen přihlášeným: profilové všem, kdo nejsou zablokovaní,
// fotky z chatu jen oběma stranám daného matche.
export function imageRoutes({ db }) {
  const r = Router();
  r.use(requireAuth(db, { allowSuspended: true }));

  r.get('/:id', (req, res) => {
    const img = db.prepare('SELECT * FROM images WHERE id = ?').get(req.params.id);
    if (!img) throw new HttpError(404, 'photo.notFound');
    const viewer = req.user.id;
    let allowed = img.owner_id === viewer;
    if (!allowed && img.kind === 'profile') allowed = !isBlocked(db, viewer, img.owner_id);
    if (!allowed && img.kind === 'chat') {
      allowed = !!db
        .prepare('SELECT 1 FROM matches WHERE id = ? AND (user_a = ? OR user_b = ?)')
        .get(img.match_id, viewer, viewer);
    }
    if (!allowed) throw new HttpError(404, 'photo.notFound');
    res.set('Content-Type', 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=86400');
    res.send(Buffer.from(img.data));
  });

  return r;
}
