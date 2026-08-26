/** Envolve handlers async para repassar erros ao middleware central. */
export const wrap = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
