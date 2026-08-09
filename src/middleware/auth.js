const jwt = require('jsonwebtoken');

/**
 * Verifies the JWT in the Authorization header (Bearer <token>).
 * On success, attaches { id, role } to req.user.
 */
function authenticateToken(req, res, next) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Token missing.' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
}

/**
 * Restricts a route to one or more roles.
 * Usage: requireRole('Admin') or requireRole('Admin', 'Staff')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Not authenticated.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
