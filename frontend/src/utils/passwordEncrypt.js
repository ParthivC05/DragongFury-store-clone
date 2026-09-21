/**
 * Orionstars-style: encode password fields as base64 before sending.
 * No API call, no key exchange - so no key can be leaked to an attacker.
 * Backend decodes base64 and then hashes/compares as usual.
 */

function encodeBase64(str) {
  if (str == null || typeof str !== 'string') return str;
  try {
    return btoa(new TextEncoder().encode(str).reduce((acc, byte) => acc + String.fromCharCode(byte), ''));
  } catch {
    return str;
  }
}

/**
 * Encode password fields in the body to base64 (in place on a copy).
 */
export function encodePasswordsInBody(body) {
  if (!body || typeof body !== 'object') return body;
  const out = { ...body };
  const fields = ['password', 'currentPassword', 'newPassword', 'gamePassword'];
  for (const field of fields) {
    if (out[field] != null && typeof out[field] === 'string') {
      out[field] = encodeBase64(out[field]);
    }
  }
  return out;
}
