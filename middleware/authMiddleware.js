const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_sports_booking_key_123';

/**
 * Verifies any valid JWT token.
 * Attaches decoded payload to req.user.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access denied: No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

/**
 * Must be used AFTER authenticateToken.
 * Allows access only if the logged-in user has role === 'admin'.
 * Returns 403 Access Denied for everyone else.
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: 'Access Denied: Admins only' });
  }
  next();
};

module.exports = { authenticateToken, requireAdmin, JWT_SECRET };
