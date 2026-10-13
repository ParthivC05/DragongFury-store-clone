let cached = null;
let started = false;

export function getCachedBrowserGps() {
  return cached;
}

function savePosition(position) {
  const lat = Number(position?.coords?.latitude);
  const lng = Number(position?.coords?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  cached = {
    gpsLat: Number(lat.toFixed(5)),
    gpsLng: Number(lng.toFixed(5)),
    gpsAccuracyMeters: Math.round(Number(position.coords.accuracy) || 0) || null
  };
  return true;
}

let activeAsk = null;

/** Browser Allow / Don't allow prompt. Returns granted, denied, failed, or unavailable. */
export function requestBrowserLocation() {
  if (activeAsk) return activeAsk;
  activeAsk = askForGps().finally(() => {
    activeAsk = null;
  });
  return activeAsk;
}

function askForGps() {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation || !window.isSecureContext) {
      resolve('unavailable');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(savePosition(position) ? 'granted' : 'unavailable'),
      (error) => resolve(error?.code === 1 ? 'denied' : 'failed'),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/** @deprecated GeoWrapper owns the location gate. Kept so older callers do not throw. */
export function requestBrowserGpsOnOpen() {
  if (started || typeof window === 'undefined') return;
  started = true;
  requestBrowserLocation();
}
