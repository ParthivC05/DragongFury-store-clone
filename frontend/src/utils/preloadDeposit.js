/** Warm the deposit lazy chunk + API payload before the user lands on /deposit. */

let pagePromise = null;
let dataPromise = null;

export function preloadDepositPage() {
  if (!pagePromise) {
    pagePromise = import('../pages/Deposit');
  }
  return pagePromise;
}

export function prefetchDepositPageData() {
  if (!dataPromise) {
    dataPromise = import('../api/depositPage')
      .then((m) => m.fetchDepositPageData())
      .catch(() => {
        dataPromise = null;
      });
  }
  return dataPromise;
}

export function warmupDeposit({ withData = true } = {}) {
  import('../components/AppLoader').then((m) => m.preloadLoaderLogo?.());
  preloadDepositPage();
  import('./depositPackageImage').then((m) => m.preloadDepositPackageImages());
  if (withData) prefetchDepositPageData();
}
