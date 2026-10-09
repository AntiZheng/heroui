import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeroUIProvider, ToastProvider } from '@heroui/react'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRouter from './router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function HeroUIWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return <HeroUIProvider navigate={navigate}>{children}</HeroUIProvider>
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <HeroUIWithRouter>
        <ToastProvider />
        <QueryClientProvider client={queryClient}>
          <AppRouter />
        </QueryClientProvider>
      </HeroUIWithRouter>
    </BrowserRouter>
  </React.StrictMode>,
)
