/** Warm the casino lazy chunk + lobby catalog before the user lands on /casino. */

let pagePromise = null;

export function preloadCasinoPage() {
  if (!pagePromise) {
    pagePromise = import('../pages/SlotGames/AllSlotGames');
  }
  return pagePromise;
}

export function warmupCasino() {
  import('../components/AppLoader').then((m) => m.preloadLoaderLogo?.());
  preloadCasinoPage();
  import('../components/Home/DashboardSlotGamesSection').then((m) => {
    m.prefetchLobbySlotGames?.();
  });
}
