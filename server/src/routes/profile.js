import { Router } from 'express';
import { GENDERS, MIN_AGE, TAGS } from '../../../shared/constants.js';
import { getUser, ownProfile } from '../model.js';
import { HttpError, int, listOf, num, photo, str } from '../util.js';

export function profileRoutes(db) {
  const r = Router();

  r.get('/', (req, res) => res.json(ownProfile(req.user)));

  r.put('/', (req, res) => {
    const b = req.body ?? {};
    const ageMin = int(b.ageMin, 'věk od', { min: MIN_AGE, max: 99 });
    const ageMax = int(b.ageMax, 'věk do', { min: MIN_AGE, max: 99 });
    if (ageMin > ageMax) throw new HttpError(400, 'Věk od musí být menší než věk do.');
    const stiTest = str(b.stiTest, 'poslední test', { max: 7, optional: true });
    if (stiTest && !/^\d{4}-\d{2}$/.test(stiTest)) throw new HttpError(400, 'Poslední test zadej jako RRRR-MM.');

    const fields = {
      name: str(b.name, 'jméno', { min: 2, max: 40 }),
      bio: str(b.bio, 'o mně', { max: 500, optional: true }),
      photo: photo(b.photo),
      gender: listOf([b.gender], 'pohlaví', GENDERS)[0],
      interested_in: JSON.stringify(listOf(b.interestedIn, 'koho hledáš', GENDERS, { min: 1 })),
      tags: JSON.stringify(listOf(b.tags ?? [], 'co hledám', TAGS)),
      boundaries: str(b.boundaries, 'hranice', { max: 500, optional: true }),
      sti_test: stiTest,
      age_min: ageMin,
      age_max: ageMax,
      max_distance_km: int(b.maxDistanceKm, 'vzdálenost', { min: 1, max: 500 }),
      trusted_name: str(b.trustedName, 'důvěryhodná osoba', { max: 60, optional: true }),
      trusted_phone: str(b.trustedPhone, 'telefon důvěryhodné osoby', { max: 30, optional: true }),
    };

    const columns = Object.keys(fields);
    db.prepare(`UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(
      ...columns.map((c) => fields[c]),
      req.user.id,
    );
    res.json(ownProfile(getUser(db, req.user.id)));
  });

  // Poloha pro hledání v okolí. Zaokrouhlujeme na ~1 km, přesnou polohu domova neukládáme.
  r.put('/location', (req, res) => {
    const lat = Math.round(num(req.body?.lat, 'lat', { min: -90, max: 90 }) * 100) / 100;
    const lng = Math.round(num(req.body?.lng, 'lng', { min: -180, max: 180 }) * 100) / 100;
    db.prepare('UPDATE users SET lat = ?, lng = ? WHERE id = ?').run(lat, lng, req.user.id);
    res.json(ownProfile(getUser(db, req.user.id)));
  });

  r.delete('/', (req, res) => {
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.status(204).end();
  });

  return r;
}
