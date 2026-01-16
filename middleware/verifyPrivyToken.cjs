const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const JWKS_URI = process.env.PRIVY_JWKS_URL || 'https://auth.privy.io/.well-known/jwks.json';

const jwksClient = jwksRsa({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 60 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 10,
  timeout: 5000,
});

async function getPublicKey(kid) {
  const key = await jwksClient.getSigningKey(kid);
  return key.getPublicKey();
}

async function verifyPrivyJwt(token) {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded?.header?.kid;
  if (!kid) throw new Error('Missing kid');

  const publicKey = await getPublicKey(kid);
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
}

const verifyPrivyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No valid token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = await verifyPrivyJwt(token);

    const privyUser = {
      sub: payload.sub,
      email: payload.email,
      wallet_address: payload.wallet_address,
    };

    req.privy = privyUser;
    if (!req.user) req.user = privyUser;

    next();
  } catch (err) {
    console.error('Privy verification error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired Privy token' });
  }
};

module.exports = { verifyPrivyToken, verifyPrivyJwt };