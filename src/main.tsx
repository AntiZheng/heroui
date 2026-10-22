import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { ToastProvider } from '@heroui/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import AppRouter from './router'
import { getConfigByKey, PLATFORM_NAME_KEY } from './api/config'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function PlatformTitle() {
  const { data } = useQuery({
    queryKey: ['platform-name'],
    queryFn: () => getConfigByKey(PLATFORM_NAME_KEY, true),
    staleTime: Infinity,
    retry: false,
  })
  useEffect(() => {
    document.title = data || '管理系统平台'
  }, [data])
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider placement="top end" />
      <QueryClientProvider client={queryClient}>
        <PlatformTitle />
        <AppRouter />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
