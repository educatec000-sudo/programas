import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout.jsx';
import ProtectedRoute from '../components/ProtectedRoute.jsx';

import Login from '../pages/Login.jsx';
import ForgotPassword from '../pages/ForgotPassword.jsx';
import ResetPassword from '../pages/ResetPassword.jsx';
import Dashboard from '../pages/Dashboard.jsx';
import Schools from '../pages/Schools.jsx';
import SchoolDetail from '../pages/SchoolDetail.jsx';
import Programs from '../pages/Programs.jsx';
import ProgramDetail from '../pages/ProgramDetail.jsx';
import Indicators from '../pages/Indicators.jsx';
import Results from '../pages/Results.jsx';
import Goals from '../pages/Goals.jsx';
import TechnicianSchools from '../pages/TechnicianSchools.jsx';
import Rankings from '../pages/Rankings.jsx';
import Analytics from '../pages/Analytics.jsx';
import Reports from '../pages/Reports.jsx';
import Imports from '../pages/Imports.jsx';
import Users from '../pages/Users.jsx';
import Roles from '../pages/Roles.jsx';
import Audit from '../pages/Audit.jsx';
import Profile from '../pages/Profile.jsx';
import Notifications from '../pages/Notifications.jsx';

export default function AppRoutes() {
  return (
    <Routes>
      {/* públicas */}
      <Route path="/login" element={<Login />} />
      <Route path="/esqueci-senha" element={<ForgotPassword />} />
      <Route path="/redefinir-senha" element={<ResetPassword />} />

      {/* protegidas */}
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<ProtectedRoute permission="dashboard:read"><Dashboard /></ProtectedRoute>} />
        <Route path="/escolas" element={<ProtectedRoute permission="schools:read"><Schools /></ProtectedRoute>} />
        <Route path="/escolas/:id" element={<ProtectedRoute permission="schools:read"><SchoolDetail /></ProtectedRoute>} />
        <Route path="/programas" element={<ProtectedRoute permission="programs:read"><Programs /></ProtectedRoute>} />
        <Route path="/programas/:id" element={<ProtectedRoute permission="programs:read"><ProgramDetail /></ProtectedRoute>} />
        <Route path="/indicadores" element={<ProtectedRoute permission="indicators:read"><Indicators /></ProtectedRoute>} />
        <Route path="/resultados" element={<ProtectedRoute permission="results:read"><Results /></ProtectedRoute>} />
        {/* Metas fora do sidebar, mas rota preservada (usada pelos detalhes de programa) */}
        <Route path="/metas" element={<ProtectedRoute permission="goals:read"><Goals /></ProtectedRoute>} />
        <Route path="/tecnicos-escola" element={<ProtectedRoute permission="technicians:read"><TechnicianSchools /></ProtectedRoute>} />
        <Route path="/rankings" element={<ProtectedRoute permission="rankings:read"><Rankings /></ProtectedRoute>} />
        <Route path="/analises" element={<ProtectedRoute permission="analytics:read"><Analytics /></ProtectedRoute>} />
        <Route path="/relatorios" element={<ProtectedRoute permission="reports:read"><Reports /></ProtectedRoute>} />
        <Route path="/importacoes" element={<ProtectedRoute permission="imports:read"><Imports /></ProtectedRoute>} />
        <Route path="/usuarios" element={<ProtectedRoute permission="users:read"><Users /></ProtectedRoute>} />
        <Route path="/perfis" element={<ProtectedRoute permission="roles:read"><Roles /></ProtectedRoute>} />
        <Route path="/auditoria" element={<ProtectedRoute permission="audit:read"><Audit /></ProtectedRoute>} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/notificacoes" element={<Notifications />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
