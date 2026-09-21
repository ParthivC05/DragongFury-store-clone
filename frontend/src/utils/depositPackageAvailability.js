/**
 * Deposit package availability helpers (purchase limits).
 * Backend catalog already omits exhausted packages; these keep the UI in sync.
 */

export function isPackagePurchaseLimitReached(pkg) {
  if (!pkg) return false;
  const maxRaw = pkg.max_purchases_per_user ?? pkg.maxPurchasesPerUser;
  if (maxRaw == null || maxRaw === '') return false;
  const max = parseInt(maxRaw, 10);
  if (!Number.isInteger(max) || max < 1) return false;

  if (pkg.purchases_remaining != null && pkg.purchases_remaining !== '') {
    const remaining = parseInt(pkg.purchases_remaining, 10);
    if (Number.isInteger(remaining)) return remaining <= 0;
  }

  const used = parseInt(pkg.purchases_used ?? pkg.purchasesUsed ?? 0, 10) || 0;
  return used >= max;
}

export function isPackageAvailableForUser(pkg) {
  return Boolean(pkg?.id) && !isPackagePurchaseLimitReached(pkg);
}

export function isWelcomeGroupLimitReached(group) {
  if (String(group?.group_key || group?.groupKey || '') !== 'welcome') return false;
  const maxRaw = group.max_purchases_per_user ?? group.maxPurchasesPerUser;
  if (maxRaw == null || maxRaw === '') return false;
  const max = parseInt(maxRaw, 10);
  if (!Number.isInteger(max) || max < 1) return false;

  if (group.purchases_remaining != null && group.purchases_remaining !== '') {
    const remaining = parseInt(group.purchases_remaining, 10);
    if (Number.isInteger(remaining)) return remaining <= 0;
  }

  const used = parseInt(group.purchases_used ?? group.purchasesUsed ?? 0, 10) || 0;
  return used >= max;
}

/**
 * Drop packages that have no purchases remaining; hide empty groups.
 * Also hide the Welcome section when the admin section-limit is used up.
 */
export function filterAvailablePackageGroups(groups) {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter((group) => !isWelcomeGroupLimitReached(group))
    .map((group) => ({
      ...group,
      packages: (group.packages || []).filter(isPackageAvailableForUser)
    }))
    .filter((group) => (group.packages || []).length > 0);
}

export function normalizePackageCatalog(packagesRes) {
  // Prefer nested data only when top-level groups are missing — never treat [] as "use data"
  // when a wrapper also has data.groups (empty top-level would wrongly wipe packages).
  let raw = packagesRes;
  if (raw && typeof raw === 'object') {
    const hasTopGroups = Array.isArray(raw.groups);
    const nested = raw.data && typeof raw.data === 'object' ? raw.data : null;
    if (!hasTopGroups && nested && (Array.isArray(nested.groups) || nested.enabled != null)) {
      raw = nested;
    }
  }
  return {
    enabled: raw?.enabled === true,
    groups: filterAvailablePackageGroups(
      Array.isArray(raw?.groups) ? raw.groups : []
    )
  };
}

export function catalogHasVisiblePackages(catalog) {
  return (catalog?.groups || []).some((g) => (g.packages || []).length > 0);
}

export function catalogContainsPackage(catalog, packageId) {
  const id = packageId != null ? Number(packageId) : NaN;
  if (!Number.isInteger(id) || id < 1) return false;
  const groups = catalog?.groups || [];
  return groups.some((g) => (g.packages || []).some((p) => Number(p.id) === id));
}
