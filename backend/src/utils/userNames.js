/**
 * Derive first/last name from an email local-part when profile names are missing.
 * e.g. "john.doe+test@x.com" → { firstName: "John", lastName: "Doe" }
 */
function namesFromEmail(email) {
  const local = String(email || '')
    .split('@')[0]
    .trim();
  if (!local) return { firstName: 'User', lastName: 'Account' };

  const parts = local.split(/[._+\-]+/).filter(Boolean);
  const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  const firstName = capitalize(parts[0] || local);
  const lastName =
    parts.length > 1 ? parts.slice(1).map(capitalize).join(' ') : firstName;
  return { firstName, lastName };
}

/**
 * Prefer stored first/last name; fall back to names derived from email.
 * @param {{ firstName?: string|null, lastName?: string|null, email?: string|null, paymentApiEmail?: string|null }} user
 */
function resolveUserNames(user) {
  const first = (user?.firstName || '').trim();
  const last = (user?.lastName || '').trim();
  if (first && last) return { firstName: first, lastName: last };

  const email = (user?.paymentApiEmail || user?.email || '').trim();
  const derived = namesFromEmail(email);
  return {
    firstName: first || derived.firstName,
    lastName: last || derived.lastName
  };
}

module.exports = { namesFromEmail, resolveUserNames };
