'use strict';

const ROLE_HIERARCHY = {
  SUPER_ADMIN: 4,
  ADMIN: 3,
  STAFF: 2,
  CUSTOMER: 1,
};

/**
 * Require one of the listed roles (or higher).
 * Usage: requireRole('ADMIN')  or  requireRole('STAFF', 'ADMIN')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const allowed = roles.some(r => {
      const required = ROLE_HIERARCHY[r] || 0;
      return userLevel >= required;
    });

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${roles.join(' or ')}`
      });
    }

    next();
  };
}

/**
 * Shorthand middlewares
 */
const requireAdmin = requireRole('ADMIN');
const requireStaff = requireRole('STAFF'); // STAFF, ADMIN, SUPER_ADMIN all pass

module.exports = { requireRole, requireAdmin, requireStaff };
