import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* basename is mandatory — apps are served under /gokwik/<app-name>/ */}
      <BrowserRouter basename="/gokwik/meta-credit-tower">
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
