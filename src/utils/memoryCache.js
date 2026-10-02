// Cache in-memory có TTL — đủ cho 1 instance server (leaderboard cache 10 phút).
// Khi scale nhiều instance thì thay bằng Redis, giữ nguyên interface get/set/wrap/clear.
export const createMemoryCache = (ttlMs) => {
  const store = new Map();
  const pending = new Map();

  const get = (key) => {
    const entry = store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      store.delete(key);
      return undefined;
    }
    return entry.value;
  };

  const set = (key, value) => store.set(key, { value, expiresAt: Date.now() + ttlMs });

  // Lấy từ cache, nếu chưa có thì gọi loader. Nhiều request đồng thời chỉ chạy loader 1 lần.
  const wrap = async (key, loader) => {
    const cached = get(key);
    if (cached !== undefined) return cached;
    if (pending.has(key)) return pending.get(key);

    const promise = loader()
      .then((value) => {
        set(key, value);
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  };

  return { get, set, wrap, clear: () => store.clear() };
};
