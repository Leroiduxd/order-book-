// Simple cache mémoire avec expiration automatique (5 min)
export class EventCache {
  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttl = ttlMs;
    this.store = new Map();
  }

  has(key) {
    const v = this.store.get(key);
    if (!v) return false;
    if (Date.now() > v.expiry) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  add(key) {
    this.store.set(key, { expiry: Date.now() + this.ttl });
  }
}
