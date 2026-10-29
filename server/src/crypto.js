import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

// Šifrování citlivých údajů v databázi – AES-256-GCM s verzovanými klíči (rotace bez výpadku).
//   text:   "v<verze>:<base64(iv | tag | data)>"
//   číslo:  "v<verze>n:<…>" (poloha) – po otevření se vrátí jako číslo
//   binární data (fotky): MAGIC | verze | iv | tag | data
// Nový záznam se vždy šifruje aktuálním klíčem, starší se dají přečíst, dokud je jejich klíč v keyringu.
// Skript scripts/rotate-keys.mjs přešifruje vše na aktuální klíč, pak jde starý klíč z keyringu vyřadit.

const SEALED_TEXT = /^v(\d+)(n?):([A-Za-z0-9+/]+={0,2})$/;
const MAGIC = Buffer.from('YYE', 'latin1');

/**
 * keys = "v2:<base64>,v1:<base64>" (první je aktuální) nebo jeden klíč v base64 (= v1).
 */
export function parseKeyring(spec) {
  const entries = String(spec ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = entry.match(/^v(\d+):(.+)$/);
      return m ? [Number(m[1]), m[2]] : [1, entry];
    });
  if (entries.length === 0) throw new Error('Chybí šifrovací klíč (DATA_KEY).');
  const keys = new Map();
  for (const [version, b64] of entries) {
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error(`Klíč v${version} musí být 32 bajtů v base64.`);
    if (version < 1 || version > 255) throw new Error('Verze klíče musí být 1–255.');
    if (keys.has(version)) throw new Error(`Klíč v${version} je v keyringu dvakrát.`);
    keys.set(version, key);
  }
  return { current: entries[0][0], keys };
}

export function createSealer(spec) {
  const { current, keys } = parseKeyring(spec);
  const keyFor = (version) => {
    const key = keys.get(version);
    if (!key) throw new Error(`Chybí klíč v${version} pro dešifrování.`);
    return key;
  };
  const encrypt = (version, plain) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyFor(version), iv);
    const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), enc]);
  };
  const decrypt = (version, raw) => {
    const decipher = createDecipheriv('aes-256-gcm', keyFor(version), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]);
  };

  const sealer = {
    current,
    /** Zašifruje text (nebo číslo). Prázdná hodnota a null zůstávají, jak jsou. */
    seal(value) {
      if (value === null || value === undefined || value === '') return value ?? '';
      if (typeof value === 'number') return `v${current}n:${encrypt(current, Buffer.from(String(value))).toString('base64')}`;
      return `v${current}:${encrypt(current, Buffer.from(String(value), 'utf8')).toString('base64')}`;
    },
    /** Dešifruje; nezašifrovanou (nebo už dešifrovanou) hodnotu vrátí beze změny. */
    open(value) {
      if (typeof value !== 'string') return value;
      const m = value.match(SEALED_TEXT);
      if (!m) return value;
      const plain = decrypt(Number(m[1]), Buffer.from(m[3], 'base64')).toString('utf8');
      return m[2] ? Number(plain) : plain;
    },
    /** Jako open, ale text, který jen vypadá jako šifra (zpráva „v1:abc“), vrátí beze změny. */
    openText(value) {
      try {
        return sealer.open(value);
      } catch {
        return value;
      }
    },
    sealBytes(buf) {
      return Buffer.concat([MAGIC, Buffer.from([current]), encrypt(current, Buffer.from(buf))]);
    },
    openBytes(buf) {
      if (!isSealedBytes(buf)) return buf;
      const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);
      return decrypt(b[3], b.subarray(4));
    },
    isSealed: (value) => (typeof value === 'string' ? SEALED_TEXT.test(value) : isSealedBytes(value)),
    /** Verze klíče, kterým je hodnota zašifrovaná (null = nezašifrovaná). */
    versionOf(value) {
      if (typeof value === 'string') {
        const m = value.match(SEALED_TEXT);
        return m ? Number(m[1]) : null;
      }
      return isSealedBytes(value) ? value[3] : null;
    },
    /** Pro automatické dešifrování výsledků dotazů: poškozená nebo cizí hodnota se vrátí, jak je. */
    tryOpen(value) {
      try {
        if (typeof value === 'string') return sealer.open(value);
        if (value instanceof Uint8Array) return sealer.openBytes(value);
      } catch {
        // text, který jen vypadá jako šifra (např. zpráva „v1:abc“), necháme být
      }
      return value;
    },
  };
  return sealer;
}

function isSealedBytes(buf) {
  return buf instanceof Uint8Array && buf.length > 32 && buf[0] === MAGIC[0] && buf[1] === MAGIC[1] && buf[2] === MAGIC[2];
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

/** Odvozený klíč pro jeden účel (HKDF), ať jedno tajemství neslouží víc věcem naráz. */
export const deriveKey = (secret, purpose) => Buffer.from(hkdfSync('sha256', Buffer.from(String(secret)), Buffer.alloc(0), `yesyes:${purpose}`, 32));

/** Slepý index e-mailu: jde podle něj hledat, ale e-mail z něj nezjistíš. */
export const emailIndex = (indexKey, email) => createHmac('sha256', indexKey).update(String(email).trim().toLowerCase()).digest('hex');

/** Tokeny (přihlášení, kódy) se ukládají jen jako SHA-256 otisk – únik databáze je nevyzradí. */
export const tokenHash = (value) => createHash('sha256').update(String(value)).digest('hex');

export function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}
