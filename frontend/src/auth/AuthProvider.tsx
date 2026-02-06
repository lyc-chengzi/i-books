import React, { createContext, useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';

export type AuthUser = {
  id: number;
  username: string;
  role: 'admin' | 'user';
};

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isReady: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const me = await api.get<AuthUser>('/auth/me');
        if (!canceled) setUser(me);
      } catch {
        // Not logged in (or cookie expired)
      } finally {
        if (!canceled) setIsReady(true);
      }
    })();

    return () => {
      canceled = true;
    };
  }, []);

  const logout = useCallback(() => {
    // Best-effort: clear server cookie
    api.post('/auth/logout').catch(() => undefined);
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ access_token: string }>('/auth/login', {
      username,
      password
    });

    // Keep for backward compatibility (some calls still pass token), but auth is cookie-based.
    setToken(result.access_token);

    const me = await api.get<AuthUser>('/auth/me');
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ token, user, isReady, login, logout }), [
    token,
    user,
    isReady,
    login,
    logout
  ]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}
