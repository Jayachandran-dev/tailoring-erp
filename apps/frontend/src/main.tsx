import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import * as Sentry from '@sentry/react';
import { registerSW } from 'virtual:pwa-register';
import { initSentry } from './observability/sentry';
import { AuthProvider } from './auth/AuthContext';
import App from './App';
import './styles.css';

// Init Sentry before anything else so errors during boot are captured.
initSentry();

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong. Please reload.</p>}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
