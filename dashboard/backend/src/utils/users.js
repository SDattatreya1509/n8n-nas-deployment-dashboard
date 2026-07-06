const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { DATA_DIR, USERS_FILE } = require('../config/storage');

function loadUsers() {
  try {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch { return []; }
}

function saveUsers(users) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  // Atomic write: write to temp file then rename to avoid corruption on kill
  const tmp = USERS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2));
  fs.renameSync(tmp, USERS_FILE);
}

function findByEmail(email) {
  return loadUsers().find(u => u.email.toLowerCase() === email.toLowerCase()) ?? null;
}

function findById(id) {
  return loadUsers().find(u => u.id === id) ?? null;
}

function findByWebhookToken(token) {
  return loadUsers().find(u => u.webhookToken === token) ?? null;
}

function findByVerificationToken(token) {
  return loadUsers().find(u => u.verificationToken === token) ?? null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function createUser({ name, email, password }) {
  if (typeof name !== 'string' || name.trim().length > 100)
    throw new Error('Name must be 1–100 characters');
  if (typeof email !== 'string' || email.length > 254)
    throw new Error('Invalid email address');
  if (typeof password !== 'string' || password.length > 128)
    throw new Error('Password must be at most 128 characters');

  const normalizedEmail = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new Error('Invalid email address');
  }
  const users = loadUsers();
  if (users.find(u => u.email.toLowerCase() === normalizedEmail)) {
    throw new Error('Email already registered');
  }
  const hash        = await bcrypt.hash(password, 10);
  const isFirstUser = users.length === 0;
  const skipVerify  = isFirstUser || process.env.SKIP_EMAIL_VERIFICATION === 'true';
  const user = {
    id:                  uuidv4(),
    name:                name.trim(),
    email:               normalizedEmail,
    passwordHash:        hash,
    role:                isFirstUser ? 'admin' : 'user',
    webhookToken:        uuidv4().replace(/-/g, ''),
    github:              null,
    emailVerified:       skipVerify,
    verificationToken:   uuidv4(),
    verificationExpiry:  new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    createdAt:           new Date().toISOString(),
  };
  users.push(user);
  saveUsers(users);
  return user;
}

function refreshVerificationToken(id) {
  return updateUser(id, {
    verificationToken:  uuidv4(),
    verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
}

function resetWebhookToken(id) {
  return updateUser(id, { webhookToken: uuidv4().replace(/-/g, '') });
}

function deleteUser(id) {
  const users = loadUsers();
  const idx   = users.findIndex(u => u.id === id);
  if (idx === -1) throw new Error('User not found');
  users.splice(idx, 1);
  saveUsers(users);
}

async function verifyPassword(email, password) {
  const user = findByEmail(email);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

const ALLOWED_USER_UPDATE_FIELDS = new Set([
  'name', 'email', 'passwordHash', 'role', 'emailVerified',
  'verificationToken', 'verificationExpiry', 'webhookToken', 'github',
]);

function updateUser(id, updates) {
  const users = loadUsers();
  const idx   = users.findIndex(u => u.id === id);
  if (idx === -1) throw new Error('User not found');
  const safeUpdates = Object.fromEntries(
    Object.entries(updates).filter(([k]) => ALLOWED_USER_UPDATE_FIELDS.has(k))
  );
  users[idx] = { ...users[idx], ...safeUpdates };
  saveUsers(users);
  return users[idx];
}

// Strip sensitive fields before sending to client
function safeUser(user) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, verificationToken, verificationExpiry, webhookToken, ...safe } = user;
  // Accounts created before email verification was added default to verified
  if (safe.emailVerified === undefined) safe.emailVerified = true;
  return safe;
}

// Expose webhookToken only for the authenticated user's own profile
function safeUserWithToken(user) {
  const safe = safeUser(user);
  safe.webhookToken = user.webhookToken;
  return safe;
}

module.exports = {
  loadUsers, findByEmail, findById, findByWebhookToken, findByVerificationToken,
  createUser, verifyPassword, updateUser, resetWebhookToken, refreshVerificationToken,
  deleteUser, safeUser, safeUserWithToken,
};
