import axios, { AxiosError, AxiosHeaders, type AxiosRequestConfig } from 'axios'
import { addToast } from '@heroui/react'
import { useAuthStore } from '../stores/auth'

const request = axios.create({ baseURL: '/api/v1', timeout: 15000 })

request.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

function fail(msg: string): never {
  addToast({ title: '操作失败', description: msg, color: 'danger' })
  throw new Error(msg)
}

let refreshing: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken, setTokens } = useAuthStore.getState()
  if (!refreshToken) return null
  refreshing ??= axios
    .post('/api/v1/refresh', { refresh_token: refreshToken })
    .then((res) => {
      const data = res.data?.data
      if (!data?.access_token) return null
      setTokens(data.access_token, data.refresh_token)
      return data.access_token as string
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

function forceLogout() {
  useAuthStore.getState().clear()
  window.location.href = '/login'
}

request.interceptors.response.use(
  (response) => {
    const res = response.data
    // R.page 分页结构原样透传
    if (res && typeof res === 'object' && 'rows' in res) return res
    if (res?.code === 200) return res.data
    fail(res?.msg ?? '请求失败')
  },
  async (error: AxiosError<{ msg?: string }>) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true
      const newToken = await refreshAccessToken()
      if (newToken) {
        original.headers = AxiosHeaders.from({
          ...original.headers,
          Authorization: `Bearer ${newToken}`,
        })
        return request(original)
      }
      forceLogout()
      return fail('登录已过期，请重新登录')
    }
    fail(error.response?.data?.msg ?? '网络异常，请稍后重试')
  },
)

export default request
