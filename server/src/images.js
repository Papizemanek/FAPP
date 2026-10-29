import { HttpError, nowIso, token } from './util.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

// Ponecháváme jen APP0 (JFIF) a APP14 (Adobe – ovlivňuje barvy). Ostatní APPn segmenty
// (EXIF s GPS polohou, XMP, ICC s modelem telefonu…) a komentáře zahazujeme.
const KEEP_APP = new Set([0xe0, 0xee]);

/**
 * Odstraní z JPEGu metadata, hlavně GPS souřadnice místa, kde byla fotka pořízená.
 * Aplikace posílá fotku už otočenou správně (expo-image-manipulator), takže EXIF orientace není potřeba.
 */
export function stripJpegMetadata(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new HttpError(400, 'photo.notJpeg');
  const bad = () => new HttpError(400, 'photo.corrupt');
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw bad();
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xda) {
      out.push(buf.subarray(i)); // začátek obrazových dat, zbytek souboru jen kopírujeme
      return Buffer.concat(out);
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      return Buffer.concat(out);
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 4 > buf.length) throw bad();
    const end = i + 2 + buf.readUInt16BE(i + 2);
    if (end > buf.length) throw bad();
    const isMetadata = (marker >= 0xe0 && marker <= 0xef && !KEEP_APP.has(marker)) || marker === 0xfe;
    if (!isMetadata) out.push(buf.subarray(i, end));
    i = end;
  }
  throw bad();
}

export function saveImage(db, { ownerId, kind, matchId = null, base64 }) {
  if (typeof base64 !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
    throw new HttpError(400, 'photo.notBase64');
  }
  const raw = Buffer.from(base64, 'base64');
  if (raw.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'photo.tooLarge');
  const clean = stripJpegMetadata(raw);
  const id = token(16);
  db.prepare('INSERT INTO images (id, owner_id, kind, match_id, data, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    ownerId,
    kind,
    matchId,
    db.sealBytes(clean),
    nowIso(),
  );
  return id;
}

export const imageUrl = (id) => (id ? `/api/images/${id}` : null);
