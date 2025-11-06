// config/auth.cjs
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { prisma } = require('../lib/prisma.cjs');

// ---------- Privy JWKS verification ----------
const client = jwksClient({
  jwksUri: process.env.PRIVY_JWKS_URL,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

const verifyPrivyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ success: false, message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, getKey, { algorithms: ['RS256'] }, async (err, decoded) => {
    if (err) {
      console.error('Privy JWT verification failed:', err);
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    let user = await prisma.users.findUnique({ where: { privy_id: decoded.sub } });
    if (!user) {
      user = await prisma.users.create({
        data: {
          privy_id: decoded.sub,
          wallet_address: decoded.wallet_address || null,
          email: decoded.email || null,
          username: decoded.email?.split('@')[0] || `user_${Math.random().toString(36).substr(2, 9)}`,
          isActive: true,
        },
      });
    }

    req.user = {
      id: user.id,
      privy_id: decoded.sub,
      wallet_address: decoded.wallet_address || null,
      email: decoded.email || null,
      username: user.username,
    };
    next();
  });
};

// ---------- Optional auth for public routes ----------
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(' ')[1];
  jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
    if (err) {
      req.user = null;
    } else {
      req.user = {
        privy_id: decoded.sub,
        wallet_address: decoded.wallet_address || null,
        email: decoded.email || null,
      };
    }
    next();
  });
};

// ---------- Admin login ----------
const adminLogin = async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(401).json({ success: false, message: 'Email and password required' });

  const admin = await prisma.admins.findUnique({ where: { email } });
  if (!admin || !await bcrypt.compare(password, admin.password)) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  req.user = { id: admin.id, email: admin.email, role: 'admin' };
  next();
};

// ---------- Password helpers for seeding ----------
function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  return bcrypt.compareSync(password, hash);
}

// ---------- Exports ----------
module.exports = {
  verifyPrivyToken,
  optionalAuth,
  adminLogin,
  hashPassword,
  comparePassword
};