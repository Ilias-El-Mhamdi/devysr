import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { SalesforceConnectionGate } from './components/SalesforceConnectionGate';
import { ToastViewport } from './components/ToastViewport';
import { VersionBadge } from './components/VersionBadge';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root introuvable dans index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SalesforceConnectionGate>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
          </Routes>
        </BrowserRouter>
        <ToastViewport />
        <VersionBadge />
      </SalesforceConnectionGate>
    </QueryClientProvider>
  </StrictMode>,
);
