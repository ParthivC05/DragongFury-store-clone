import * as walletApi from './wallet';
import * as depositPackagesApi from './depositPackages';

/** Dedupe concurrent mount loads (e.g. React StrictMode remount). */
let depositPageLoadInflight = null;
let depositPageCache = null;
let depositPageCacheAt = 0;
const DEPOSIT_PAGE_CACHE_MS = 15000;

export function invalidateDepositPageData() {
  depositPageCache = null;
  depositPageCacheAt = 0;
}

export async function fetchDepositPageData() {
  if (depositPageLoadInflight) return depositPageLoadInflight;
  if (depositPageCache && Date.now() - depositPageCacheAt < DEPOSIT_PAGE_CACHE_MS) {
    return depositPageCache;
  }

  depositPageLoadInflight = (async () => {
    // Payment-provider sync can take several seconds. Do not block first paint on it.
    const refreshPromise = walletApi.refreshDepositTransactionsStatus().catch(() => null);
    const [limitsRes, balRes, methodsRes, chimeReqRes, packagesRes, depRes] = await Promise.all([
      walletApi.getWalletLimits(),
      walletApi.getBalance(),
      walletApi.getDepositMethods(),
      walletApi.getChimeDepositRequests({ limit: 100 }).catch(() => ({ data: [], total: 0 })),
      // Retry on transient failures — a single failed catalog call used to hide all packages.
      depositPackagesApi.fetchNormalizedDepositPackagesCatalog().catch(() => ({ enabled: false, groups: [] })),
      walletApi.getDeposits({ limit: 60 })
    ]);
    const result = {
      limitsRes,
      balRes,
      depRes,
      refreshRes: null,
      refreshPromise,
      methodsRes,
      chimeReqRes,
      packagesRes
    };
    depositPageCache = result;
    depositPageCacheAt = Date.now();
    return result;
  })().finally(() => {
    depositPageLoadInflight = null;
  });

  return depositPageLoadInflight;
}
