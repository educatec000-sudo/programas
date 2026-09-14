import { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Cache em memória ultra-rápido para transições instantâneas entre telas e abas.
 */
const apiCache = new Map();
const CACHE_TTL = 60000; // 1 minuto de cache inteligente

export function clearApiCache() {
  apiCache.clear();
}

/**
 * Hook de dados otimizado: executa o fetcher, expõe loading/error/data e refresh().
 * Suporta cache em memória para navegação instantânea e zero-lag.
 */
export function useApi(fetcher, deps = [], { immediate = true, cacheKey = null } = {}) {
  // Gera chave de cache baseada nas dependências caso não seja fornecida
  const resolvedCacheKey = cacheKey || (deps.length > 0 ? JSON.stringify(deps) : null);

  const getCached = () => {
    if (!resolvedCacheKey) return null;
    const entry = apiCache.get(resolvedCacheKey);
    if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
      return entry.data;
    }
    return null;
  };

  const cachedInitial = getCached();
  const [data, setData] = useState(cachedInitial);
  const [loading, setLoading] = useState(cachedInitial ? false : immediate);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!immediate && nonce === 0) return undefined;
    let alive = true;

    // Se temos dados em cache e não é refresh explícito, não bloqueia a tela com loading
    const cached = nonce === 0 ? getCached() : null;
    if (cached) {
      setData(cached);
      setLoading(false);
    } else {
      setLoading(true);
    }

    setError(null);

    fetcherRef
      .current()
      .then((result) => {
        if (alive) {
          setData(result);
          if (resolvedCacheKey && result != null) {
            apiCache.set(resolvedCacheKey, { data: result, timestamp: Date.now() });
          }
        }
      })
      .catch((err) => {
        if (alive) setError(err);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const refresh = useCallback(() => {
    if (resolvedCacheKey) {
      apiCache.delete(resolvedCacheKey);
    }
    setNonce((n) => n + 1);
  }, [resolvedCacheKey]);

  return { data, loading, error, refresh, reload: refresh, refetch: refresh, setData };
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
