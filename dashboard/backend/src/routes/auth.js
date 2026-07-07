const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const ftp     = require('basic-ftp');
const {
  createUser, verifyPassword, updateUser, findByEmail, findById,
  findByVerificationToken, refreshVerificationToken, deleteUser,
  safeUser, safeUserWithToken, loadUsers,
} = require('../utils/users');
const { signToken, requireAuth } = require('../middleware/auth');
const { sendVerificationEmail, testSmtp, isEmailConfigured } = require('../utils/email');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body ?? {};
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Password must be at least 8 characters' });

  try {
    let user  = await createUser({ name, email, password });
    const token = signToken(user.id);

    // Auto-verify when no email service is configured (Render without SMTP, NAS, local)
    if (!isEmailConfigured() || process.env.SKIP_EMAIL_VERIFICATION === 'true') {
      user = updateUser(user.id, { emailVerified: true, verificationToken: null, verificationExpiry: null });
    } else {
      // Send verification email in background — don't block registration
      const verifyUrl = `${FRONTEND_URL}/verify?token=${user.verificationToken}`;
      sendVerificationEmail(user, verifyUrl).catch(() => {});
    }

    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    // Normalise error to avoid leaking whether the email already exists
    const known = err.message === 'Email already registered' || err.message?.includes('email');
    res.status(409).json({ error: known ? 'Registration failed. Check your details and try again.' : 'Registration failed. Please try again.' });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: 'email and password are required' });

  let user = await verifyPassword(email, password);
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  // Auto-verify accounts when no email service is configured (NAS/local deployments)
  if (!user.emailVerified && !isEmailConfigured() && process.env.SKIP_EMAIL_VERIFICATION !== 'true') {
    user = updateUser(user.id, { emailVerified: true, verificationToken: null, verificationExpiry: null });
  }

  const token = signToken(user.id);
  res.json({ token, user: safeUser(user) });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  // Include webhookToken for the user's own profile only
  res.json({ user: safeUserWithToken(req.user) });
});

// ── GET /api/auth/verify/:token ───────────────────────────────────────────────
router.get('/verify/:token', (req, res) => {
  const { token } = req.params;
  const user = findByVerificationToken(token);

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' });
  }
  if (new Date(user.verificationExpiry).getTime() < Date.now()) {
    return res.status(400).json({ error: 'This verification link has expired. Please request a new one.' });
  }
  if (user.emailVerified) {
    return res.json({ message: 'Email already verified.' });
  }

  updateUser(user.id, {
    emailVerified:    true,
    verificationToken:  null,
    verificationExpiry: null,
  });
  res.json({ message: 'Email verified successfully. You can now use your account.' });
});

// ── POST /api/auth/resend-verification ───────────────────────────────────────
router.post('/resend-verification', requireAuth, async (req, res) => {
  const user = findById(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.emailVerified) return res.status(400).json({ error: 'Email is already verified' });

  const updated   = refreshVerificationToken(user.id);
  const verifyUrl = `${FRONTEND_URL}/verify?token=${updated.verificationToken}`;
  const sent      = await sendVerificationEmail(updated, verifyUrl);

  if (!sent) return res.status(500).json({ error: 'smtp_failed', message: 'Email could not be sent. Check SMTP credentials in Render environment variables.' });
  res.json({ message: 'Verification email sent.' });
});

// ── PATCH /api/auth/profile ───────────────────────────────────────────────────
router.patch('/profile', requireAuth, async (req, res) => {
  const { name, email } = req.body ?? {};
  if (!name && !email)
    return res.status(400).json({ error: 'Provide name or email to update' });

  const updates = {};
  if (name?.trim())  updates.name  = name.trim();
  if (email?.trim()) {
    const existing = findByEmail(email.trim());
    if (existing && existing.id !== req.user.id)
      return res.status(409).json({ error: 'Email already in use' });
    updates.email = email.trim().toLowerCase();
  }

  try {
    const updated = updateUser(req.user.id, updates);
    res.json({ user: safeUser(updated) });
  } catch (err) {
    console.error('[profile] update failed:', err);
    res.status(500).json({ error: 'Profile update failed. Please try again.' });
  }
});

// ── PATCH /api/auth/password ──────────────────────────────────────────────────
router.patch('/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  if (newPassword.length < 8)
    return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const ok = await bcrypt.compare(currentPassword, req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash    = await bcrypt.hash(newPassword, 10);
  const updated = updateUser(req.user.id, { passwordHash: hash });
  res.json({ user: safeUser(updated) });
});

// ── DELETE /api/auth/account ──────────────────────────────────────────────────
// User deletes their own account. Requires password confirmation.
router.delete('/account', requireAuth, async (req, res) => {
  const { password } = req.body ?? {};
  if (!password) return res.status(400).json({ error: 'password is required to confirm deletion' });

  // Prevent deleting the last admin
  const allUsers = loadUsers();
  const isLastAdmin =
    req.user.role === 'admin' &&
    allUsers.filter(u => u.role === 'admin').length === 1;
  if (isLastAdmin) {
    return res.status(400).json({ error: 'Cannot delete the last admin account. Promote another user first.' });
  }

  const ok = await bcrypt.compare(password, req.user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Incorrect password' });

  try {
    deleteUser(req.user.id);
    res.json({ message: 'Account deleted successfully.' });
  } catch (err) {
    console.error('[account] delete failed:', err);
    res.status(500).json({ error: 'Account deletion failed. Please try again.' });
  }
});

// ── GET /api/auth/bootstrap-verify — no auth, requires BOOTSTRAP_TOKEN env var ─
// One-time escape hatch: set BOOTSTRAP_TOKEN in Render env, call this URL once,
// then remove the env var. Lets admin verify their account when SMTP is broken.
router.get('/bootstrap-verify', async (req, res) => {
  const secret = process.env.BOOTSTRAP_TOKEN;
  if (!secret) return res.status(404).json({ error: 'Not available' });

  // Timing-safe comparison to prevent enumeration of the token
  const provided = String(req.query.token || '');
  const secretBuf   = Buffer.from(secret);
  const providedBuf = Buffer.allocUnsafe(secretBuf.length).fill(0);
  Buffer.from(provided).copy(providedBuf, 0, 0, Math.min(provided.length, secretBuf.length));
  if (provided.length !== secret.length || !crypto.timingSafeEqual(secretBuf, providedBuf)) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'email query param required' });
  const user = findByEmail(email);
  // Return same response whether user exists or not to avoid leaking email existence
  if (!user) return res.status(200).json({ ok: true, message: 'Done. You can now log in.' });

  const updated = updateUser(user.id, { emailVerified: true, role: 'admin' });
  console.warn(`[bootstrap-verify] Account promoted to admin: ${updated.email} — remove BOOTSTRAP_TOKEN from .env now`);
  res.json({ ok: true, message: 'Account verified and promoted to admin. Remove BOOTSTRAP_TOKEN from your .env file now.' });
});

// ── POST /api/auth/ftp — save user's FTP credentials ─────────────────────────
router.post('/ftp', requireAuth, async (req, res) => {
  const { host, user, pass, remotePath } = req.body ?? {};
  if (!host?.trim() || !user?.trim() || !pass)
    return res.status(400).json({ error: 'host, user and pass are required' });

  try {
    const updated = updateUser(req.user.id, {
      ftp: {
        host:       host.trim(),
        user:       user.trim(),
        pass,
        remotePath: remotePath?.trim() || '/wp-content/themes',
      },
    });
    res.json({ user: safeUser(updated) });
  } catch (err) {
    console.error('[ftp] save failed:', err);
    res.status(500).json({ error: 'Failed to save FTP credentials.' });
  }
});

// ── POST /api/auth/ftp/test — verify FTP connection works ─────────────────────
router.post('/ftp/test', requireAuth, async (req, res) => {
  // Use freshly-submitted credentials if provided, else use stored ones
  const { host, user, pass, remotePath } = req.body ?? {};
  const ftpHost = host?.trim() || req.user.ftp?.host;
  const ftpUser = user?.trim() || req.user.ftp?.user;
  const ftpPass = pass         || req.user.ftp?.pass;

  if (!ftpHost || !ftpUser || !ftpPass)
    return res.status(400).json({ ok: false, error: 'FTP credentials not configured' });

  const client = new ftp.Client();
  client.ftp.verbose = false;
  try {
    await client.access({ host: ftpHost, user: ftpUser, password: ftpPass, secure: false });
    res.json({ ok: true, message: `Connected to ${ftpHost} as ${ftpUser}` });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  } finally {
    client.close();
  }
});

// ── DELETE /api/auth/ftp — remove user's FTP credentials ─────────────────────
router.delete('/ftp', requireAuth, (req, res) => {
  try {
    const updated = updateUser(req.user.id, { ftp: null });
    res.json({ user: safeUser(updated) });
  } catch (err) {
    console.error('[ftp] delete failed:', err);
    res.status(500).json({ error: 'Failed to remove FTP credentials.' });
  }
});

// ── GET /api/auth/test-smtp — admin only, verifies SMTP credentials ───────────
router.get('/test-smtp', requireAuth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const result = await testSmtp();
  res.status(result.ok ? 200 : 500).json(result);
});

module.exports = router;
