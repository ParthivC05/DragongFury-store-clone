const BASE64_REGEX = /^[A-Za-z0-9+/]+=*$/;

function isValidUtf8Buffer(buf) {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decode a client-sent base64 password. Plain text must pass through unchanged —
 * do not pad short strings (e.g. "eeyy77" → "eeyy77==" was stored as garbage in DB).
 */
function decodeBase64Password(value) {
  if (value == null || typeof value !== 'string') return value;
  const trimmed = value.replace(/\s/g, '');
  if (trimmed.length < 4 || trimmed.length % 4 !== 0 || !BASE64_REGEX.test(trimmed)) {
    return value;
  }
  try {
    const decodedBuf = Buffer.from(trimmed, 'base64');
    if (decodedBuf.toString('base64') !== trimmed) return value;
    if (!isValidUtf8Buffer(decodedBuf)) return value;
    const decoded = decodedBuf.toString('utf8');
    if (!decoded) return value;
    return decoded;
  } catch (_) {
    // ignore
  }
  return value;
}

/**
 * Process body: decode base64 password fields (password, currentPassword, newPassword, gamePassword).
 */
function decodePasswordBody(body) {
  if (!body || typeof body !== 'object') return body;
  const result = { ...body };
  const fields = ['password', 'currentPassword', 'newPassword', 'gamePassword'];
  for (const field of fields) {
    if (result[field] != null && typeof result[field] === 'string') {
      result[field] = decodeBase64Password(result[field]);
    }
  }
  return result;
}

module.exports = {
  decodeBase64Password,
  decodePasswordBody
};
