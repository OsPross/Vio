'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage, powerMonitor, clipboard } = require('electron');

const MAGIC = 'DXPW';
const VERSION = 2;
/** v1 used N=16384; v2 raises cost. Migration on unlock. */
const SCRYPT_V1 = { N: 16384, r: 8, p: 1, keyLen: 32 };
const SCRYPT = { N: 131072, r: 8, p: 1, keyLen: 32 };
const CLIPBOARD_CLEAR_MS = 30_000;
const DEFAULT_IDLE_MIN = 15;

/** @typedef {{ id: string, origin: string, username: string, password: string, note: string, totpSecret: string, createdAt: number, lastUsedAt: number, updatedAt: number }} VaultEntry */
/** @typedef {{ entries: VaultEntry[], neverSave: string[] }} VaultData */

/** @type {Buffer | null} */
let unlockedKey = null;
/** @type {VaultData | null} */
let vault = null;
/** @type {string | null} */
let vaultPath = null;
/** @type {string | null} */
let rememberPath = null;
let lastActivity = 0;
let idleMinutes = DEFAULT_IDLE_MIN;
/** @type {ReturnType<typeof setInterval> | null} */
let idleTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let clipboardTimer = null;
/** @type {((locked: boolean) => void) | null} */
let onLockNotify = null;
/** @type {{ origin: string, username: string, password: string, mode: string, id?: string, expires: number } | null} */
let pendingSave = null;

const EFF_WORDS = (
  'able acid also apex aqua arch area army atom aunt auto avoid awake ' +
  'bacon badge baker basil beach beans begin being belly berry black blade ' +
  'blame blank blast blaze bleak blend bless blind block blood bloom blown ' +
  'board boast boats bones bonus books boost booth boots bound boxer brace ' +
  'brain brand brass brave bread break breed brick bride brief bring broad ' +
  'broke brook brown brush buddy build built bunch bunny burn burst buyer ' +
  'cabin cable cactus cafe cage cake calm camel camp canal candy canoe canvas ' +
  'cape carbon card cargo carol carry carve case cash catch cause cave cedar ' +
  'chain chair chalk champ chant chaos charm chart chase cheap check chess ' +
  'chest chief child china chip choir chord chunk cider cigar civic civil ' +
  'claim clamp clang clasp class clean clear clerk click cliff climb cling ' +
  'clock clone close cloth cloud clown coach coast cocoa code coffee coil ' +
  'coin cold colon color comet comic coral cord cork corn cost couch cover ' +
  'crack craft crane crash crawl crazy cream credit creek crime crisp crop ' +
  'cross crowd crown crude crush cube cumin cupid curly curve cycle daily ' +
  'dairy daisy dance Daring dark dart dash data dawn deal dear debit decoy ' +
  'delay delta demon denim dense depot depth derby desk dial diary digit ' +
  'dine dirty disco ditch diver dizzy dock dodge donor donor door dose doubt ' +
  'dough dover draft drain drama drank draw dream dress drift drill drink ' +
  'drive drone drop drown drum dryer eager eagle early earth easel eaten ' +
  'ebony echo edge eight elbow elder elite empty enact enemy enjoy entry ' +
  'equal erase error essay ethan event every exact exile exist extra fable ' +
  'facet fade faint faith false fancy farce fatal fault favor feast ferry ' +
  'fever fiber field fifty fight film final finch first fish five flame ' +
  'flare flash flask fleet flesh flint float flock flood floor flora flour ' +
  'fluid flush foam focus foggy force forge forget forum fossil found frame ' +
  'frank fraud fresh fridge friend frog front frost fruit funny fuse fuzzy ' +
  'gauge ghost giant gift gipsy given glass gleam globe glory glove glow ' +
  'grape grass green greet grill groan groom group grove grow guard guess ' +
  'guest guide guild guilt guitar gusto habit happy harbor hardy harsh haste ' +
  'hatch haven hazard head heart heavy hedge hello help herb hero high ' +
  'hiker hill hinge hippo hobby honey honor hope horse hotel hover human ' +
  'humid humor hurry husky icon ideal idle image inbox index inland inlet ' +
  'inner input iris iron island ivory jacket jaguar jazz jelly jewel joint ' +
  'jolly judge juice jumbo jumper jungle junior kangaroo karma kayak keen ' +
  'kettle key kid kind king kite kiwi knife knight koala label labor ladder ' +
  'lager lake lamp lance land large laser later laugh layer leaf learn ' +
  'lemon level light lilac limit linen lion list liver lizard loaf local ' +
  'lodge logic lotus loyal lucky lunar lunch lyric magic magnet major maker ' +
  'mango maple march marsh match maybe medal media melon mercy merit merry ' +
  'metal meter micro midday midnight mild milk mint mirror mist mixed model ' +
  'modem moist month moose moral motor motto mount mouse mouth movie music ' +
  'myth nail navy near nectar needle nerve nest never night noble noise ' +
  'north novel nurse oasis obey object ocean offer olive omega onion opera ' +
  'orbit order organ other otter outer oven owner oxide oxygen ozone packet ' +
  'paddle page paint palace panda panel panic paper parade parent park party ' +
  'pasta patch path patio pause peace peach pearl pedal penguin pepper perch ' +
  'petal phase phone photo piano piece pigeon pilot pinch pine pipe pixel ' +
  'pizza plain plane plant plate plaza plow plum pocket poem polar pond ' +
  'pony pool poppy porch portal power prairie press pride prime print prize ' +
  'proof proud prune pulse punch pupil puppy purple puzzle quail queen ' +
  'query quest quick quiet quilt quote rabbit radar radio radius rainy raise ' +
  'rally ranch rapid raven razor ready realm rebel recall recipe reef ' +
  'refer relax remake remote renew repay reply resin rider ridge rifle ' +
  'right rigid river roast robin robot rocky roller roman roof rope ' +
  'rose rough round route royal rugby ruler rural sabre saddle safari ' +
  'salad salon salty sandy sauce scale scare scene scent school scoop ' +
  'scope score scout scrap screen script scrub sea seal search season ' +
  'secret seed seize sense serene serve seven shade shadow shaft shake ' +
  'shame shape share shark sharp shawl sheep shelf shell shift shine ' +
  'shirt shock shoot shore short shout shovel shrimp shrug sight silk ' +
  'silly silver simple since singer siren sister sketch skill skirt skull ' +
  'slate sleep slice slide slope smile smoke snack snake snare snow soap ' +
  'sober soccer social soda solar solid solve sonic sorry sound south ' +
  'space spare spark speak speed spell spend spice spider spike spin ' +
  'spine spirit splash split spoil spoke sponge spoon sport spray spring ' +
  'square stable stack staff stage stain stair stake stamp stand start ' +
  'state steak steam steel steep stem step stern stick still stock ' +
  'stone stool store storm story stove strap straw stream street stress ' +
  'strict strike string strong studio study stuff stump style sugar suite ' +
  'sunny super surge sushi swamp swan sweat sweet swift swing sword ' +
  'syrup table tablet tackle talent talk tango tank tape target taste ' +
  'taxi teach team teeth tempo tenant tennis terrace thank theme theory ' +
  'there thick thief thigh thing think third thorn those three throw ' +
  'thumb thunder ticket tidal tiger timber title toast token tomato ' +
  'tongue topic torch tortoise total touch tower toxic trace track trade ' +
  'trail train tramp trash treat tree trend trial tribe trick troop ' +
  'trophy truck truly trumpet trust truth tube tulip tunnel turkey turn ' +
  'turtle twelve twenty twin twist typhoon ultra uncle under union ' +
  'unique unit unity until upper urban urge usage useful vacuum valley ' +
  'valve vapor vault velvet vendor venom venue verb verify verse vessel ' +
  'vest veteran vibrant video viking villa vinyl violin virus vision ' +
  'visit vital vivid vocal voice volcano volume voyage waffle waist ' +
  'walnut waltz warm wash water wave wealth weapon week weird whale ' +
  'wheat wheel where which while whirl white whole widen width wild ' +
  'willow wind wine wing winter wire wisdom witch wolf woman wonder ' +
  'wood wool word work world worry worth wrap wreck wrist write wrong ' +
  'yacht year yellow yield young youth zebra zero zinc zone zoom'
)
  .toLowerCase()
  .split(/\s+/)
  .filter(Boolean);

function paths() {
  if (!vaultPath) {
    const dir = app.getPath('userData');
    vaultPath = path.join(dir, 'djxxr-passwords.vault');
    rememberPath = path.join(dir, 'djxxr-passwords.remember');
  }
  return { vaultPath, rememberPath };
}

function b64(buf) {
  return Buffer.from(buf).toString('base64');
}

function fromB64(s) {
  return Buffer.from(String(s || ''), 'base64');
}

function touchActivity() {
  lastActivity = Date.now();
}

function emptyVault() {
  return { entries: [], neverSave: [] };
}

function publicEntry(e) {
  return {
    id: e.id,
    origin: e.origin,
    username: e.username,
    note: e.note || '',
    hasTotp: Boolean(e.totpSecret),
    createdAt: e.createdAt,
    lastUsedAt: e.lastUsedAt,
    updatedAt: e.updatedAt,
  };
}

function normalizeOrigin(input) {
  try {
    const u = new URL(String(input || ''));
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return u.origin;
  } catch {
    return '';
  }
}

function isHttpsOrigin(origin) {
  return /^https:\/\//i.test(origin);
}

function deriveKey(password, salt, params = SCRYPT) {
  return crypto.scryptSync(String(password), salt, params.keyLen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 256 * 1024 * 1024,
  });
}

function encryptBlob(key, plaintextObj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(plaintextObj), 'utf8');
  const enc = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv: b64(iv), tag: b64(tag), ciphertext: b64(enc) };
}

function decryptBlob(key, envelope) {
  const iv = fromB64(envelope.iv);
  const tag = fromB64(envelope.tag);
  const data = fromB64(envelope.ciphertext);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}

function readFileEnvelope() {
  const { vaultPath: vp } = paths();
  if (!fs.existsSync(vp)) return null;
  const raw = fs.readFileSync(vp, 'utf8');
  const env = JSON.parse(raw);
  if (env.magic !== MAGIC) throw new Error('Nieobsługiwany format sejfu');
  if (env.version !== 1 && env.version !== 2) throw new Error('Nieobsługiwana wersja sejfu');
  return env;
}

function writeFileEnvelope(env) {
  const { vaultPath: vp } = paths();
  const tmp = `${vp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(env), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, vp);
}

function persistUnlocked() {
  if (!unlockedKey || !vault) throw new Error('Sejf zablokowany');
  const env = readFileEnvelope();
  if (!env) throw new Error('Brak pliku sejfu');
  const blob = encryptBlob(unlockedKey, vault);
  env.iv = blob.iv;
  env.tag = blob.tag;
  env.ciphertext = blob.ciphertext;
  writeFileEnvelope(env);
}

function clearRemember() {
  const { rememberPath: rp } = paths();
  try {
    if (rp && fs.existsSync(rp)) fs.unlinkSync(rp);
  } catch {
    /* */
  }
}

function saveRememberKey(key) {
  const { rememberPath: rp } = paths();
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('safeStorage niedostępny na tym systemie');
  }
  const wrapped = safeStorage.encryptString(b64(key));
  fs.writeFileSync(rp, wrapped, { mode: 0o600 });
}

function loadRememberKey() {
  const { rememberPath: rp } = paths();
  if (!rp || !fs.existsSync(rp)) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    const wrapped = fs.readFileSync(rp);
    const b64key = safeStorage.decryptString(wrapped);
    return fromB64(b64key);
  } catch {
    clearRemember();
    return null;
  }
}

function lockVault(reason = 'manual') {
  if (unlockedKey) {
    unlockedKey.fill(0);
  }
  unlockedKey = null;
  vault = null;
  if (onLockNotify) {
    try {
      onLockNotify(true);
    } catch {
      /* */
    }
  }
  return { ok: true, reason };
}

function ensureIdleWatch() {
  if (idleTimer) return;
  idleTimer = setInterval(() => {
    if (!unlockedKey) return;
    const limit = Math.max(1, idleMinutes) * 60_000;
    if (Date.now() - lastActivity > limit) lockVault('idle');
  }, 15_000);
}

function attachPowerMonitor() {
  try {
    powerMonitor.on('suspend', () => {
      if (unlockedKey) lockVault('suspend');
    });
    powerMonitor.on('lock-screen', () => {
      if (unlockedKey) lockVault('screen-lock');
    });
  } catch {
    /* */
  }
}

function status() {
  const env = (() => {
    try {
      return readFileEnvelope();
    } catch {
      return null;
    }
  })();
  const { rememberPath: rp } = paths();
  const remember = Boolean(rp && fs.existsSync(rp));
  return {
    setup: Boolean(env),
    unlocked: Boolean(unlockedKey && vault),
    remember,
    rememberAvailable: safeStorage.isEncryptionAvailable(),
    entryCount: vault ? vault.entries.length : env?.entryCount ?? 0,
    idleMinutes,
  };
}

function setup(masterPassword, remember) {
  if (typeof masterPassword !== 'string' || masterPassword.length < 8) {
    return { ok: false, error: 'Hasło główne: minimum 8 znaków' };
  }
  if (readFileEnvelope()) return { ok: false, error: 'Sejf już istnieje' };
  const salt = crypto.randomBytes(16);
  const key = deriveKey(masterPassword, salt);
  vault = emptyVault();
  unlockedKey = key;
  touchActivity();
  const blob = encryptBlob(key, vault);
  writeFileEnvelope({
    magic: MAGIC,
    version: VERSION,
    kdf: { name: 'scrypt', salt: b64(salt), ...SCRYPT },
    iv: blob.iv,
    tag: blob.tag,
    ciphertext: blob.ciphertext,
    entryCount: 0,
    createdAt: Date.now(),
  });
  if (remember) {
    try {
      saveRememberKey(key);
    } catch (e) {
      return { ok: true, rememberError: String(e.message || e) };
    }
  } else clearRemember();
  ensureIdleWatch();
  return { ok: true, ...status() };
}

function unlockWithKey(key) {
  const env = readFileEnvelope();
  if (!env) return { ok: false, error: 'Brak sejfu' };
  try {
    vault = decryptBlob(key, env);
    if (!vault.entries) vault.entries = [];
    if (!vault.neverSave) vault.neverSave = [];
    unlockedKey = key;
    touchActivity();
    ensureIdleWatch();
    env.entryCount = vault.entries.length;
    writeFileEnvelope(env);
    return { ok: true, ...status() };
  } catch {
    return { ok: false, error: 'Błędne hasło lub uszkodzony sejf' };
  }
}

function migrateToV2(masterPassword) {
  if (!unlockedKey || !vault) return;
  const newSalt = crypto.randomBytes(16);
  const newKey = deriveKey(masterPassword, newSalt, SCRYPT);
  const blob = encryptBlob(newKey, vault);
  const prev = readFileEnvelope() || {};
  writeFileEnvelope({
    magic: MAGIC,
    version: VERSION,
    kdf: { name: 'scrypt', salt: b64(newSalt), ...SCRYPT },
    iv: blob.iv,
    tag: blob.tag,
    ciphertext: blob.ciphertext,
    entryCount: vault.entries.length,
    createdAt: prev.createdAt || Date.now(),
    migratedAt: Date.now(),
  });
  unlockedKey.fill(0);
  unlockedKey = newKey;
  if (fs.existsSync(paths().rememberPath)) {
    try {
      saveRememberKey(newKey);
    } catch {
      clearRemember();
    }
  }
}

function unlock(masterPassword, remember) {
  const env = readFileEnvelope();
  if (!env) return { ok: false, error: 'Najpierw utwórz sejf' };
  if (typeof masterPassword !== 'string' || !masterPassword) {
    return { ok: false, error: 'Podaj hasło główne' };
  }
  const params = {
    N: env.kdf.N || SCRYPT_V1.N,
    r: env.kdf.r || SCRYPT_V1.r,
    p: env.kdf.p || SCRYPT_V1.p,
    keyLen: env.kdf.keyLen || SCRYPT_V1.keyLen,
  };
  const salt = fromB64(env.kdf.salt);
  const key = deriveKey(masterPassword, salt, params);
  const res = unlockWithKey(key);
  if (!res.ok) {
    key.fill(0);
    return res;
  }
  const needsMigrate = env.version < VERSION || (env.kdf.N || 0) < SCRYPT.N;
  if (needsMigrate) {
    try {
      migrateToV2(masterPassword);
      res.migrated = true;
    } catch (e) {
      res.migrateError = String(e.message || e);
    }
  }
  if (remember === true) {
    try {
      saveRememberKey(unlockedKey);
    } catch (e) {
      return { ...res, rememberError: String(e.message || e) };
    }
  } else if (remember === false) {
    clearRemember();
  }
  return res;
}

function tryAutoUnlock() {
  if (unlockedKey) return status();
  const key = loadRememberKey();
  if (!key) return status();
  const res = unlockWithKey(key);
  if (!res.ok) key.fill(0);
  return status();
}

function requireUnlocked() {
  if (!unlockedKey || !vault) {
    const err = new Error('Sejf zablokowany');
    err.code = 'LOCKED';
    throw err;
  }
  touchActivity();
}

function listEntries(query) {
  requireUnlocked();
  const q = String(query || '')
    .trim()
    .toLowerCase();
  let items = vault.entries.map(publicEntry);
  if (q) {
    items = items.filter(
      (e) =>
        e.origin.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        (e.note || '').toLowerCase().includes(q),
    );
  }
  items.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  return items;
}

function findForOrigin(pageUrl) {
  requireUnlocked();
  const origin = normalizeOrigin(pageUrl);
  if (!origin || !isHttpsOrigin(origin)) return [];
  return vault.entries
    .filter((e) => e.origin === origin)
    .map(publicEntry)
    .sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
}

function getEntry(id) {
  requireUnlocked();
  const e = vault.entries.find((x) => x.id === id);
  if (!e) throw new Error('Nie znaleziono wpisu');
  return {
    ...publicEntry(e),
    password: e.password,
    totpSecret: e.totpSecret || '',
  };
}

function getPasswordForAutofill(id, pageUrl) {
  requireUnlocked();
  const origin = normalizeOrigin(pageUrl);
  if (!origin || !isHttpsOrigin(origin)) {
    throw new Error('Autouzupełnianie tylko na HTTPS i zgodnym origin');
  }
  const e = vault.entries.find((x) => x.id === id);
  if (!e) throw new Error('Nie znaleziono wpisu');
  if (e.origin !== origin) throw new Error('Origin nie pasuje');
  e.lastUsedAt = Date.now();
  persistUnlocked();
  return { username: e.username, password: e.password };
}

function addEntry(input) {
  requireUnlocked();
  const origin = normalizeOrigin(input.origin || input.url);
  if (!origin) throw new Error('Nieprawidłowy origin');
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  if (!username && !password) throw new Error('Pusty wpis');
  const now = Date.now();
  const entry = {
    id: crypto.randomUUID(),
    origin,
    username,
    password,
    note: String(input.note || ''),
    totpSecret: String(input.totpSecret || '').replace(/\s+/g, '').toUpperCase(),
    createdAt: now,
    lastUsedAt: now,
    updatedAt: now,
  };
  vault.entries.push(entry);
  const env = readFileEnvelope();
  if (env) env.entryCount = vault.entries.length;
  persistUnlocked();
  if (env) writeFileEnvelope({ ...readFileEnvelope(), entryCount: vault.entries.length });
  return publicEntry(entry);
}

function updateEntry(id, patch) {
  requireUnlocked();
  const e = vault.entries.find((x) => x.id === id);
  if (!e) throw new Error('Nie znaleziono wpisu');
  if (patch.origin != null || patch.url != null) {
    const origin = normalizeOrigin(patch.origin || patch.url);
    if (!origin) throw new Error('Nieprawidłowy origin');
    e.origin = origin;
  }
  if (patch.username != null) e.username = String(patch.username);
  if (patch.password != null) e.password = String(patch.password);
  if (patch.note != null) e.note = String(patch.note);
  if (patch.totpSecret != null) {
    e.totpSecret = String(patch.totpSecret).replace(/\s+/g, '').toUpperCase();
  }
  e.updatedAt = Date.now();
  persistUnlocked();
  const env = readFileEnvelope();
  if (env) {
    env.entryCount = vault.entries.length;
    writeFileEnvelope(env);
  }
  return publicEntry(e);
}

function removeEntry(id) {
  requireUnlocked();
  const before = vault.entries.length;
  vault.entries = vault.entries.filter((x) => x.id !== id);
  if (vault.entries.length === before) throw new Error('Nie znaleziono wpisu');
  persistUnlocked();
  const env = readFileEnvelope();
  if (env) {
    env.entryCount = vault.entries.length;
    writeFileEnvelope(env);
  }
  return { ok: true };
}

function neverSaveAdd(originInput) {
  requireUnlocked();
  const origin = normalizeOrigin(originInput);
  if (!origin) throw new Error('Nieprawidłowy origin');
  if (!vault.neverSave.includes(origin)) vault.neverSave.push(origin);
  persistUnlocked();
  return { ok: true, neverSave: [...vault.neverSave] };
}

function neverSaveList() {
  requireUnlocked();
  return [...vault.neverSave];
}

function neverSaveRemove(originInput) {
  requireUnlocked();
  const origin = normalizeOrigin(originInput);
  vault.neverSave = vault.neverSave.filter((o) => o !== origin);
  persistUnlocked();
  return { ok: true };
}

function shouldOfferSave(pageUrl, username, password) {
  requireUnlocked();
  const origin = normalizeOrigin(pageUrl);
  if (!origin || !isHttpsOrigin(origin)) return { offer: false, reason: 'insecure' };
  if (vault.neverSave.includes(origin)) return { offer: false, reason: 'never' };
  const user = String(username || '');
  const pass = String(password || '');
  if (!pass) return { offer: false, reason: 'empty' };
  const existing = vault.entries.find((e) => e.origin === origin && e.username === user);
  if (existing && existing.password === pass) return { offer: false, reason: 'unchanged' };
  pendingSave = {
    origin,
    username: user,
    password: pass,
    mode: existing ? 'update' : 'create',
    id: existing?.id,
    expires: Date.now() + 120_000,
  };
  if (existing) {
    return {
      offer: true,
      mode: 'update',
      id: existing.id,
      origin,
      username: user,
    };
  }
  return { offer: true, mode: 'create', origin, username: user };
}

function confirmPendingSave() {
  requireUnlocked();
  if (!pendingSave || pendingSave.expires < Date.now()) {
    pendingSave = null;
    throw new Error('Brak oczekującego zapisu');
  }
  const p = pendingSave;
  pendingSave = null;
  if (p.mode === 'update' && p.id) {
    return updateEntry(p.id, { password: p.password, username: p.username });
  }
  return addEntry({ origin: p.origin, username: p.username, password: p.password });
}

function dismissPendingSave() {
  if (pendingSave) {
    pendingSave.password = '';
    pendingSave = null;
  }
  return { ok: true };
}

function passwordStrength(pw) {
  const s = String(pw || '');
  let score = 0;
  if (s.length >= 8) score += 1;
  if (s.length >= 12) score += 1;
  if (s.length >= 16) score += 1;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) score += 1;
  if (/\d/.test(s)) score += 1;
  if (/[^A-Za-z0-9]/.test(s)) score += 1;
  const labels = ['bardzo słabe', 'słabe', 'średnie', 'dobre', 'silne', 'bardzo silne'];
  return { score: Math.min(score, 5), label: labels[Math.min(score, 5)], length: s.length };
}

function generatePassword(opts = {}) {
  const length = Math.min(128, Math.max(8, Number(opts.length) || 20));
  const useLower = opts.lower !== false;
  const useUpper = opts.upper !== false;
  const useDigits = opts.digits !== false;
  const useSymbols = opts.symbols === true;
  const passphrase = opts.passphrase === true;
  const words = Math.min(10, Math.max(3, Number(opts.words) || 5));

  if (passphrase) {
    const parts = [];
    for (let i = 0; i < words; i++) {
      const idx = crypto.randomInt(0, EFF_WORDS.length);
      parts.push(EFF_WORDS[idx]);
    }
    const sep = opts.separator || '-';
    const phrase = parts.join(sep);
    return { password: phrase, ...passwordStrength(phrase), kind: 'passphrase' };
  }

  let alphabet = '';
  if (useLower) alphabet += 'abcdefghijkmnopqrstuvwxyz';
  if (useUpper) alphabet += 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  if (useDigits) alphabet += '23456789';
  if (useSymbols) alphabet += '!@#$%^&*-_=+?';
  if (!alphabet) alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return { password: out, ...passwordStrength(out), kind: 'password' };
}

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const cleaned = String(secret || '')
    .toUpperCase()
    .replace(/=+$/, '')
    .replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const c of cleaned) {
    const val = alphabet.indexOf(c);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function totpCode(secret, step = 30, digits = 6) {
  const key = base32Decode(secret);
  if (!key.length) throw new Error('Nieprawidłowy sekret TOTP');
  const counter = Math.floor(Date.now() / 1000 / step);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter & 0xffffffff, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const str = String(code % 10 ** digits).padStart(digits, '0');
  const remaining = step - (Math.floor(Date.now() / 1000) % step);
  return { code: str, remaining };
}

function getTotp(id) {
  requireUnlocked();
  const e = vault.entries.find((x) => x.id === id);
  if (!e || !e.totpSecret) throw new Error('Brak TOTP');
  return totpCode(e.totpSecret);
}

async function copyPassword(id) {
  requireUnlocked();
  const e = vault.entries.find((x) => x.id === id);
  if (!e) throw new Error('Nie znaleziono wpisu');
  const written = clipboard.writeText(e.password);
  if (written && typeof written.then === 'function') await written;
  e.lastUsedAt = Date.now();
  persistUnlocked();
  if (clipboardTimer) clearTimeout(clipboardTimer);
  const snapshot = e.password;
  clipboardTimer = setTimeout(() => {
    void (async () => {
      try {
        let text = clipboard.readText();
        if (text && typeof text.then === 'function') text = await text;
        if (text === snapshot) {
          const cleared = clipboard.clear?.();
          if (cleared && typeof cleared.then === 'function') await cleared;
        }
      } catch {
        /* */
      }
    })();
  }, CLIPBOARD_CLEAR_MS);
  return { ok: true, clearMs: CLIPBOARD_CLEAR_MS };
}

function audit() {
  requireUnlocked();
  const byPass = new Map();
  const weak = [];
  const reused = [];
  const old = [];
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

  for (const e of vault.entries) {
    const st = passwordStrength(e.password);
    if (st.score <= 2) weak.push({ ...publicEntry(e), strength: st.label });
    if (!byPass.has(e.password)) byPass.set(e.password, []);
    byPass.get(e.password).push(e);
    if ((e.updatedAt || e.createdAt) < yearAgo) {
      old.push(publicEntry(e));
    }
  }
  for (const [, group] of byPass) {
    if (group.length > 1) {
      for (const e of group) reused.push(publicEntry(e));
    }
  }
  return {
    total: vault.entries.length,
    weak,
    reused,
    old,
  };
}

function escapeCsv(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function exportCsv(masterPassword) {
  requireUnlocked();
  const env = readFileEnvelope();
  if (!env) throw new Error('Brak sejfu');
  const salt = fromB64(env.kdf.salt);
  const key = deriveKey(masterPassword, salt, {
    N: env.kdf.N || SCRYPT.N,
    r: env.kdf.r || SCRYPT.r,
    p: env.kdf.p || SCRYPT.p,
    keyLen: env.kdf.keyLen || SCRYPT.keyLen,
  });
  const check = Buffer.compare(key, unlockedKey) === 0;
  key.fill(0);
  if (!check) throw new Error('Błędne hasło główne');

  const lines = ['url,username,password,extra,name,grouping,fav'];
  for (const e of vault.entries) {
    lines.push(
      [
        escapeCsv(e.origin),
        escapeCsv(e.username),
        escapeCsv(e.password),
        escapeCsv(e.note),
        escapeCsv(new URL(e.origin).hostname),
        '',
        '0',
      ].join(','),
    );
  }
  return { ok: true, csv: lines.join('\n') };
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function importCsv(csvText, format) {
  requireUnlocked();
  const text = String(csvText || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: 'Pusty CSV', imported: 0 };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };

  let iUrl = idx(['url', 'login_uri', 'origin', 'hostname']);
  let iUser = idx(['username', 'login_username', 'login', 'user']);
  let iPass = idx(['password', 'login_password', 'pass']);
  let iNote = idx(['note', 'notes', 'extra', 'comment']);

  if (format === 'firefox') {
    iUrl = idx(['url', 'hostname']);
    iUser = idx(['username']);
    iPass = idx(['password']);
  }

  if (iUrl < 0 || iPass < 0) {
    return { ok: false, error: 'Nie rozpoznano kolumn CSV', imported: 0 };
  }

  let imported = 0;
  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const rawUrl = cols[iUrl] || '';
    const origin = normalizeOrigin(rawUrl.includes('://') ? rawUrl : `https://${rawUrl}`);
    if (!origin) continue;
    const username = iUser >= 0 ? cols[iUser] || '' : '';
    const password = cols[iPass] || '';
    if (!password) continue;
    const note = iNote >= 0 ? cols[iNote] || '' : '';
    const existing = vault.entries.find((e) => e.origin === origin && e.username === username);
    if (existing) {
      existing.password = password;
      if (note) existing.note = note;
      existing.updatedAt = Date.now();
    } else {
      const now = Date.now();
      vault.entries.push({
        id: crypto.randomUUID(),
        origin,
        username,
        password,
        note,
        totpSecret: '',
        createdAt: now,
        lastUsedAt: now,
        updatedAt: now,
      });
    }
    imported++;
  }
  persistUnlocked();
  const env = readFileEnvelope();
  if (env) {
    env.entryCount = vault.entries.length;
    writeFileEnvelope(env);
  }
  return { ok: true, imported };
}

function changeMaster(oldPassword, newPassword) {
  requireUnlocked();
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return { ok: false, error: 'Nowe hasło: minimum 8 znaków' };
  }
  const env = readFileEnvelope();
  const salt = fromB64(env.kdf.salt);
  const oldKey = deriveKey(oldPassword, salt, {
    N: env.kdf.N || SCRYPT.N,
    r: env.kdf.r || SCRYPT.r,
    p: env.kdf.p || SCRYPT.p,
    keyLen: env.kdf.keyLen || SCRYPT.keyLen,
  });
  if (Buffer.compare(oldKey, unlockedKey) !== 0) {
    oldKey.fill(0);
    return { ok: false, error: 'Błędne obecne hasło' };
  }
  oldKey.fill(0);
  const newSalt = crypto.randomBytes(16);
  const newKey = deriveKey(newPassword, newSalt);
  const blob = encryptBlob(newKey, vault);
  writeFileEnvelope({
    ...env,
    version: VERSION,
    kdf: { name: 'scrypt', salt: b64(newSalt), ...SCRYPT },
    iv: blob.iv,
    tag: blob.tag,
    ciphertext: blob.ciphertext,
    entryCount: vault.entries.length,
  });
  unlockedKey.fill(0);
  unlockedKey = newKey;
  if (fs.existsSync(paths().rememberPath)) {
    try {
      saveRememberKey(newKey);
    } catch {
      clearRemember();
    }
  }
  return { ok: true };
}

function setIdleMinutes(n) {
  const v = Math.min(240, Math.max(1, Number(n) || DEFAULT_IDLE_MIN));
  idleMinutes = v;
  return { idleMinutes };
}

function getPageScript() {
  // Injected into guest pages; talks only via window.__djxxrPw from webview preload
  return `(() => {
  if (window.__djxxrPwHooked) return;
  window.__djxxrPwHooked = true;
  const bridge = window.__djxxrPw;
  if (!bridge || typeof bridge.post !== 'function') return;

  const isVisible = (el) => {
    if (!el || el.disabled || el.readOnly) return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  const findPasswordFields = () =>
    Array.from(document.querySelectorAll('input[type="password"]')).filter(isVisible);

  const findUsernameNear = (pwd) => {
    const form = pwd.form || pwd.closest('form');
    const scope = form || document;
    const candidates = Array.from(
      scope.querySelectorAll(
        'input[type="email"],input[type="text"],input[name*="user" i],input[name*="login" i],input[name*="email" i],input[autocomplete="username"],input[autocomplete="email"]',
      ),
    ).filter(isVisible);
    return candidates[0] || null;
  };

  const fill = (username, password) => {
    const pwds = findPasswordFields();
    const pwd = pwds[0];
    if (!pwd) return false;
    const user = findUsernameNear(pwd);
    const setVal = (el, v) => {
      if (!el) return;
      el.focus();
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setVal(user, username || '');
    setVal(pwd, password || '');
    return true;
  };

  bridge.onCommand((msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'fill') fill(msg.username, msg.password);
    if (msg.type === 'accounts') renderIcon(msg.accounts || []);
  });

  let iconHost = null;
  const removeIcon = () => {
    if (iconHost) {
      iconHost.remove();
      iconHost = null;
    }
  };

  const renderIcon = (accounts) => {
    removeIcon();
    if (!accounts.length) return;
    const pwd = findPasswordFields()[0];
    if (!pwd) return;
    const rect = pwd.getBoundingClientRect();
    iconHost = document.createElement('div');
    iconHost.id = 'djxxr-pw-icon';
    Object.assign(iconHost.style, {
      position: 'fixed',
      zIndex: '2147483646',
      left: Math.max(8, rect.right - 28) + 'px',
      top: Math.max(8, rect.top + (rect.height - 22) / 2) + 'px',
      width: '22px',
      height: '22px',
      borderRadius: '6px',
      background: 'rgba(20,22,28,0.92)',
      border: '1px solid rgba(255,255,255,0.12)',
      display: 'grid',
      placeItems: 'center',
      cursor: 'pointer',
      boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
      fontSize: '12px',
      color: '#e8eaef',
      fontFamily: 'system-ui,sans-serif',
    });
    iconHost.textContent = '🔑';
    iconHost.title = 'djxxr — konta';
    let menu = null;
    const closeMenu = () => {
      if (menu) {
        menu.remove();
        menu = null;
      }
    };
    iconHost.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (menu) {
        closeMenu();
        return;
      }
      menu = document.createElement('div');
      Object.assign(menu.style, {
        position: 'fixed',
        zIndex: '2147483647',
        left: Math.min(window.innerWidth - 240, rect.left) + 'px',
        top: rect.bottom + 6 + 'px',
        minWidth: '220px',
        maxWidth: '280px',
        background: 'rgba(18,20,26,0.97)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        padding: '6px',
        boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        fontFamily: 'system-ui,sans-serif',
        color: '#e8eaef',
      });
      accounts.forEach((acc) => {
        const row = document.createElement('button');
        row.type = 'button';
        Object.assign(row.style, {
          display: 'block',
          width: '100%',
          textAlign: 'left',
          border: '0',
          background: 'transparent',
          color: 'inherit',
          padding: '8px 10px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '13px',
        });
        row.textContent = acc.username || '(bez loginu)';
        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(255,255,255,0.06)';
        });
        row.addEventListener('mouseleave', () => {
          row.style.background = 'transparent';
        });
        row.addEventListener('click', (e2) => {
          e2.preventDefault();
          e2.stopPropagation();
          bridge.post('fill-request', { id: acc.id });
          closeMenu();
        });
        menu.appendChild(row);
      });
      document.documentElement.appendChild(menu);
    });
    document.addEventListener('click', closeMenu, { once: true });
    document.documentElement.appendChild(iconHost);
  };

  const scan = () => {
    const pwds = findPasswordFields();
    if (!pwds.length) {
      removeIcon();
      return;
    }
    if (window.top !== window) {
      try {
        if (window.location.origin !== window.top.location.origin) return;
      } catch {
        return;
      }
    }
    if (location.protocol !== 'https:') return;
    bridge.post('scan', { hasPassword: true, origin: location.origin });
  };

  const onSubmit = (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (location.protocol !== 'https:') return;
    if (window.top !== window) {
      try {
        if (window.location.origin !== window.top.location.origin) return;
      } catch {
        return;
      }
    }
    const pwd = Array.from(form.querySelectorAll('input[type="password"]')).find(isVisible);
    if (!pwd || !pwd.value) return;
    const user = findUsernameNear(pwd);
    bridge.post('login-submit', {
      origin: location.origin,
      username: user ? user.value : '',
      password: pwd.value,
    });
  };

  document.addEventListener('submit', onSubmit, true);
  const mo = new MutationObserver(() => scan());
  mo.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('focusin', (e) => {
    if (e.target && e.target.type === 'password') scan();
  });
  setTimeout(scan, 400);
})();`;
}

function init(opts = {}) {
  if (typeof opts.idleMinutes === 'number') setIdleMinutes(opts.idleMinutes);
  if (typeof opts.onLock === 'function') onLockNotify = opts.onLock;
  attachPowerMonitor();
  ensureIdleWatch();
  tryAutoUnlock();
  return status();
}

module.exports = {
  init,
  status,
  setup,
  unlock,
  lock: lockVault,
  tryAutoUnlock,
  list: listEntries,
  findForOrigin,
  get: getEntry,
  getPasswordForAutofill,
  add: addEntry,
  update: updateEntry,
  remove: removeEntry,
  neverSaveAdd,
  neverSaveList,
  neverSaveRemove,
  shouldOfferSave,
  confirmPendingSave,
  dismissPendingSave,
  generate: generatePassword,
  strength: passwordStrength,
  getTotp,
  copyPassword,
  audit,
  exportCsv,
  importCsv,
  changeMaster,
  setIdleMinutes,
  touchActivity,
  getPageScript,
  normalizeOrigin,
  isHttpsOrigin,
};
