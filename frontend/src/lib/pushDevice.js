const DEVICE_ID_KEY = 'pj_push_device_id';

export function getOrCreatePushDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (id && /^[a-zA-Z0-9_-]{8,64}$/.test(id)) return id;
    const uuid = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
    id = `pj_${String(uuid).replace(/-/g, '').slice(0, 24)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return `pj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  }
}
