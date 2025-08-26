const jwt = require('jsonwebtoken');
const { User, Admin } = require('../models');

/**
 * Admin authentication middleware
 * Verifies JWT token and checks admin privileges
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Admin access token required'
      });
    }
    
    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Get user and admin info
    const user = await User.findByPk(decoded.userId, {
      include: [{
        model: Admin,
        required: true
      }],
      attributes: ['id', 'username', 'email', 'isActive']
    });
    
    if (!user || !user.isActive || !user.Admin || !user.Admin.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Admin access denied'
      });
    }
    
    req.user = user;
    req.admin = user.Admin;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Admin token expired'
      });
    }
    
    console.error('Admin authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Admin authentication failed'
    });
  }
};

/**
 * Check specific admin permission
 * @param {string} resource - Resource name (tournaments, users, games, system)
 * @param {string} action - Action name (create, read, update, delete, etc.)
 */
const requirePermission = (resource, action) => {
  return (req, res, next) => {
    try {
      const permissions = req.admin.permissions;
      
      if (!permissions[resource] || !permissions[resource][action]) {
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions: ${resource}.${action}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

/**
 * Check admin role
 * @param {string[]} allowedRoles - Array of allowed roles
 */
const requireRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      if (!allowedRoles.includes(req.admin.role)) {
        return res.status(403).json({
          success: false,
          message: `Insufficient role: requires ${allowedRoles.join(' or ')}`
        });
      }
      
      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        message: 'Role check failed'
      });
    }
  };
};

/**
 * Super admin only middleware
 */
const requireSuperAdmin = requireRole(['super_admin']);

/**
 * Tournament admin or higher middleware
 */
const requireTournamentAdmin = requireRole(['super_admin', 'tournament_admin']);

module.exports = {
  authenticateAdmin,
  requirePermission,
  requireRole,
  requireSuperAdmin,
  requireTournamentAdmin
};
