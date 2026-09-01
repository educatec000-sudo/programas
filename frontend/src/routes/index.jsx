import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';
import { LoadingBlock } from '../components/ui.jsx';

const Login = lazy(() => import('../pages/Login.jsx'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('../pages/ResetPassword.jsx'));
const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const Schools = lazy(() => import('../pages/Schools.jsx'));
const SchoolDetail = lazy(() => import('../pages/SchoolDetail.jsx'));
const Programs = lazy(() => import('../pages/Programs.jsx'));
const ProgramDetail = lazy(() => import('../pages/ProgramDetail.jsx'));
const ProgramSchoolEvaluation = lazy(() => import('../pages/ProgramSchoolEvaluation.jsx'));
const Evaluations = lazy(() => import('../pages/Evaluations.jsx'));
const Results = lazy(() => import('../pages/Results.jsx'));
const TechnicianSchools = lazy(() => import('../pages/TechnicianSchools.jsx'));
const Rankings = lazy(() => import('../pages/Rankings.jsx'));
const Analytics = lazy(() => import('../pages/Analytics.jsx'));
const Reports = lazy(() => import('../pages/Reports.jsx'));
const Imports = lazy(() => import('../pages/Imports.jsx'));
const Users = lazy(() => import('../pages/Users.jsx'));
const Roles = lazy(() => import('../pages/Roles.jsx'));
const Audit = lazy(() => import('../pages/Audit.jsx'));
const Profile = lazy(() => import('../pages/Profile.jsx'));
const Notifications = lazy(() => import('../pages/Notifications.jsx'));

function page(Component, permission) {
  const content = (
    <Suspense fallback={<LoadingBlock label="Carregando página..." />}>
      <Component />
    </Suspense>
  );
  return permission
    ? <ProtectedRoute permission={permission}>{content}</ProtectedRoute>
    : content;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={page(Login)} />
      <Route path="/esqueci-senha" element={page(ForgotPassword)} />
      <Route path="/redefinir-senha" element={page(ResetPassword)} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={page(Dashboard, 'dashboard:read')} />
        <Route path="/escolas" element={page(Schools, 'schools:read')} />
        <Route path="/escolas/:id" element={page(SchoolDetail, 'schools:read')} />
        <Route path="/programas" element={page(Programs, 'programs:read')} />
        <Route path="/programas/:id" element={page(ProgramDetail, 'programs:read')} />
        <Route path="/programas/:id/escolas/:schoolId" element={page(ProgramSchoolEvaluation, 'rankings:read')} />
        <Route path="/avaliacoes" element={page(Evaluations, 'rankings:read')} />
        <Route path="/indicadores" element={<Navigate to="/programas" replace />} />
        <Route path="/resultados" element={page(Results, 'results:read')} />
        <Route path="/metas" element={<Navigate to="/programas" replace />} />
        <Route path="/tecnicos-escola" element={page(TechnicianSchools, 'technicians:read')} />
        <Route path="/rankings" element={page(Rankings, 'rankings:read')} />
        <Route path="/analises" element={page(Analytics, 'analytics:read')} />
        <Route path="/relatorios" element={page(Reports, 'reports:read')} />
        <Route path="/importacoes" element={page(Imports, 'imports:read')} />
        <Route path="/usuarios" element={page(Users, 'users:read')} />
        <Route path="/perfis" element={page(Roles, 'roles:read')} />
        <Route path="/auditoria" element={page(Audit, 'audit:read')} />
        <Route path="/perfil" element={page(Profile)} />
        <Route path="/notificacoes" element={page(Notifications)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
