import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App as AntdApp, Button, Space } from 'antd';

import { api, getApiErrorMessage, subscribeAuthExpired } from '../lib/api';

const SESSION_EXPIRED_NOTIFICATION_KEY = 'auth-session-expired';
const SESSION_WARNING_LEAD_MS = 5 * 60 * 1000;

export type AuthUser = {
  id: number;
  username: string;
  role: 'admin' | 'user';
};

type AuthSession = AuthUser & {
  access_token_expires_at: string;
};

export type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  isReady: boolean;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider(props: { children: React.ReactNode }) {
  const { message, notification } = AntdApp.useApp();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [isExtendingSession, setIsExtendingSession] = useState<boolean>(false);
  const hasActiveSessionRef = useRef(false);
  const sessionExpiredRef = useRef(false);
  const sessionExpireAtRef = useRef<number | null>(null);
  const markSessionExpiredRef = useRef<() => void>(() => undefined);
  const scheduleSessionExpirationRef = useRef<(expiresAt: string | null | undefined) => void>(() => undefined);
  const expiryTimerRef = useRef<number | null>(null);
  const warningTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const warningDismissedRef = useRef(false);

  useEffect(() => {
    hasActiveSessionRef.current = Boolean(user || token);
  }, [token, user]);

  useEffect(() => {
    sessionExpiredRef.current = sessionExpired;
  }, [sessionExpired]);

  const clearExpiryTimer = useCallback(() => {
    if (expiryTimerRef.current !== null) {
      window.clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const clearWarningTimer = useCallback(() => {
    if (warningTimerRef.current !== null) {
      window.clearTimeout(warningTimerRef.current);
      warningTimerRef.current = null;
    }
  }, []);

  const clearCountdownTimer = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  const clearSessionTimers = useCallback(() => {
    clearExpiryTimer();
    clearWarningTimer();
    clearCountdownTimer();
  }, [clearCountdownTimer, clearExpiryTimer, clearWarningTimer]);

  const finalizeExpiredSession = useCallback(() => {
    clearSessionTimers();
    sessionExpireAtRef.current = null;
    warningDismissedRef.current = false;
    hasActiveSessionRef.current = false;
    sessionExpiredRef.current = false;
    setSessionExpired(false);
    setToken(null);
    setUser(null);
  }, [clearSessionTimers]);

  const reloginFromExpiredSession = useCallback(() => {
    notification.destroy(SESSION_EXPIRED_NOTIFICATION_KEY);
  }, [notification]);

  const extendSession = useCallback(async () => {
    if (isExtendingSession || sessionExpiredRef.current) return;

    setIsExtendingSession(true);
    try {
      const result = await api.post<{ access_token: string; access_token_expires_at: string }>(
        '/auth/refresh',
        undefined,
        { skipAuthHandling: true }
      );
      warningDismissedRef.current = false;
      notification.destroy(SESSION_EXPIRED_NOTIFICATION_KEY);
      setToken(result.access_token);
      scheduleSessionExpirationRef.current(result.access_token_expires_at);
    } catch (err) {
      const errMsg = getApiErrorMessage(err);
      if (errMsg === '登录已过期或无权限，请重新登录') {
        markSessionExpiredRef.current();
      } else {
        message.error(`延长登录失败：${errMsg}`);
      }
    } finally {
      setIsExtendingSession(false);
    }
  }, [isExtendingSession, message, notification]);

  const openSessionWarning = useCallback((remainingMs: number) => {
    if (warningDismissedRef.current || sessionExpiredRef.current) return;

    const remainingSeconds = Math.max(Math.ceil(remainingMs / 1000), 0);
    notification.warning({
      key: SESSION_EXPIRED_NOTIFICATION_KEY,
      title: '登录即将超时',
      description: `将在 ${remainingSeconds} 秒后超时。请尽快保存当前内容，超时后可通过通知中的“重新登录”继续。`,
      duration: 0,
      placement: 'topRight',
      actions: (
        <Space>
          <Button type="primary" onClick={extendSession} loading={isExtendingSession}>
            延长登录
          </Button>
        </Space>
      ),
      onClose: () => {
        if (!sessionExpiredRef.current) {
          warningDismissedRef.current = true;
        }
      }
    });
  }, [extendSession, isExtendingSession, notification]);

  const markSessionExpired = useCallback(() => {
    if (!hasActiveSessionRef.current || sessionExpiredRef.current) return;

    clearSessionTimers();
    warningDismissedRef.current = false;
    sessionExpiredRef.current = true;
    setSessionExpired(true);
    setToken(null);

    notification.warning({
      key: SESSION_EXPIRED_NOTIFICATION_KEY,
      title: '登录已超时',
      description: '登录已超时，请重新登录。',
      duration: 0,
      placement: 'topRight',
      actions: (
        <Space>
          <Button type="primary" onClick={reloginFromExpiredSession}>
            重新登录
          </Button>
        </Space>
      ),
      onClose: finalizeExpiredSession
    });
  }, [clearSessionTimers, finalizeExpiredSession, notification, reloginFromExpiredSession]);

  markSessionExpiredRef.current = markSessionExpired;

  const startExpiryCountdown = useCallback(() => {
    clearCountdownTimer();

    const tick = () => {
      if (!hasActiveSessionRef.current || sessionExpiredRef.current) {
        clearCountdownTimer();
        return;
      }

      const expireAtMs = sessionExpireAtRef.current;
      if (!expireAtMs) {
        clearCountdownTimer();
        return;
      }

      const remainingMs = expireAtMs - Date.now();
      if (remainingMs <= 0) {
        clearCountdownTimer();
        markSessionExpired();
        return;
      }

      openSessionWarning(remainingMs);
    };

    tick();
    countdownTimerRef.current = window.setInterval(tick, 1000);
  }, [clearCountdownTimer, markSessionExpired, openSessionWarning]);

  const scheduleSessionExpiration = useCallback((expiresAt: string | null | undefined) => {
    clearSessionTimers();
    sessionExpireAtRef.current = null;
    warningDismissedRef.current = false;
    if (!expiresAt) return;

    const expireAtMs = new Date(expiresAt).getTime();
    if (Number.isNaN(expireAtMs)) return;

    sessionExpireAtRef.current = expireAtMs;

    const delayMs = Math.max(expireAtMs - Date.now(), 0);
    const warningDelayMs = Math.max(delayMs - SESSION_WARNING_LEAD_MS, 0);

    warningTimerRef.current = window.setTimeout(() => {
      startExpiryCountdown();
    }, warningDelayMs);

    expiryTimerRef.current = window.setTimeout(() => {
      markSessionExpired();
    }, delayMs);
  }, [clearSessionTimers, markSessionExpired, startExpiryCountdown]);

  scheduleSessionExpirationRef.current = scheduleSessionExpiration;

  useEffect(() => {
    let canceled = false;
    (async () => {
      try {
        const me = await api.get<AuthSession>('/auth/me', { skipAuthHandling: true });
        if (!canceled) {
          setUser({ id: me.id, username: me.username, role: me.role });
          scheduleSessionExpiration(me.access_token_expires_at);
        }
      } catch {
        // Not logged in (or cookie expired)
      } finally {
        if (!canceled) setIsReady(true);
      }
    })();

    return () => {
      canceled = true;
      clearSessionTimers();
    };
  }, [clearSessionTimers, scheduleSessionExpiration]);

  useEffect(() => {
    return subscribeAuthExpired(() => {
      markSessionExpired();
    });
  }, [markSessionExpired]);

  const logout = useCallback(() => {
    // Best-effort: clear server cookie
    clearSessionTimers();
    sessionExpireAtRef.current = null;
    warningDismissedRef.current = false;
    setIsExtendingSession(false);
    hasActiveSessionRef.current = false;
    sessionExpiredRef.current = false;
    setIsExtendingSession(false);
    setSessionExpired(false);
    notification.destroy(SESSION_EXPIRED_NOTIFICATION_KEY);
    api.post('/auth/logout', undefined, { skipAuthHandling: true }).catch(() => undefined);
    setToken(null);
    setUser(null);
  }, [clearSessionTimers, notification]);

  const login = useCallback(async (username: string, password: string) => {
    const result = await api.post<{ access_token: string; access_token_expires_at: string }>('/auth/login', {
      username,
      password
    }, { skipAuthHandling: true });

    // Keep for backward compatibility (some calls still pass token), but auth is cookie-based.
    notification.destroy(SESSION_EXPIRED_NOTIFICATION_KEY);
    sessionExpiredRef.current = false;
    setIsExtendingSession(false);
    setSessionExpired(false);
    setToken(result.access_token);
    scheduleSessionExpiration(result.access_token_expires_at);

    const me = await api.get<AuthSession>('/auth/me', { skipAuthHandling: true });
    setUser({ id: me.id, username: me.username, role: me.role });
    scheduleSessionExpiration(me.access_token_expires_at);
  }, [notification, scheduleSessionExpiration]);

  const value = useMemo<AuthContextValue>(() => ({ token, user, isReady, sessionExpired, login, logout }), [
    token,
    user,
    isReady,
    sessionExpired,
    login,
    logout
  ]);

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
}
