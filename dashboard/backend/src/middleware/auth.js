const jwt        = require('jsonwebtoken');
const { findById } = require('../utils/users');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

function signToken(userId) {
  return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: '4h' });
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  // _token query param is only used for the GitHub OAuth redirect flow; never log this endpoint
  const queryToken = req.query._token;
  const raw        = header?.startsWith('Bearer ') ? header.slice(7) : queryToken;

  if (!raw) return res.status(401).json({ error: 'Unauthorised — no token' });

  try {
    const payload = jwt.verify(raw, JWT_SECRET);
    const user    = findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
}

module.exports = { signToken, requireAuth, requireAdmin };
