import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { ToastProvider } from '@heroui/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import AppRouter from './router'
import { getConfigByKey, BUTTON_STYLE_KEY, PLATFORM_NAME_KEY } from './api/config'
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

// 全局按钮样式同步：参数设置 sys.ui.style 为 flat 时在 html 上挂 .button-flat
// 关闭 3D 玻璃釉面；未配置或值为 3d 时保持立体效果（默认）
function ButtonStyleSync() {
  const { data } = useQuery({
    queryKey: ['config-key', BUTTON_STYLE_KEY],
    queryFn: () => getConfigByKey(BUTTON_STYLE_KEY, true),
    staleTime: Infinity,
    retry: false,
  })
  useEffect(() => {
    document.documentElement.classList.toggle('button-flat', data?.trim() === 'flat')
  }, [data])
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider placement="top end" />
      <QueryClientProvider client={queryClient}>
        <PlatformTitle />
        <ButtonStyleSync />
        <AppRouter />
      </QueryClientProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
