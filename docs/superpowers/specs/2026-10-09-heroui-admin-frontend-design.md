# HeroUI 管理前端（最小验证版）设计文档

日期：2026-10-09
状态：已与用户确认

## 背景与目标

为后端项目 `D:\Desktop\template_project\backend`（FastAPI 兼容若依的 admin-api，API 前缀 `/api/v1`，JWT 认证，统一 `R` 响应格式）开发 React + HeroUI 前端。前端项目建在 `D:\Desktop\heroUI`。

第一版为**最小验证版**：打通「登录 → 首页 → 用户管理」全链路，验证 HeroUI 与后端对接，界面走**全新设计方向**（不锚定若依原版布局）。后续再扩展到全部若依模块。

## 技术栈

| 用途 | 选型 |
|------|------|
| 构建工具 | Vite |
| 框架 | React 19 + TypeScript |
| UI 组件库 | HeroUI（开源版 `@heroui/react`）+ Tailwind CSS |
| 路由 | React Router |
| 服务端状态 | TanStack Query |
| HTTP | axios |
| 客户端状态 | zustand（登录态持久化 localStorage） |

后端联调：开发环境 Vite proxy 将 `/api` 转发到 `http://localhost:9099`，前端 baseURL 统一为 `/api/v1`；生产环境由 nginx 反代，不写死后端地址。

图表库本版不引入；后续需要时用 VChart（用户既定偏好）。

## 目录结构

```
heroUI/
├── src/
│   ├── api/                # 接口层：request.ts(axios封装) + auth.ts + user.ts
│   ├── stores/             # zustand：auth store(token/user/permissions)
│   ├── pages/
│   │   ├── login/          # 登录页
│   │   ├── home/           # 首页仪表盘
│   │   └── system/user/    # 用户管理
│   ├── components/layout/  # 应用外壳（导航+内容区，全新设计）
│   ├── router/             # 路由定义 + 路由守卫
│   ├── types/              # R 响应、实体等 TS 类型
│   └── theme/              # HeroUI 主题定制（视觉令牌）
└── vite.config.ts
```

## 认证与数据流

- **axios 封装**（`src/api/request.ts`）：
  - 请求拦截器：自动附加 `Authorization: Bearer <token>`
  - 响应拦截器：统一解包 `R` 格式（`code=200` 返回 `data`，非 200 toast 提示 `msg` 并 reject）；`401` 清登录态跳登录页
  - 登录/注册接口为 `application/x-www-form-urlencoded` 表单提交，在接口层单独处理
- **登录流程**：
  1. 登录页加载时调 `GET /api/v1/captchaImage`，返回 `{ uuid, img(base64 dataURL), captchaEnabled }`
  2. 用户提交账号/密码/验证码 → `POST /api/v1/login`（form 表单：`username, password, code, uuid`）
  3. 成功后 token 存 zustand（persist 到 localStorage），跳转首页
- **用户信息**：登录后调 `GET /api/v1/getInfo` 缓存 `user / roles / permissions`；用户管理页用 `system:user:*` 权限标识控制按钮显隐
- **Token 刷新**：`POST /api/v1/refresh`（body: `refresh_token`），登录返回双 token；axios 拦截器处理 access token 过期后的静默刷新
- **动态菜单取舍**：第一版菜单为**静态定义**（首页、用户管理），路由守卫仅校验登录态与 `getInfo`；`getRouters` 动态菜单树解析留到第二版
- **退出登录**：`POST /api/v1/logout`，成功后清本地登录态

## 页面设计（全新设计方向）

### 登录页
- 不锚定若依原版；候选形式：左右分栏（品牌视觉区 + 表单区）或居中卡片，实现时定稿
- 表单校验：必填；验证码图可点击刷新

### 首页
- 欢迎区：当前用户昵称 + 时间问候
- 统计卡片：用户总数（取 `GET /user/list?page_num=1&page_size=1` 返回的 `total` 字段）
- 服务器信息卡：`GET /system/server` 的 CPU/内存等，失败时降级隐藏，不阻塞页面
- 不引入图表库

### 用户管理
- 筛选区：账号/手机号/状态 + 部门树（`GET /user/deptTree`，返回 `{id,label,parentId,children}` 树）
- 列表：HeroUI Table + 分页（`GET /user/list` 返回 `R.page`：`rows/total/page_num/page_size`）
- 操作：
  - 新增/编辑：Modal 表单（部门树、岗位、昵称、账号、密码、手机、状态）→ `POST /api/v1/user` / `PUT /api/v1/user`
  - 删除：支持多选，`DELETE /api/v1/user/{user_ids}`（逗号分隔）
  - 重置密码：`PUT /api/v1/user/resetPwd`
  - 启停状态：`PUT /api/v1/user/changeStatus`
- 按钮级权限：依据 `permissions` 数组（如 `system:user:add`）

## 错误处理

- 表单：HeroUI Input 校验态 + 提交前校验（必填、手机号格式、两次密码一致）
- 接口错误：拦截器统一 toast 后端 `msg`；验证码错误自动刷新验证码
- 401：清 token 跳登录页；网络错误提示"网络异常"
- 首页监控接口失败仅隐藏对应卡片

## 测试策略

最小验证版以浏览器手工验证为主：起 dev server，实测登录 → 用户增删改查 → 退出全链路。不写单测；第二版全模块开发时引入 Vitest。

## 明确不做（本版范围外）

- 其余若依模块（角色/菜单/部门/岗位/字典/配置/公告/定时任务/日志/在线用户/缓存监控）
- `getRouters` 动态菜单渲染
- WebSocket 实时通知
- 单元测试
