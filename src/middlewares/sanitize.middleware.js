// Chống NoSQL injection (NFR-05): loại bỏ key bắt đầu bằng "$" hoặc chứa "." trong body/params.
const isUnsafeKey = (key) => key.startsWith('$') || key.includes('.');

const stripUnsafeKeys = (value) => {
  if (Array.isArray(value)) return value.map(stripUnsafeKeys);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !isUnsafeKey(key))
      .map(([key, nested]) => [key, stripUnsafeKeys(nested)]),
  );
};

export const sanitizeRequest = (req, _res, next) => {
  if (req.body) req.body = stripUnsafeKeys(req.body);
  if (req.params) req.params = stripUnsafeKeys(req.params);
  next();
};
