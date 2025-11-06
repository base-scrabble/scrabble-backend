const jwt = require('jsonwebtoken');
const axios = require('axios');

let cachedKeys = null;
const CACHE_TTL = 3600000; // 1 hour in ms
let lastFetch = 0;

const fetchPrivyKeys = async () => {
  if (cachedKeys && Date.now() - lastFetch < CACHE_TTL) return cachedKeys;
  try {
    const { data } = await axios.get('https://auth.privy.io/.well-known/jwks.json', { timeout: 5000 });
    cachedKeys = data;
    lastFetch = Date.now();
    return cachedKeys;
  } catch (error) {
    console.error('Failed to fetch Privy keys:', error.message);
    throw new Error('Unable to fetch Privy public keys');
  }
};

const getPublicKey = async (kid) => {
  const keys = await fetchPrivyKeys();
  const jwk = keys.keys.find(k => k.kid === kid);
  if (!jwk) throw new Error('Invalid Privy key ID');
  const pubKey = `-----BEGIN PUBLIC KEY-----\n${Buffer.from(jwk.n, 'base64').toString('base64')}\n-----END PUBLIC KEY-----`;
  return pubKey;
};

const verifyPrivyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No valid token provided' });
    }

    const token = authHeader.split(' ')[1];
    const [header] = token.split('.');
    const decodedHeader = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
    const pubKey = await getPublicKey(decodedHeader.kid);

    const payload = jwt.verify(token, pubKey, { algorithms: ['RS256'] });
    req.user = {
      wallet_address: payload.wallet_address,
      email: payload.email,
      sub: payload.sub,
    };

    next();
  } catch (err) {
    console.error('Privy verification error:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired Privy token' });
  }
};

module.exports = { verifyPrivyToken };