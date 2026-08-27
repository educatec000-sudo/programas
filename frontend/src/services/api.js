/**
 * Cliente HTTP do CPE.
 * - cookies httpOnly (mesma origem via proxy do Vite)
 * - renovação transparente da sessão (refresh token) em 401
 * - erros normalizados: { code, message, details }
 */
const API_ORIGIN = String(import.meta.env.VITE_API_URL || '').trim().replace(/\/$/, '');
const BASE = API_ORIGIN ? `${API_ORIGIN}/api` : '/api';

/** Monta uma URL da API sem espalhar o endereço do backend pelo frontend. */
export function apiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${normalizedPath}`;
}

let refreshing = null;

async function rawRequest(path, options = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    ...options,
  });
  return res;
}

export class ApiError extends Error {
  constructor(code, message, details, status) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

async function tryRefresh() {
  if (!refreshing) {
    refreshing = rawRequest('/auth/refresh', { method: 'POST' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshing = null), 100);
      });
  }
  return refreshing;
}

export async function request(path, { method = 'GET', body, params, retry = true } = {}) {
  let url = path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }

  const res = await rawRequest(url, {
    method,
    ...(body !== undefined && { body: body instanceof FormData ? body : JSON.stringify(body) }),
  });

  if (res.status === 401 && retry && !url.includes('/auth/')) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* sem corpo */
    }
    if (['TOKEN_EXPIRED', 'SESSION_INVALID', 'NO_TOKEN'].includes(payload?.error?.code)) {
      const ok = await tryRefresh();
      if (ok) return request(url, { method, body, retry: false });
    }
    window.dispatchEvent(new CustomEvent('cpe:unauthenticated'));
    throw new ApiError('UNAUTHENTICATED', 'Sessão encerrada. Faça login novamente.', null, 401);
  }

  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* resposta sem json */
    }
    const err = payload?.error || {};
    throw new ApiError(err.code || 'ERROR', err.message || `Erro ${res.status}`, err.details, res.status);
  }

  if (res.status === 204) return null;
  return res.json();
}

/** Baixa um arquivo da API (relatórios/exportações) preservando o nome. */
export async function download(path, { params, fallbackName = 'arquivo' } = {}) {
  let url = path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    }
    const s = qs.toString();
    if (s) url += `?${s}`;
  }
  let res = await rawRequest(url);
  if (res.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) res = await rawRequest(url);
    else window.dispatchEvent(new CustomEvent('cpe:unauthenticated'));
  }
  if (!res.ok) {
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      /* */
    }
    throw new ApiError(payload?.error?.code || 'ERROR', payload?.error?.message || 'Falha no download', null, res.status);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const name = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
  return name;
}
