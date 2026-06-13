import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './context/AuthContext'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is "fresh" for 5 minutes — no refetch within this window
      staleTime: 1000 * 60 * 5,
      // Cache stays in memory for 30 minutes
      gcTime: 1000 * 60 * 30,
      // Retry failed requests once (faster failure feedback)
      retry: 1,
      // Don't refetch on tab focus — this is what caused the "refresh on tab return" flicker.
      // Per-query opt-in via `refetchOnWindowFocus: true` if a screen needs near-real-time data.
      refetchOnWindowFocus: false,
      // Reconnect: always refetch (network came back, data probably stale)
      refetchOnReconnect: 'always',
      // Don't refetch on mount if data is still within staleTime
      refetchOnMount: false,
      networkMode: 'online',
    },
    mutations: {
      retry: 0,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
)
