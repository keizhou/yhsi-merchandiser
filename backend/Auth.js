/**
 * Lightweight custom auth: username + PIN, since we can't assume every
 * merchandiser has a Google account. Issues a signed, stateless token
 * (HMAC-SHA256) instead of a server-side session table.
 */

function hashPin_(pin) {
  const secret = PropertiesService.getScriptProperties().getProperty(TOKEN_SECRET_PROPERTY) || '';
  const digest = Utilities.computeHmacSha256Signature(String(pin), secret);
  return Utilities.base64EncodeWebSafe(digest);
}

function signToken_(payloadObj) {
  const secret = PropertiesService.getScriptProperties().getProperty(TOKEN_SECRET_PROPERTY);
  const payloadJson = JSON.stringify(payloadObj);
  const payloadB64 = Utilities.base64EncodeWebSafe(payloadJson);
  const signature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, secret));
  return payloadB64 + '.' + signature;
}

function verifyToken_(token) {
  if (!token || token.indexOf('.') === -1) {
    return null;
  }
  const secret = PropertiesService.getScriptProperties().getProperty(TOKEN_SECRET_PROPERTY);
  const parts = token.split('.');
  const payloadB64 = parts[0];
  const signature = parts[1];
  const expectedSignature = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payloadB64, secret));
  if (signature !== expectedSignature) {
    return null;
  }
  const payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(payloadB64)).getDataAsString());
  if (!payload.exp || Date.now() > payload.exp) {
    return null; // expired
  }
  return payload;
}

function findUserByUsername_(username) {
  const sheet = getSheet_(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => (idx[h] = i));
  for (let r = 1; r < data.length; r++) {
    if (data[r][idx.username] === username) {
      return {
        userId: data[r][idx.userId],
        username: data[r][idx.username],
        pinHash: data[r][idx.pinHash],
        name: data[r][idx.name],
        role: data[r][idx.role],
        storeIds: data[r][idx.storeIds],
      };
    }
  }
  return null;
}

/**
 * action: "login" — { username, pin } -> { token, user }
 */
function handleLogin_(body) {
  const username = String(body.username || '').trim();
  const pin = String(body.pin || '').trim();
  if (!username || !pin) {
    return { ok: false, error: 'username and pin are required' };
  }
  const user = findUserByUsername_(username);
  if (!user || user.pinHash !== hashPin_(pin)) {
    return { ok: false, error: 'invalid username or pin' };
  }
  const token = signToken_({
    userId: user.userId,
    username: user.username,
    role: user.role,
    exp: Date.now() + TOKEN_TTL_MS,
  });
  return {
    ok: true,
    token: token,
    user: {
      userId: user.userId,
      username: user.username,
      name: user.name,
      role: user.role,
      storeIds: user.storeIds ? String(user.storeIds).split(',').filter(Boolean) : [],
    },
  };
}

/**
 * Throws if the token is missing/invalid/expired. Returns the decoded payload otherwise.
 */
function requireAuth_(token) {
  const payload = verifyToken_(token);
  if (!payload) {
    throw new AuthError_('unauthorized');
  }
  return payload;
}

function AuthError_(message) {
  this.name = 'AuthError';
  this.message = message;
}
AuthError_.prototype = Object.create(Error.prototype);
