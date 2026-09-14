import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import { ErrorBoundary } from '../components/ui.jsx';

export default function AppLayout() {
  return (
    <div className="app-shell">
      <ErrorBoundary>
        <Sidebar />
      </ErrorBoundary>
      <div className="app-main">
        <ErrorBoundary>
          <Topbar />
        </ErrorBoundary>
        <main className="app-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
