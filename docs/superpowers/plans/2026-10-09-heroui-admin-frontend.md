# HeroUI 管理前端（最小验证版）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `D:\Desktop\heroUI` 从零搭建 React + HeroUI 前端，打通「登录 → 首页 → 用户管理」与后端 `D:\Desktop\template_project\backend`（FastAPI，前缀 `/api/v1`，端口 9099）的全链路。

**Architecture:** Vite + React 19 + TS 单页应用；axios 统一解包后端 `R` 响应并处理 401 静默刷新；TanStack Query 管服务端状态；zustand 持久化登录态；静态菜单（动态菜单留第二版）。UI 全部用 HeroUI（开源版）+ Tailwind v4，全新设计方向。

**Tech Stack:** Vite 7、React 19、TypeScript、@heroui/react（Tailwind v4 + framer-motion）、React Router 7、TanStack Query 5、axios、zustand 5。

**测试说明：** 按已确认的设计文档，本版不写单元测试；每个任务用 `npm run build`（含 tsc 类型检查）验证编译，Task 8 用浏览器实测全链路。

**后端接口事实（已核对源码）：**
- 统一响应 `R`：成功 `{code:200, msg, data, success:true}`；失败 `{code:601(默认), msg, success:false}`，HTTP 状态码恒为 200
- 分页响应 `R.page`：`{code, msg, rows, total, pageNum, pageSize}`
- 认证失败由 FastAPI 依赖抛 HTTP 401（不是 R 里的 code 401）
- `GET /api/v1/captchaImage` → `data: {uuid, img("data:image/png;base64,..."), captchaEnabled}`
- `POST /api/v1/login`（表单字段 `username/password/code/uuid`）→ `data: {access_token, refresh_token, token_type, expires_in}`
- `GET /api/v1/getInfo` → `data: {user(snake_case字段), roles, permissions}`（注意：`user` 里是 `user_name/nick_name` 等 snake_case）
- `POST /api/v1/refresh`（JSON `{refresh_token}`）→ 同 login 的 data
- `GET /api/v1/user/list`（query: `pageNum/pageSize/userName/nickName/phonenumber/status/deptId`...）→ `R.page`，`rows` 为 snake_case 用户对象（`user_id/user_name/nick_name/phonenumber/status/create_time/dept_id...`），**无嵌套 dept/roles**
- `POST /api/v1/user`（JSON，CamelModel，camel/snake 均可，计划统一用 camelCase）→ 必填 `userName/nickName/password/deptId/roleIds/postIds`
- `PUT /api/v1/user`（同上 + `userId`）
- `DELETE /api/v1/user/{ids}`（逗号分隔）
- `PUT /api/v1/user/resetPwd`（`{userId, password}`）
- `PUT /api/v1/user/changeStatus`（body 是 EditUser：必须带全 `userName/nickName/deptId/roleIds/postIds` + `userId` + `status`）
- `GET /api/v1/user/deptTree` → `data: [{id, label, parentId, children}]`
- `GET /api/v1/server` → `data: {cpu:{cpuNum, cpuUsed,...}, memory:{total,used,free,usage}, disk:{...}, python:{...}, sys:{...}}`
- 默认账号 `admin / admin123`

---

### Task 1: git 初始化 + 项目脚手架 + 依赖 + HeroUI/Tailwind 配置

**Files:**
- Create: `.gitignore`、`package.json`、`vite.config.ts`、`tsconfig.json`、`index.html`、`src/main.tsx`、`src/App.tsx`、`src/vite-env.d.ts`、`src/index.css`、`src/hero.ts`

- [ ] **Step 1: git init 与首次暂存设计文档**

```bash
cd D:/Desktop/heroUI
git init
git add docs/
git commit -m "docs: HeroUI 管理前端设计文档"
```

- [ ] **Step 2: 写 `.gitignore`**

```gitignore
node_modules
dist
*.local
.env
.DS_Store
```

- [ ] **Step 3: 写 `package.json`**

```json
{
  "name": "heroui-admin",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@heroui/react": "^2.8.0",
    "@tanstack/react-query": "^5.0.0",
    "axios": "^1.7.0",
    "framer-motion": "^12.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "tailwindcss": "^4.1.0",
    "typescript": "~5.8.0",
    "vite": "^7.0.0"
  }
}
```

- [ ] **Step 4: 写 `vite.config.ts`（含后端代理）**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:9099', changeOrigin: true },
      '/uploads': { target: 'http://localhost:9099', changeOrigin: true },
    },
  },
})
```

- [ ] **Step 5: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "useDefineForClassFields": true
  },
  "include": ["src", "vite.config.ts", "src/hero.ts"]
}
```

- [ ] **Step 6: 写 `index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin 管理平台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 写 `src/vite-env.d.ts`**

```ts
/// <reference types="vite/client" />
```

- [ ] **Step 8: 写 Tailwind v4 + HeroUI 样式入口 `src/index.css` 和 `src/hero.ts`**

`src/hero.ts`：

```ts
import { heroui } from '@heroui/react'

export default heroui()
```

`src/index.css`：

```css
@import 'tailwindcss';
@plugin './hero.ts';
@source '../node_modules/@heroui/theme/dist/**/*.{js,ts,jsx,tsx}';
```

- [ ] **Step 9: 写临时入口 `src/main.tsx` 和 `src/App.tsx`（验证 HeroUI 可用，后续任务会替换）**

`src/main.tsx`：

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeroUIProvider, ToastProvider } from '@heroui/react'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ToastProvider />
      <App />
    </HeroUIProvider>
  </React.StrictMode>,
)
```

`src/App.tsx`：

```tsx
import { Button } from '@heroui/react'

export default function App() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Button color="primary">HeroUI 就绪</Button>
    </div>
  )
}
```

- [ ] **Step 10: 安装依赖**

```bash
cd D:/Desktop/heroUI
npm install
```

Expected: 安装成功无 error（peer 警告可忽略）。

- [ ] **Step 11: 类型检查 + 构建验证**

```bash
npm run build
```

Expected: tsc 无错误，`dist` 生成成功。

- [ ] **Step 12: 提交**

```bash
git add .
git commit -m "chore: Vite+React+HeroUI 脚手架与依赖"
```

---

### Task 2: 类型定义 + axios 封装（R 解包/401 刷新）+ auth store + API 模块

**Files:**
- Create: `src/types/api.ts`、`src/types/user.ts`、`src/stores/auth.ts`、`src/api/request.ts`、`src/api/auth.ts`、`src/api/user.ts`

- [ ] **Step 1: 写 `src/types/api.ts`**

```ts
export interface R<T = unknown> {
  code: number
  msg: string
  success: boolean
  data?: T
}

export interface PageResult<T = unknown> {
  code: number
  msg: string
  success: boolean
  rows: T[]
  total: number
  pageNum: number
  pageSize: number
}
```

- [ ] **Step 2: 写 `src/types/user.ts`**

```ts
// getInfo 返回的 user 是后端 model_dump() 的 snake_case
export interface CurrentUserInfo {
  user_id: number
  user_name: string
  nick_name: string
  avatar?: string
  dept_id?: number
  [key: string]: unknown
}

// /user/list rows 为 ORM 序列化结果，snake_case，无嵌套 dept/roles
export interface SysUserRow {
  user_id: number
  dept_id?: number
  user_name: string
  nick_name: string
  email?: string | null
  phonenumber?: string | null
  sex?: string | null
  avatar?: string | null
  status: string
  login_ip?: string | null
  login_date?: string | null
  create_time?: string | null
  remark?: string | null
}

export interface DeptTreeNode {
  id: number
  label: string
  parentId: number
  children?: DeptTreeNode[]
}

export interface UserPayload {
  userId?: number
  userName: string
  nickName: string
  password?: string
  deptId: number
  roleIds: number[]
  postIds: number[]
  email?: string
  phonenumber?: string
  sex?: string
  status?: string
  remark?: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

export interface CaptchaResult {
  uuid: string
  img: string
  captchaEnabled: boolean
}

export interface ServerInfo {
  cpu: { cpuNum: number; cpuUsed: number; [key: string]: unknown }
  memory: { total: number; used: number; free: number; usage: number }
  disk: { total: number; used: number; free: number; usage: number }
  python: { version: string; [key: string]: unknown }
  sys: Record<string, unknown>
}
```

- [ ] **Step 3: 写 `src/stores/auth.ts`**

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { CurrentUserInfo } from '../types/user'

interface AuthState {
  token: string
  refreshToken: string
  user: CurrentUserInfo | null
  roles: string[]
  permissions: string[]
  setTokens: (token: string, refreshToken: string) => void
  setUserInfo: (user: CurrentUserInfo, roles: string[], permissions: string[]) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: '',
      refreshToken: '',
      user: null,
      roles: [],
      permissions: [],
      setTokens: (token, refreshToken) => set({ token, refreshToken }),
      setUserInfo: (user, roles, permissions) => set({ user, roles, permissions }),
      clear: () =>
        set({ token: '', refreshToken: '', user: null, roles: [], permissions: [] }),
    }),
    { name: 'heroui-admin-auth' },
  ),
)

export const hasPermission = (permission: string) =>
  useAuthStore.getState().permissions.includes(permission)
```

- [ ] **Step 4: 写 `src/api/request.ts`（核心封装）**

```ts
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
```

- [ ] **Step 5: 写 `src/api/auth.ts`**

```ts
import request from './request'
import type { CurrentUserInfo, CaptchaResult, TokenResponse } from '../types/user'

export const getCaptcha = () => request.get<never, CaptchaResult>('/captchaImage')

export const login = (data: { username: string; password: string; code: string; uuid: string }) =>
  request.post<never, TokenResponse>('/login', new URLSearchParams(data))

export const getInfo = () =>
  request.get<never, { user: CurrentUserInfo; roles: string[]; permissions: string[] }>('/getInfo')

export const logout = () => request.post<never, null>('/logout')
```

- [ ] **Step 6: 写 `src/api/user.ts`**

```ts
import request from './request'
import type { DeptTreeNode, PageResult, SysUserRow, UserPayload } from '../types/user'

export interface UserListQuery {
  pageNum: number
  pageSize: number
  userName?: string
  phonenumber?: string
  status?: string
  deptId?: number
}

export const getUserList = (params: UserListQuery) =>
  request.get<never, PageResult<SysUserRow>>('/user/list', { params })

export const getDeptTree = () => request.get<never, DeptTreeNode[]>('/user/deptTree')

export const addUser = (data: UserPayload) => request.post<never, null>('/user', data)

export const editUser = (data: UserPayload) => request.put<never, null>('/user', data)

export const deleteUsers = (userIds: number[]) =>
  request.delete<never, null>(`/user/${userIds.join(',')}`)

export const resetPwd = (userId: number, password: string) =>
  request.put<never, null>('/user/resetPwd', { userId, password })

export const changeStatus = (row: SysUserRow, status: string) =>
  request.put<never, null>('/user/changeStatus', {
    userId: row.user_id,
    userName: row.user_name,
    nickName: row.nick_name,
    deptId: row.dept_id,
    roleIds: [],
    postIds: [],
    status,
  })
```

- [ ] **Step 7: 构建验证**

```bash
npm run build
```

Expected: tsc 与 vite 构建均无错误。

- [ ] **Step 8: 提交**

```bash
git add .
git commit -m "feat: 类型定义、axios 封装（R 解包+401 刷新）、auth store 与 API 模块"
```

---

### Task 3: 路由 + 应用外壳 + 三个占位页

**Files:**
- Create: `src/router/index.tsx`、`src/components/layout/AppShell.tsx`、`src/pages/login/index.tsx`、`src/pages/home/index.tsx`、`src/pages/system/user/index.tsx`
- Modify: `src/main.tsx`、`src/App.tsx`

- [ ] **Step 1: 写 `src/router/index.tsx`**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom'
import type { ReactElement } from 'react'
import AppShell from '../components/layout/AppShell'
import LoginPage from '../pages/login'
import HomePage from '../pages/home'
import UserPage from '../pages/system/user'
import { useAuthStore } from '../stores/auth'

function RequireAuth({ children }: { children: ReactElement }) {
  const token = useAuthStore((s) => s.token)
  return token ? children : <Navigate to="/login" replace />
}

export default function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="system/user" element={<UserPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
```

- [ ] **Step 2: 写 `src/components/layout/AppShell.tsx`（全新设计方向的外壳：左侧导航 + 顶栏 + 内容区）**

```tsx
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Tooltip } from '@heroui/react'
import { useAuthStore } from '../../stores/auth'
import { logout } from '../../api/auth'

const navItems = [
  { path: '/', label: '首页' },
  { path: '/system/user', label: '用户管理' },
]

export default function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)

  const handleLogout = async () => {
    try {
      await logout()
    } catch {
      // 后端登出失败也不阻塞本地退出
    }
    clear()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-56 flex-col border-r border-divider bg-content1">
        <div className="flex h-16 items-center px-5 text-lg font-bold">Admin 平台</div>
        <nav className="flex-1 space-y-1 px-3">
          {navItems.map((item) => {
            const active = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`w-full rounded-medium px-4 py-2.5 text-left text-small transition-colors ${
                  active
                    ? 'bg-primary/15 font-medium text-primary'
                    : 'text-foreground-600 hover:bg-default-100'
                }`}
              >
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-end gap-3 border-b border-divider bg-content1 px-6">
          <Avatar
            name={user?.nick_name?.slice(0, 1) ?? 'A'}
            size="sm"
            className="cursor-pointer"
          />
          <Tooltip content="退出登录">
            <button onClick={handleLogout} className="text-small text-foreground-500 hover:text-danger">
              退出
            </button>
          </Tooltip>
        </header>
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 写三个占位页**

`src/pages/login/index.tsx`：

```tsx
export default function LoginPage() {
  return <div className="flex h-screen items-center justify-center">Login 占位</div>
}
```

`src/pages/home/index.tsx`：

```tsx
export default function HomePage() {
  return <div>Home 占位</div>
}
```

`src/pages/system/user/index.tsx`：

```tsx
export default function UserPage() {
  return <div>User 占位</div>
}
```

- [ ] **Step 4: 改 `src/main.tsx` 挂载路由**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HeroUIProvider, ToastProvider } from '@heroui/react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppRouter from './router'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HeroUIProvider>
      <ToastProvider />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRouter />
        </BrowserRouter>
      </QueryClientProvider>
    </HeroUIProvider>
  </React.StrictMode>,
)
```

- [ ] **Step 5: 删除旧 `src/App.tsx`**

```bash
git rm src/App.tsx
```

- [ ] **Step 6: 构建验证**

```bash
npm run build
```

Expected: 无错误。

- [ ] **Step 7: 提交**

```bash
git add .
git commit -m "feat: 路由、应用外壳与页面占位"
```

---

### Task 4: 登录页

**Files:**
- Modify: `src/pages/login/index.tsx`（整体替换占位内容）

- [ ] **Step 1: 实现登录页（左右分栏：左侧品牌视觉区，右侧表单；验证码可点击刷新；提交走 form 表单编码）**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, Input, addToast } from '@heroui/react'
import { getCaptcha, login, getInfo } from '../../api/auth'
import { useAuthStore } from '../../stores/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUserInfo = useAuthStore((s) => s.setUserInfo)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [captcha, setCaptcha] = useState<{ uuid: string; img: string }>({ uuid: '', img: '' })
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptcha()
      setCaptcha({ uuid: res.uuid, img: res.img })
    } catch {
      // 验证码失败时用户可点击重试
    }
  }
  // 首次加载拉取验证码（React 会因 StrictMode 调两次，可接受）
  void refreshCaptcha()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password || !code) {
      addToast({ title: '提示', description: '请填写完整登录信息', color: 'warning' })
      return
    }
    setSubmitting(true)
    try {
      const token = await login({ username, password, code, uuid: captcha.uuid })
      setTokens(token.access_token, token.refresh_token)
      const info = await getInfo()
      setUserInfo(info.user, info.roles, info.permissions)
      navigate('/', { replace: true })
    } catch {
      await refreshCaptcha()
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen">
      <div className="hidden flex-1 flex-col items-center justify-center bg-primary lg:flex">
        <h1 className="text-4xl font-bold text-primary-foreground">Admin 管理平台</h1>
        <p className="mt-4 text-primary-foreground/80">HeroUI × FastAPI 最小验证版</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardBody className="gap-4 p-8">
            <h2 className="text-xl font-semibold">欢迎回来</h2>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Input
                label="账号"
                value={username}
                onValueChange={setUsername}
                isRequired
                placeholder="请输入账号"
              />
              <Input
                label="密码"
                type="password"
                value={password}
                onValueChange={setPassword}
                isRequired
                placeholder="请输入密码"
              />
              <div className="flex items-end gap-2">
                <Input
                  label="验证码"
                  value={code}
                  onValueChange={setCode}
                  isRequired
                  className="flex-1"
                />
                {captcha.img ? (
                  <img
                    src={captcha.img}
                    alt="验证码"
                    className="h-10 cursor-pointer rounded-medium"
                    onClick={refreshCaptcha}
                  />
                ) : (
                  <Button variant="flat" onPress={refreshCaptcha}>
                    获取
                  </Button>
                )}
              </div>
              <Button type="submit" color="primary" isLoading={submitting}>
                登 录
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 构建验证**

```bash
npm run build
```

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: 登录页（验证码 + 表单登录）"
```

---

### Task 5: 首页（欢迎 + 用户统计 + 服务器监控）

**Files:**
- Modify: `src/pages/home/index.tsx`（整体替换占位内容）

- [ ] **Step 1: 实现首页（欢迎区 + 用户总数卡 + CPU/内存/磁盘卡；监控接口失败只隐藏卡片）**

```tsx
import { useQuery } from '@tanstack/react-query'
import { Card, CardBody, Progress } from '@heroui/react'
import { getUserList } from '../../api/user'
import request from '../../api/request'
import { useAuthStore } from '../../stores/auth'
import type { ServerInfo } from '../../types/user'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function usageColor(pct: number): 'success' | 'warning' | 'danger' {
  if (pct < 60) return 'success'
  if (pct < 85) return 'warning'
  return 'danger'
}

export default function HomePage() {
  const nickName = useAuthStore((s) => s.user?.nick_name)

  const { data: userTotal } = useQuery({
    queryKey: ['user-total'],
    queryFn: () => getUserList({ pageNum: 1, pageSize: 1 }),
    select: (res) => res.total,
  })

  const { data: server } = useQuery({
    queryKey: ['server-info'],
    queryFn: () => request.get<never, ServerInfo>('/server'),
    retry: false,
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {greeting()}，{nickName ?? '管理员'}
        </h1>
        <p className="mt-1 text-small text-foreground-500">欢迎使用 Admin 管理平台</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardBody className="gap-1">
            <p className="text-small text-foreground-500">用户总数</p>
            <p className="text-3xl font-bold">{userTotal ?? '—'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="gap-1">
            <p className="text-small text-foreground-500">内存使用</p>
            <p className="text-3xl font-bold">{server ? `${server.memory.usage}%` : '—'}</p>
            {server && (
              <Progress
                size="sm"
                value={server.memory.usage}
                color={usageColor(server.memory.usage)}
                aria-label="内存使用率"
              />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardBody className="gap-1">
            <p className="text-small text-foreground-500">磁盘使用</p>
            <p className="text-3xl font-bold">{server ? `${server.disk.usage}%` : '—'}</p>
            {server && (
              <Progress
                size="sm"
                value={server.disk.usage}
                color={usageColor(server.disk.usage)}
                aria-label="磁盘使用率"
              />
            )}
          </CardBody>
        </Card>
      </div>

      {server && (
        <Card>
          <CardBody className="flex flex-row flex-wrap gap-8">
            <div>
              <p className="text-small text-foreground-500">CPU 核心 / 使用率</p>
              <p className="font-medium">
                {server.cpu.cpuNum} 核 · {server.cpu.cpuUsed}%
              </p>
            </div>
            <div>
              <p className="text-small text-foreground-500">内存</p>
              <p className="font-medium">
                {server.memory.used}G / {server.memory.total}G
              </p>
            </div>
            <div>
              <p className="text-small text-foreground-500">Python 版本</p>
              <p className="font-medium">{server.python.version}</p>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 构建验证**

```bash
npm run build
```

Expected: 无错误。

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: 首页（欢迎 + 用户统计 + 服务器监控卡片）"
```

---

### Task 6: 用户管理列表页（筛选 + 表格 + 分页 + 部门树筛选）

**Files:**
- Create: `src/pages/system/user/deptTree.ts`（树拍平工具）
- Modify: `src/pages/system/user/index.tsx`（整体替换占位内容）

- [ ] **Step 1: 写 `src/pages/system/user/deptTree.ts`（HeroUI 无树组件，拍平成缩进选项）**

```ts
import type { DeptTreeNode } from '../../../types/user'

export interface DeptOption {
  id: number
  label: string
}

export function flattenDeptTree(nodes: DeptTreeNode[], depth = 0): DeptOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, label: `${'　'.repeat(depth)}${node.label}` },
    ...flattenDeptTree(node.children ?? [], depth + 1),
  ])
}
```

- [ ] **Step 2: 实现用户列表页**

```tsx
import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardBody,
  Chip,
  Input,
  Pagination,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react'
import { getDeptTree, getUserList } from '../../../api/user'
import { flattenDeptTree } from './deptTree'
import type { UserListQuery } from '../../../api/user'
import type { SysUserRow } from '../../../types/user'

const PAGE_SIZE = 10

export default function UserPage() {
  const [query, setQuery] = useState<UserListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [userNameInput, setUserNameInput] = useState('')
  const [phoneInput, setPhoneInput] = useState('')

  const { data: deptOptions } = useQuery({
    queryKey: ['dept-tree'],
    queryFn: getDeptTree,
    select: flattenDeptTree,
  })

  const { data, isFetching } = useQuery({
    queryKey: ['user-list', query],
    queryFn: () => getUserList(query),
    placeholderData: keepPreviousData,
  })

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE)),
    [data?.total],
  )

  const search = () => setQuery((q) => ({ ...q, pageNum: 1, userName: userNameInput, phonenumber: phoneInput }))

  const reset = () => {
    setUserNameInput('')
    setPhoneInput('')
    setQuery({ pageNum: 1, pageSize: PAGE_SIZE })
  }

  const columns = [
    { key: 'user_id', label: 'ID' },
    { key: 'user_name', label: '账号' },
    { key: 'nick_name', label: '昵称' },
    { key: 'phonenumber', label: '手机号' },
    { key: 'status', label: '状态' },
    { key: 'create_time', label: '创建时间' },
  ]

  const renderCell = (row: SysUserRow, key: string) => {
    switch (key) {
      case 'status':
        return (
          <Chip color={row.status === '0' ? 'success' : 'default'} size="sm" variant="flat">
            {row.status === '0' ? '正常' : '停用'}
          </Chip>
        )
      default:
        return <span>{(row as Record<string, unknown>)[key as string] ?? '—'}</span>
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-row flex-wrap items-end gap-3">
          <Input
            label="账号"
            value={userNameInput}
            onValueChange={setUserNameInput}
            className="w-48"
          />
          <Input
            label="手机号"
            value={phoneInput}
            onValueChange={setPhoneInput}
            className="w-48"
          />
          <Select
            label="部门"
            className="w-48"
            selectedKeys={query.deptId ? [String(query.deptId)] : []}
            onSelectionChange={(keys) => {
              const key = Array.from(keys)[0] as string | undefined
              setQuery((q) => ({ ...q, pageNum: 1, deptId: key ? Number(key) : undefined }))
            }}
          >
            {(deptOptions ?? []).map((dept) => (
              <SelectItem key={String(dept.id)}>{dept.label}</SelectItem>
            ))}
          </Select>
          <Button color="primary" onPress={search}>
            搜索
          </Button>
          <Button variant="flat" onPress={reset}>
            重置
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-medium font-medium">用户列表</h2>
            <span className="text-small text-foreground-500">共 {data?.total ?? 0} 条</span>
          </div>
          <Table aria-label="用户列表" isStriped>
            <TableHeader columns={columns}>
              {(column) => (
                <TableColumn key={column.key}>{column.label}</TableColumn>
              )}
            </TableHeader>
            <TableBody
              items={data?.rows ?? []}
              emptyContent="暂无数据"
              isLoading={isFetching}
            >
              {(row) => (
                <TableRow key={row.user_id}>
                  {(columnKey) => <TableCell>{renderCell(row, columnKey)}</TableCell>}
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-center">
            <Pagination
              total={totalPages}
              page={query.pageNum}
              onChange={(page) => setQuery((q) => ({ ...q, pageNum: page }))}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: 构建验证**

```bash
npm run build
```

Expected: 无错误。

- [ ] **Step 4: 提交**

```bash
git add .
git commit -m "feat: 用户管理列表页（筛选+表格+分页+部门树）"
```

---

### Task 7: 用户新增/编辑弹窗 + 行操作（删除/重置密码/状态开关）

**Files:**
- Create: `src/pages/system/user/UserFormModal.tsx`、`src/pages/system/user/RowActions.tsx`
- Modify: `src/pages/system/user/index.tsx`

- [ ] **Step 1: 写 `src/pages/system/user/UserFormModal.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Switch,
  addToast,
} from '@heroui/react'
import { addUser, editUser, getDeptTree } from '../../../api/user'
import { flattenDeptTree } from './deptTree'
import type { SysUserRow, UserPayload } from '../../../types/user'

interface Props {
  isOpen: boolean
  editing: SysUserRow | null
  onClose: () => void
}

const emptyForm = {
  userName: '',
  nickName: '',
  password: '',
  deptId: new Set<string>(),
  phonenumber: '',
  email: '',
  status: '0',
}

export default function UserFormModal({ isOpen, editing, onClose }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)

  const { data: deptTreeData } = useQuery({ queryKey: ['dept-tree'], queryFn: getDeptTree })
  const deptOptions = useMemo(() => flattenDeptTree(deptTreeData ?? []), [deptTreeData])

  useEffect(() => {
    if (isOpen) {
      setForm(
        editing
          ? {
              userName: editing.user_name,
              nickName: editing.nick_name,
              password: '',
              deptId: new Set(editing.dept_id ? [String(editing.dept_id)] : []),
              phonenumber: editing.phonenumber ?? '',
              email: editing.email ?? '',
              status: editing.status,
            }
          : emptyForm,
      )
    }
  }, [isOpen, editing])

  const handleSubmit = async () => {
    if (!form.userName || !form.nickName || form.deptId.size === 0) {
      addToast({ title: '提示', description: '请填写账号、昵称并选择部门', color: 'warning' })
      return
    }
    if (!editing && !form.password) {
      addToast({ title: '提示', description: '新增用户必须填写密码', color: 'warning' })
      return
    }
    setSaving(true)
    try {
      const payload: UserPayload = {
        userName: form.userName,
        nickName: form.nickName,
        deptId: Number(Array.from(form.deptId)[0]),
        roleIds: [],
        postIds: [],
        phonenumber: form.phonenumber || undefined,
        email: form.email || undefined,
        status: form.status,
      }
      if (editing) {
        await editUser({ ...payload, userId: editing.user_id })
        addToast({ title: '成功', description: '修改成功', color: 'success' })
      } else {
        await addUser({ ...payload, password: form.password })
        addToast({ title: '成功', description: '新增成功', color: 'success' })
      }
      queryClient.invalidateQueries({ queryKey: ['user-list'] })
      queryClient.invalidateQueries({ queryKey: ['user-total'] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalContent>
        <ModalHeader>{editing ? '编辑用户' : '新增用户'}</ModalHeader>
        <ModalBody className="gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="账号"
              value={form.userName}
              onValueChange={(v) => setForm((f) => ({ ...f, userName: v }))}
              isDisabled={!!editing}
            />
            <Input
              label="昵称"
              value={form.nickName}
              onValueChange={(v) => setForm((f) => ({ ...f, nickName: v }))}
            />
            {!editing && (
              <Input
                label="密码"
                type="password"
                value={form.password}
                onValueChange={(v) => setForm((f) => ({ ...f, password: v }))}
              />
            )}
            <Input
              label="手机号"
              value={form.phonenumber}
              onValueChange={(v) => setForm((f) => ({ ...f, phonenumber: v }))}
            />
            <Input
              label="邮箱"
              value={form.email}
              onValueChange={(v) => setForm((f) => ({ ...f, email: v }))}
            />
            <Select
              label="部门"
              selectedKeys={form.deptId}
              onSelectionChange={(keys) => setForm((f) => ({ ...f, deptId: keys as Set<string> }))}
            >
              {deptOptions.map((dept) => (
                <SelectItem key={String(dept.id)}>{dept.label}</SelectItem>
              ))}
            </Select>
          </div>
          <Switch
            isSelected={form.status === '0'}
            onValueChange={(v) => setForm((f) => ({ ...f, status: v ? '0' : '1' }))}
          >
            状态正常
          </Switch>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            取消
          </Button>
          <Button color="primary" isLoading={saving} onPress={handleSubmit}>
            保存
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}
```

- [ ] **Step 2: 写 `src/pages/system/user/RowActions.tsx`（编辑/删除/重置密码/状态开关，权限控制按钮）**

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Tooltip,
  addToast,
} from '@heroui/react'
import { changeStatus, deleteUsers, resetPwd } from '../../../api/user'
import { hasPermission } from '../../../stores/auth'
import type { SysUserRow } from '../../../types/user'

interface Props {
  row: SysUserRow
  onEdit: (row: SysUserRow) => void
}

export default function RowActions({ row, onEdit }: Props) {
  const queryClient = useQueryClient()
  const [status, setStatus] = useState(row.status)
  const [resetOpen, setResetOpen] = useState(false)
  const [newPwd, setNewPwd] = useState('')

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['user-list'] })
    queryClient.invalidateQueries({ queryKey: ['user-total'] })
  }

  const handleDelete = async () => {
    if (!window.confirm(`确定删除用户「${row.user_name}」吗？`)) return
    await deleteUsers([row.user_id])
    addToast({ title: '成功', description: '删除成功', color: 'success' })
    invalidate()
  }

  const handleStatusToggle = async (checked: boolean) => {
    const next = checked ? '0' : '1'
    try {
      await changeStatus(row, next)
      setStatus(next)
      addToast({ title: '成功', description: '状态修改成功', color: 'success' })
    } catch {
      // 失败保持原状态
    }
  }

  const handleResetPwd = async () => {
    if (!newPwd) {
      addToast({ title: '提示', description: '请输入新密码', color: 'warning' })
      return
    }
    await resetPwd(row.user_id, newPwd)
    addToast({ title: '成功', description: '密码已重置', color: 'success' })
    setResetOpen(false)
    setNewPwd('')
  }

  return (
    <div className="flex items-center gap-2">
      <Switch size="sm" isSelected={status === '0'} onValueChange={handleStatusToggle} aria-label="启用状态" />
      {hasPermission('system:user:edit') && (
        <Tooltip content="编辑">
          <Button size="sm" variant="light" onPress={() => onEdit(row)}>
            编辑
          </Button>
        </Tooltip>
      )}
      {hasPermission('system:user:resetPwd') && (
        <Tooltip content="重置密码">
          <Button size="sm" variant="light" onPress={() => setResetOpen(true)}>
            重置密码
          </Button>
        </Tooltip>
      )}
      {hasPermission('system:user:remove') && (
        <Button size="sm" variant="light" color="danger" onPress={handleDelete}>
          删除
        </Button>
      )}
      <Modal isOpen={resetOpen} onClose={() => setResetOpen(false)} size="sm">
        <ModalContent>
          <ModalHeader>重置密码 — {row.user_name}</ModalHeader>
          <ModalBody>
            <Input
              label="新密码"
              type="password"
              value={newPwd}
              onValueChange={setNewPwd}
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setResetOpen(false)}>
              取消
            </Button>
            <Button color="primary" onPress={handleResetPwd}>
              确认重置
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  )
}
```

- [ ] **Step 3: 修改 `src/pages/system/user/index.tsx` 接入弹窗与行操作**

在列表页基础上修改：
1. import 增加 `UserFormModal`、`RowActions`、`useState` 已有；
2. 组件内增加状态与列：

```tsx
const [formOpen, setFormOpen] = useState(false)
const [editing, setEditing] = useState<SysUserRow | null>(null)

const openCreate = () => {
  setEditing(null)
  setFormOpen(true)
}
const openEdit = (row: SysUserRow) => {
  setEditing(row)
  setFormOpen(true)
}
```

3. columns 增加操作列（放在数组最后）：

```tsx
{ key: 'actions', label: '操作' },
```

4. `renderCell` 增加 case：

```tsx
case 'actions':
  return <RowActions row={row} onEdit={openEdit} />
```

5. 「用户列表」标题右侧增加新增按钮：

```tsx
<Button color="primary" onPress={openCreate}>
  新增用户
</Button>
```

6. 组件 JSX 末尾（最外层 div 内）挂载弹窗：

```tsx
<UserFormModal isOpen={formOpen} editing={editing} onClose={() => setFormOpen(false)} />
```

7. `hasPermission('system:user:add')` 控制新增按钮显隐（条件渲染）。

- [ ] **Step 4: 构建验证**

```bash
npm run build
```

Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add .
git commit -m "feat: 用户表单弹窗与行操作（增删改/重置密码/状态开关）"
```

---

### Task 8: 浏览器全链路验证 + 生产构建收尾

**Files:** 无新增（验证任务）

- [ ] **Step 1: 确认后端在运行**

```bash
curl -s http://localhost:9099/health
```

Expected: `{"status":"healthy"}`。若未运行，请用户在 `D:\Desktop\template_project\backend` 启动 `uvicorn app.main:app --port 9099`（按用户习惯，后端进程由用户自己掌控）。

- [ ] **Step 2: 启动前端 dev server（后台）**

```bash
cd D:/Desktop/heroUI
npm run dev
```

Expected: `http://localhost:5173` 可访问。

- [ ] **Step 3: 浏览器验证全链路（用 browser-use MCP 或让用户配合）**

清单：
1. 未登录访问 `/` → 重定向到 `/login`
2. 错误验证码登录 → toast 报错 + 验证码自动刷新
3. `admin / admin123` + 正确验证码 → 登录成功跳首页，显示欢迎语和统计卡
4. 刷新页面 → 登录态保持（localStorage 持久化）
5. 用户管理页：列表有数据、分页可翻、部门下拉有部门树
6. 按账号/手机号搜索 → 结果过滤正确；重置恢复
7. 新增用户（填账号/昵称/密码/部门）→ 列表出现新用户
8. 编辑该用户昵称 → 保存后列表更新
9. 切换该用户状态开关 → 状态变更
10. 重置该用户密码 → 提示成功
11. 删除该用户 → 列表移除
12. 首页服务器监控卡显示 CPU/内存/磁盘数据
13. 退出登录 → 回到登录页，直接访问 `/` 被拦截

同时打开 devtools Network 面板核对 `/user/list` 返回的 rows 字段名与 `SysUserRow` 类型一致（若不一致，修正 `src/types/user.ts` 与相关引用后重新构建）。

- [ ] **Step 4: 生产构建验证**

```bash
npm run build
```

Expected: tsc 无错误、`dist` 产物生成。

- [ ] **Step 5: 收尾提交**

```bash
git add .
git commit -m "chore: 全链路验证通过，最小验证版完成"
```

---

## 自审记录

- **Spec 覆盖**：登录（验证码/表单/getInfo/双 token 刷新/登出）→ Task 2/4；首页（欢迎/统计/监控降级）→ Task 5；用户管理（筛选/部门树/分页列表/增删改/重置密码/状态/按钮权限）→ Task 6/7；错误处理（toast 统一/401/网络异常/监控降级）→ Task 2/5；无单测按 spec 例外说明 → 头部注明。动态菜单/WebSocket/其余模块在 spec「明确不做」内，无任务——符合预期。
- **占位扫描**：全计划无占位/TODO，每个代码步骤含完整代码。
- **类型一致性**：`UserPayload`（camelCase 提交体）与 `SysUserRow`/`CurrentUserInfo`（snake_case 读取体）区分命名；`changeStatus` 因后端 EditUser 校验传全量字段已在 Task 2 处理；`getInfo` 的 snake_case 已在 Task 2 Step 2 注明。
