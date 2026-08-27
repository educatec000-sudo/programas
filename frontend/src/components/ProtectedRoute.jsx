import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { LoadingBlock } from './ui.jsx';

/** Protege a rota: exige sessão ativa e (opcionalmente) uma permissão. */
export default function ProtectedRoute({ permission, children }) {
  const { user, booting, can } = useAuth();
  const location = useLocation();

  if (booting) return <LoadingBlock label="Verificando sessão..." />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.mustChangePassword && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" state={{ passwordChangeRequired: true }} replace />;
  }
  if (permission && !can(permission)) {
    return (
      <div className="centered" style={{ minHeight: '50vh' }}>
        <div style={{ fontSize: 40 }}>🔒</div>
        <h3>Acesso negado</h3>
        <p style={{ color: 'var(--text-2)', margin: 0 }}>
          Seu perfil ({user.role?.name}) não possui a permissão <code>{permission}</code>.
        </p>
      </div>
    );
  }
  return children;
}

/** Renderiza filhos apenas se o usuário tem a permissão. */
export function PermissionGate({ permission, children, fallback = null }) {
  const { can } = useAuth();
  return can(permission) ? <>{children}</> : fallback;
}
