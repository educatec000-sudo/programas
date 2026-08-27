import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/resources.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    let alive = true;
    authApi
      .me()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setBooting(false));

    const onUnauthenticated = () => {
      setUser(null);
    };
    window.addEventListener('cpe:unauthenticated', onUnauthenticated);
    return () => {
      alive = false;
      window.removeEventListener('cpe:unauthenticated', onUnauthenticated);
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const { user: logged } = await authApi.login({ email, password });
    setUser(logged);
    return logged;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* sessão já encerrada */
    }
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const me = await authApi.me();
      setUser(me);
    } catch {
      /* mantém usuário atual */
    }
  }, []);

  const can = useCallback(
    (permission) => {
      if (!user) return false;
      if (user.role?.level >= 100) return true;
      return (user.role?.permissions || []).includes(permission);
    },
    [user],
  );

  const value = useMemo(
    () => ({ user, booting, login, logout, refreshUser, can }),
    [user, booting, login, logout, refreshUser, can],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
