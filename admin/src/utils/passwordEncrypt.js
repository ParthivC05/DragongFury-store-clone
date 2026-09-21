/**
 * Encode password fields as base64 before sending (same as partner-platform frontend).
 * Backend decodes via decodePasswordBody and then hashes/compares as usual.
 * UTF-8 safe so non-ASCII passwords work.
 */
function encodeBase64(str) {
  if (str == null || typeof str !== 'string') return str
  try {
    return btoa(
      new TextEncoder().encode(str).reduce((acc, byte) => acc + String.fromCharCode(byte), '')
    )
  } catch {
    return str
  }
}

/**
 * Encode password fields in the body to base64 (in place on a copy).
 * Use for login, change-password, etc. so backend receives encoded values.
 */
export function encodePasswordsInBody(body) {
  if (!body || typeof body !== 'object') return body
  const out = { ...body }
  const fields = ['password', 'currentPassword', 'newPassword', 'gamePassword']
  for (const field of fields) {
    if (out[field] != null && typeof out[field] === 'string') {
      out[field] = encodeBase64(out[field])
    }
  }
  return out
}
