import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.jsx';
import { SessionProvider } from './session.jsx';
import { ConfirmProvider } from '@/components/app.jsx';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <TooltipProvider>
          <ConfirmProvider>
            <App />
            <Toaster position="top-center" />
          </ConfirmProvider>
        </TooltipProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
