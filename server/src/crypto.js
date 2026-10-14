import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

/** Šifrování citlivých textů v databázi (zprávy, poznámky, nahlášení) – AES-256-GCM. */
export function createSealer(keyBase64) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('DATA_KEY musí být 32 bajtů v base64.');
  return {
    seal(text) {
      if (!text) return '';
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
      return `v1:${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64')}`;
    },
    open(sealed) {
      if (!sealed) return '';
      const raw = Buffer.from(sealed.slice(3), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
    },
  };
}

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Otisk identity pro ban a pravidlo „jeden člověk = jeden účet“.
 * Ukládáme jen HMAC, z něhož nejde zpětně zjistit jméno ani číslo dokladu.
 */
export function identityHash(secret, ...parts) {
  return createHmac('sha256', secret).update(parts.map(normalize).join('|')).digest('hex');
}
