import React, { createContext, useCallback, useMemo, useState } from 'react';

import { api } from '../lib/api';

export type AuthUser = {
  id: number;
  username: string;
};

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ access_token: string }>('/auth/login', {
      username,
      password
    });

    setToken(result.access_token);

    const me = await api.get<AuthUser>('/auth/me', {
      token: result.access_token
    });
    setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ token, user, login, logout }), [
    token,
    user,
    login,
    logout
  ]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}
