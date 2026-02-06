import { Navigate } from 'react-router-dom';

import { useAuth } from './useAuth';

export function RequireAdmin(props: { children: React.ReactNode }) {
  const auth = useAuth();

  if (!auth.isReady) return null;
  if (!auth.user) return <Navigate to="/login" replace />;

  if (auth.user.role !== 'admin') {
    return <Navigate to="/config/bank-accounts" replace />;
  }

  return <>{props.children}</>;
}
