import { ofetch, type FetchOptions } from 'ofetch';

type ExtraOptions = {
  token?: string | null;
  skipAuthHandling?: boolean;
};

type AuthExpiredListener = () => void;

const authExpiredListeners = new Set<AuthExpiredListener>();
let lastAuthExpiredAt = 0;

const client = ofetch.create({
  baseURL: '/api',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
});

function withAuth(options?: (FetchOptions<'json'> & ExtraOptions) | undefined) {
  const token = options?.token;
  const headers = new Headers((options?.headers as HeadersInit | undefined) ?? undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return { ...options, headers } as FetchOptions<'json'>;
}

function getErrorStatus(err: unknown): number | undefined {
  const anyErr = err as any;
  return (
    (typeof anyErr?.status === 'number' ? anyErr.status : undefined) ??
    (typeof anyErr?.response?.status === 'number' ? anyErr.response.status : undefined)
  );
}

function notifyAuthExpired() {
  const now = Date.now();
  if (now - lastAuthExpiredAt < 1000) return;
  lastAuthExpiredAt = now;
  authExpiredListeners.forEach((listener) => listener());
}

async function request<T>(path: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', body?: any, options?: FetchOptions<'json'> & ExtraOptions) {
  try {
    return await client<T>(path, { ...withAuth(options), method, body });
  } catch (err) {
    const status = getErrorStatus(err);
    if (!options?.skipAuthHandling && (status === 401 || status === 403)) {
      notifyAuthExpired();
    }
    throw err;
  }
}

export function subscribeAuthExpired(listener: AuthExpiredListener) {
  authExpiredListeners.add(listener);
  return () => {
    authExpiredListeners.delete(listener);
  };
}

export const api = {
  get: <T>(path: string, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'GET', undefined, options),
  post: <T>(path: string, body?: any, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'POST', body, options),
  patch: <T>(path: string, body?: any, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'PATCH', body, options),
  put: <T>(path: string, body?: any, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'PUT', body, options),
  del: <T>(path: string, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'DELETE', undefined, options),
  delete: <T>(path: string, options?: FetchOptions<'json'> & ExtraOptions) =>
    request<T>(path, 'DELETE', undefined, options)
};

function normalizeFastApiDetail(detail: unknown): string | null {
  if (!detail) return null;

  if (typeof detail === 'string') return detail;

  if (Array.isArray(detail)) {
    // Pydantic validation error format
    const msgs = detail
      .map((x: any) => (typeof x?.msg === 'string' ? x.msg : null))
      .filter(Boolean);
    if (msgs.length) return msgs.join('；');
  }

  if (typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      return '请求失败（响应无法解析）';
    }
  }

  return null;
}

export function getApiErrorMessage(err: unknown): string {
  const fallback = '操作失败，请稍后重试';

  if (!err) return fallback;
  if (typeof err === 'string') return err;

  const anyErr = err as any;
  const status = getErrorStatus(err);

  if (status === 401 || status === 403) return '登录已过期或无权限，请重新登录';

  const data = anyErr?.data ?? anyErr?.response?._data ?? anyErr?.response?.data;
  const detail = data?.detail ?? data?.message ?? data?.error;
  const normalized = normalizeFastApiDetail(detail);
  if (normalized) return normalized;

  if (typeof anyErr?.message === 'string' && anyErr.message.trim()) return anyErr.message;
  return fallback;
}
