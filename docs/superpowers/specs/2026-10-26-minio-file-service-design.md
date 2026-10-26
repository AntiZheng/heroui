# MinIO 文件服务设计（文件管理 + 上传下载 API + 可配置）

- 日期：2026-10-26
- 范围：前端 `heroUI`（React 19 + HeroUI v3）与后端 `template_project/backend`（FastAPI + SQLModel）
- 状态：设计已确认，待实施

## 1. 背景与目标

项目已部署 MinIO。当前后端只有本地磁盘上传（`POST /api/v1/upload` 与头像占位接口），前端没有上传 UI。本期建立一套完整的文件服务：

1. 后台「文件管理」：逻辑目录、表格/网格视图、直传上传、断点续传、预览、下载、复制链接、改名/移动、删除。
2. 对外文件服务：API Key 鉴权，支持第三方系统上传、续传、列表、下载、删除；按权限、命名空间、配额隔离。
3. 可配置：MinIO 连接、桶、上传策略、访问策略、API Key 策略均在后台维护，改完即时生效。
4. 头像迁移：用户管理新增头像字段，顶栏展示头像，个人资料弹窗读写 `sys_user`，头像文件存 MinIO。
5. 旧通用上传迁移：保留 `POST /api/v1/upload` 路径与返回结构，内部改为写 MinIO；旧 `/download/{path}` 继续服务历史本地文件。

### 非目标（本期不做）

- 回收站、文件版本、去重/秒传、服务端缩略图、病毒扫描、下载审计日志、限流、CDN 刷新、Office 在线预览。
- 不改动现有参数设置、定时任务等模块的既有行为。

## 2. 关键决策

| 决策点 | 结论 |
|---|---|
| 对外服务 | 本期即做 API Key |
| 可配置项 | MinIO 连接、上传策略、访问策略、API Key 策略 |
| 配置存储 | 独立「存储设置」页 + 单例表；密钥加密、遮蔽 |
| 文件访问 | 双模式：全局默认 + 单文件可选公开/私有 |
| 管理页能力 | 基础管理 + 在线预览 + 逻辑目录（无回收站） |
| 上传链路 | 预签名直传 + S3 分片断点续传（文件服务与开放接口不做后端中转；旧 `/upload` 与头像为兼容/小文件例外） |
| 文件夹 | 逻辑目录（数据库），对象键与目录无关 |
| 桶结构 | 私有桶 + 公开桶 |
| 后台权限 | 完整权限点 + 菜单 F 按钮权限 |
| 页面形态 | 表格 + 网格切换 |
| 菜单位置 | 「系统工具」下新增「文件服务」目录（文件管理 / 存储设置 / API 密钥） |
| 头像 | 用户管理表单头像字段 + 顶栏头像 + 个人资料弹窗；数据读 `sys_user` |
| 旧通用上传 | 保留 `/api/v1/upload` 路径与返回字段，内部改存 MinIO 公开桶并写 `sys_file` |
| S3 客户端 | `boto3`（唯一同时支持预签名分片、ListParts、CompleteMultipartUpload 的方案） |

## 3. 总体架构

```
浏览器后台页 ──JWT + 权限点──┐
                            ├─ FastAPI 文件服务层 ── boto3 ── MinIO
第三方系统 ──API Key────────┘         │
                                     ├─ MySQL：文件 / 目录 / 上传会话 / 存储配置 / API Key
                                     └─ Redis：存储配置缓存（保存即失效）
```

- 后台接口 `/api/v1/system/file|storage|api-key`：JWT + `require_permission`。
- 开放接口 `/api/v1/open/file`：API Key。
- 两类接口共用 service 层。
- 存储配置读取走 Redis 缓存；保存配置后失效缓存。
- MinIO 使用两个 boto3 client：
  - 内部 client（`internal_endpoint`）：HEAD/GET/DELETE/ListParts/Complete/Abort 等后端操作。
  - 公开 client（`public_endpoint`）：生成预签名 URL，确保浏览器/第三方可达。
- boto3 配置：`signature_version='s3v4'`、`s3={'addressing_style': 'path'}`。
- 阻塞的 boto3 调用统一用 `asyncio.to_thread` 包装，避免阻塞事件循环。

## 4. 数据模型

新增 Alembic 迁移 `002_file_service`。所有时间字段沿用 `datetime.now`。

### 4.1 `sys_storage_config`（单例，id=1）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | int PK | 固定 1 |
| internal_endpoint | varchar(255) | 后端访问地址，如 `http://127.0.0.1:9000` |
| public_endpoint | varchar(255) | 浏览器/第三方访问地址，用于生成预签名 URL |
| region | varchar(64) | 默认 `us-east-1` |
| access_key | varchar(128) | MinIO Access Key |
| secret_key_encrypted | text | Fernet 加密后的 Secret Key |
| private_bucket | varchar(64) | 私有桶 |
| public_bucket | varchar(64) | 公开桶 |
| public_base_url | varchar(255) | 可选 CDN/反代基础地址；空则用 `public_endpoint/public_bucket` |
| allowed_origins | text | CORS 允许来源，逗号分隔 |
| max_file_size_mb | int | 默认 1024 |
| multipart_threshold_mb | int | 默认 20 |
| part_size_mb | int | 默认 10 |
| upload_concurrency | int | 前端默认并发，默认 3 |
| upload_session_expire_hours | int | 默认 24 |
| upload_presign_expire_minutes | int | 默认 120 |
| download_presign_expire_seconds | int | 默认 900 |
| default_visibility | varchar(16) | `private` / `public`，默认 `private` |
| allowed_extensions | text | 逗号分隔，空=不限 |
| update_by / update_time | | 审计 |

加密：`Fernet(base64.urlsafe_b64encode(sha256(JWT_SECRET_KEY).digest()))`。更换 JWT secret 后需重新填写 MinIO Secret。

### 4.2 `sys_file_folder`（逻辑目录）

| 字段 | 说明 |
|---|---|
| folder_id PK | |
| parent_id | 0=根 |
| folder_name | 不含 `/`、`\`、.. 等 |
| folder_path | 物化路径，如 `/合同/2026` |
| is_system | 1=系统目录（API Key 命名空间、头像目录、通用上传目录），不可改名/删除 |
| sort | 排序 |
| 审计字段 | create_by/time、update_by/time、remark |

- 同级目录名唯一。
- 删除仅允许空目录；系统目录禁止删除/改名/移动。
- 重命名/移动时同步更新所有后代 `folder_path`（单事务）。
- 系统目录在首次需要时自动创建：`头像`、`通用上传`；API Key 命名空间在创建 Key 时创建。

### 4.3 `sys_file`（文件元数据）

| 字段 | 说明 |
|---|---|
| file_id PK | |
| folder_id | 0=根目录 |
| file_name | 原始文件名，仅入库，不参与对象键 |
| object_key | 服务端生成，如 `2026/10/<uuid>.<ext>` |
| bucket | 实际桶名 |
| visibility | `private` / `public` |
| category | `image/document/video/audio/archive/other` |
| mime_type | |
| file_ext | 小写，不含点 |
| file_size | 字节 |
| etag | S3 ETag |
| source | `admin` / `api` / `avatar` |
| api_key_id | 可空 |
| uploader_id / uploader_name | API 上传时 uploader_id 为空，uploader_name 记 Key 名称 |
| 审计字段 | |

索引：`(folder_id)`、`(file_name)`、`(create_time)`、`(api_key_id)`、`(category)`。

### 4.4 `sys_api_key`（对外凭证）

| 字段 | 说明 |
|---|---|
| key_id PK | |
| key_name | |
| access_key | `ak_` + 随机串，唯一 |
| secret_hash | SHA-256(secret)，不存明文 |
| secret_hint | 末 4 位 |
| scopes | JSON 数组：`upload/download/list/delete` |
| folder_id | 命名空间根目录（系统目录） |
| quota_bytes | 0=不限 |
| used_bytes | 当前占用，删除文件时回退 |
| expires_at | 可空 |
| status | `0` 正常 / `1` 停用 |
| last_used_at / last_used_ip | |
| 审计字段 | |

- 创建 Key 时自动创建系统目录，名称规则 `API-<key_name>-<key_id>`。
- 密钥格式：`ak_xxx.sk_xxx`；创建/重置时返回一次，之后不可查看。
- 删除 Key：Key 立即失效，已上传文件与命名空间目录保留；`sys_file.api_key_id` 允许悬空。

### 4.5 `sys_file_upload`（上传会话）

| 字段 | 说明 |
|---|---|
| session_id | UUID 字符串 PK |
| user_id / api_key_id | 二者取其一 |
| file_name / file_size / mime_type | 初始化时记录 |
| folder_id / visibility | |
| bucket / object_key | |
| mode | `single` / `multipart` |
| upload_id | S3 Multipart UploadId，single 为空 |
| part_size | 字节 |
| status | `pending/uploading/completed/aborted/expired` |
| expires_at | |
| file_id | 完成后关联，可空 |
| create_time / update_time | |

索引：`(user_id, status)`、`(api_key_id, status)`、`(expires_at)`。

## 5. 权限与菜单

### 5.1 权限点

- `file:list`、`file:upload`、`file:download`、`file:edit`、`file:delete`
- `file:config`（存储设置）
- `file:key:list`、`file:key:add`、`file:key:edit`、`file:key:delete`、`file:key:reset`

管理员角色 `*:*:*` 直通（现有 `require_permission` 行为）。普通角色需在角色管理勾选对应菜单权限。

### 5.2 菜单（系统工具下）

目录：**文件服务**（M）

| 菜单 | 类型 | 权限 | 组件注册键 |
|---|---|---|---|
| 文件管理 | C | `file:list` | `file/index` |
| 存储设置 | C | `file:config` | `file/storage` |
| API 密钥 | C | `file:key:list` | `file/api-key` |

F 按钮权限：

- 文件管理：上传 `file:upload`、下载 `file:download`、编辑 `file:edit`、删除 `file:delete`
- 存储设置：保存 `file:config`、测试/初始化复用 `file:config`
- API 密钥：新增 `file:key:add`、编辑 `file:key:edit`、删除 `file:key:delete`、重置 `file:key:reset`

图标：在 `menuIcons.ts` 增加文件夹、硬盘、钥匙图标。

## 6. 接口契约

统一返回现有 `R.ok` / `R.page`（HTTP 200 + `code`）；上传/下载到 MinIO 的请求由客户端直接完成。

### 6.1 后台文件 `/api/v1/system/file`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/list` | file:list | 分页：`pageNum/pageSize/folderId/fileName/category/visibility/source/beginTime/endTime` |
| GET | `/folders` | file:list | 返回全部目录（folderId、parentId、folderName、folderPath、isSystem、sort） |
| POST | `/folder` | file:edit | 新建目录 `{parentId, folderName}` |
| PUT | `/folder/{id}` | file:edit | 重命名/移动 `{folderName?, parentId?}` |
| DELETE | `/folder/{ids}` | file:delete | 仅空目录；系统目录拒绝 |
| POST | `/upload/sessions` | file:upload | 初始化上传 |
| POST | `/avatar` | file:upload | 用户管理表单头像上传：≤2MB 图片，写公开桶，返回 URL |
| GET | `/upload/sessions/{id}` | file:upload | 会话状态 + 已上传分片（ListParts） |
| POST | `/upload/sessions/{id}/part-urls` | file:upload | 批量获取缺失分片的预签名 URL（≤20 个/次） |
| POST | `/upload/sessions/{id}/complete` | file:upload | 提交分片 ETag，合并、校验、入库 |
| DELETE | `/upload/sessions/{id}` | file:upload | 放弃上传：abort、清理对象 |
| GET | `/upload/sessions?status=active` | file:upload | 当前用户未完成会话 |
| PUT | `/{id}` | file:edit | 重命名/移动（只改数据库） |
| DELETE | `/{ids}` | file:delete | 单条/批量删除（MinIO + 元数据） |
| POST | `/urls` | file:download | 批量换预览/下载链接 `{fileIds, download?}` |
| GET | `/{id}/text` | file:download | 文本预览，最多 256KB |
| GET | `/{id}/download` | file:download | 302 到公开直链或预签名下载链接 |

**列表行字段**：`fileId/fileName/folderId/folderPath/category/mimeType/visibility/source/apiKeyId/apiKeyName/uploaderName/fileSize/createTime`。列表不批量生成 URL。

**初始化上传请求**：

```json
{
  "fileName": "合同.pdf",
  "fileSize": 73400320,
  "mimeType": "application/pdf",
  "folderId": 12,
  "visibility": "private"
}
```

**初始化响应**：

```json
{
  "sessionId": "uuid",
  "mode": "single|multipart",
  "partSize": 10485760,
  "partCount": 7,
  "uploadUrl": "仅 single 模式",
  "method": "PUT",
  "headers": {"Content-Type": "application/pdf"},
  "expiresAt": "2026-10-27T12:00:00"
}
```

- single：返回一个预签名 PUT URL。
- multipart：不一次性返回全部分片 URL；客户端按需调用 `part-urls` 获取，避免大文件响应过大。
- 初始化校验：大小上限、后缀/MIME 白名单、目录存在、配额（API Key）。

**完成请求**：

```json
{"parts": [{"partNumber": 1, "etag": "\"...\""}]}
```

single 模式可省略 parts；后端以 `HEAD` 结果为准。

**URL 批量响应**：

```json
[{"fileId": 1, "url": "https://...", "isPublic": false, "expiresAt": "..."}]
```

### 6.2 存储设置 `/api/v1/system/storage`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/config` | file:config | 返回配置；Secret 只返回 `hasSecret` 与 `secretHint` |
| PUT | `/config` | file:config | 保存；secretKey 留空=不修改；失效缓存 |
| POST | `/test` | file:config | 可用表单值测试：内部连通、桶存在、公开地址可达；返回分项结果 |
| POST | `/init` | file:config | 创建两个桶、公开桶匿名只读策略、两桶 CORS |

未配置存储时，上传、预览、初始化接口返回明确业务错误；目录管理不受影响，设置页给出“请先配置并测试连接”的空态引导。

### 6.3 API Key `/api/v1/system/api-key`

| 方法 | 路径 | 权限 | 说明 |
|---|---|---|---|
| GET | `/list` | file:key:list | 分页，返回用量/配额/最后使用 |
| POST | `""` | file:key:add | 创建；返回一次性完整密钥 |
| PUT | `""` | file:key:edit | 改名称/权限/配额/过期/状态 |
| POST | `/{id}/reset` | file:key:reset | 重置密钥；返回一次性完整密钥 |
| DELETE | `/{ids}` | file:key:delete | 删除 Key；文件保留 |

### 6.4 开放接口 `/api/v1/open/file`

鉴权：`Authorization: Bearer ak_xxx.sk_xxx`。

| 方法 | 路径 | scope | 说明 |
|---|---|---|---|
| POST | `/upload/sessions` | upload | 初始化；可带 `folderPath`、`visibility` |
| GET | `/upload/sessions?status=active` | upload | 当前 Key 未完成会话 |
| GET | `/upload/sessions/{id}` | upload | 会话状态 + 已上传分片 |
| POST | `/upload/sessions/{id}/part-urls` | upload | 获取分片 URL |
| POST | `/upload/sessions/{id}/complete` | upload | 完成入库 |
| DELETE | `/upload/sessions/{id}` | upload | 放弃 |
| GET | `/list` | list | 仅命名空间内；支持 `folderPath/fileName/pageNum/pageSize` |
| GET | `/{id}` | list | 元数据 + 下载 URL |
| GET | `/{id}/download` | download | 302 到公开直链/预签名 |
| DELETE | `/{id}` | delete | 删除文件并回退用量 |

- `folderPath` 只允许在 Key 命名空间内自动创建子目录，禁止跳出。
- 额度：初始化预检、完成复核；删除回退 `used_bytes`。
- 每次调用校验状态、过期、scope；更新 `last_used_at/ip`。

## 7. 上传 / 下载流程

### 7.1 上传时序

1. 客户端调 `POST /upload/sessions`。
2. 后端校验大小/后缀/MIME/目录/配额。
3. 小文件（≤ 阈值）：创建 single 会话，生成预签名 PUT。
4. 大文件：`CreateMultipartUpload`，记录 `upload_id`，按 `part_size` 计算分片数。
5. 客户端按需获取分片 URL，直接 PUT 到 MinIO；记录每片 ETag；并发默认 3。
6. 暂停：中止在途请求，保留会话；继续：查询 `ListParts`，只补缺失分片。
7. 完成：multipart 先 `CompleteMultipartUpload`，再 `HEAD` 校验大小/Content-Type；single 直接 `HEAD`。
8. 写 `sys_file`、更新 Key 用量（同一事务）；若入库失败，删除刚上传对象。
9. 返回文件元数据、访问 URL、过期时间。

### 7.2 断点续传

- 页面刷新/重新登录后，前端拉 `GET /upload/sessions?status=active`（后台）或 `GET /upload/sessions/{id}`（开放接口）。
- 后端 `ListParts` 返回已上传分片，前端跳过。
- 会话过期后由定时任务 abort；前端提示重新上传。
- 分片 ETag 由 MinIO 响应头返回，CORS 必须暴露 `ETag`。

### 7.3 下载 / 预览

- 公开文件：`public_base_url` 或 `public_endpoint/public_bucket/object_key` 永久直链。
- 私有文件：预签名 GET，默认 15 分钟；下载带 `response-content-disposition=attachment`。
- 后台预览：图片/PDF/音视频用 URL；文本走 `/{id}/text`（后端读取前 256KB，避免 CORS）。
- 批量 URL：表格/网格预览用 `POST /urls`，只给当前页图片取缩略链接。

### 7.4 旧通用上传与头像迁移

- `POST /api/v1/upload`：保留路径、登录要求与返回字段 `fileName/url/newFileName/originalFilename`；内部改为后端中转写公开桶 + `sys_file`（`source='admin'`、系统目录「通用上传」、`visibility='public'`），返回公开直链。
- 历史本地文件仍保留在 `uploads/`，旧 `GET /api/v1/download/{path}` 继续服务；新上传不再写本地磁盘。
- 头像上传为后端中转（图片≤2MB），写公开桶 + `sys_file`（`source='avatar'`、系统目录「头像」）。
- 头像不进入 API Key 配额统计；通用上传仍按普通后台文件计入文件管理列表。

## 8. 前端设计

### 8.1 文件管理页

- 骨架沿用现有表格页：搜索行 → 标题/操作行 → 内容卡片 → 分页；标题行按钮顺序：上传（accent-soft）、新建文件夹（secondary）、批量删除（danger-soft）、列设置。
- 搜索：文件名、类型（图片/文档/视频/音频/压缩包/其他）、可见性、来源（后台/API）、时间范围。
- 面包屑 + 当前目录；文件夹行置顶，双击进入；支持重命名、移动、删除（空目录）。
- 表格视图：名称（缩略图/图标）、类型、大小、可见性 Chip、来源/上传者、创建时间、操作；沿用粘性表头、固定操作列、列设置、行选择、批量删除、PageSizeStepper。
- 网格视图：当前页卡片（缩略图、名称、大小、可见性角标、hover 操作）；与表格共用搜索/筛选/分页状态；右上角切换表格/网格。
- 行操作：预览、下载、复制链接、重命名、移动、删除。
  - 公开文件复制永久直链；私有文件复制签名链接并提示过期时间。
- 上传 Drawer：
  - 多选/拖拽，选择目标目录与可见性。
  - 每个任务显示进度、速度、状态；暂停、继续、取消、重试、全部暂停/继续。
  - 关闭 Drawer 不取消任务；页面刷新后从 active 会话恢复。
  - 小文件单 PUT，大文件分片，并发读配置（默认 3）。
- 预览弹窗：图片适应窗口、PDF iframe、文本 `pre`、音视频原生播放器；不支持类型提供下载。
- 删除：AlertDialog/批量删除弹窗，明确“同时删除 MinIO 对象，不可恢复”。

### 8.2 存储设置页

- 单页分区：连接 → 桶 → 上传策略 → 访问与 CORS。
- 连接：内部地址、公开地址、Region、Access Key、Secret Key（末 4 位、留空不改）、测试连接。
- 桶：私有桶、公开桶、公开基础地址、初始化桶（确认后执行）。
- 上传：单文件上限、分片阈值、分片大小、并发、默认可见性、允许后缀。
- 访问：下载签名有效期、上传会话有效期、上传签名有效期、允许来源。
- 测试/初始化结果用 success/danger 状态行展示。

### 8.3 API 密钥页

- 表格：名称、Access Key（遮蔽+复制）、权限 Chip、命名空间、配额用量进度、状态开关、过期时间、最后使用、操作。
- 新建弹窗：名称、权限勾选、命名空间名称、配额、过期时间。
- 创建/重置成功后弹一次性密钥：完整密钥 + 复制 + “仅显示一次”。
- 删除确认：文件保留、Key 立即失效。
- 状态开关、重置、删除均按权限点控制。

### 8.4 头像与个人资料

- 顶栏头像读取 `user.avatar`，无头像回退字母头像。
- 头像下拉新增「个人资料」：弹窗展示/编辑头像、昵称、手机、邮箱；头像上传走 MinIO（公开桶），保存后刷新全局用户信息。
- 用户管理表单新增头像字段：上传/预览/清除；列表增加可选头像列（默认隐藏，列设置可开）。
- 后端新增：
  - `POST /api/v1/system/user/profile/avatar`：本人头像上传（登录即可，≤2MB 图片），写公开文件并更新 `sys_user.avatar`。
  - `PUT /api/v1/system/user/profile/info`：本人更新 `nickName/email/phonenumber/avatar`。
  - 用户管理表单头像使用 `POST /api/v1/system/file/avatar`（`file:upload`），返回公开 URL 后随用户表单保存；也可由管理员直接填写已有公开文件 URL。
- 头像文件记录为 `source='avatar'`，放入系统目录「头像」，可见性强制 public，最大 2MB。

### 8.5 前端代码落点

- 新增：`src/types/file.ts`、`storage.ts`、`apiKey.ts`；`src/api/file.ts`、`storage.ts`、`apiKey.ts`、`profile.ts`。
- 新增页面：`src/pages/file/index.tsx`、`storage.tsx`、`api-key.tsx`；文件页子组件：上传 Drawer、预览弹窗、目录弹窗、移动弹窗、表格/网格视图。
- 路由：`menuRegistry` 增加 `file/index`、`file/storage`、`file/api-key`。
- 布局：`AppShell` 头像展示与个人资料弹窗；`menuIcons` 增加图标。
- 用户页：`UserFormModal` 头像字段；列表可选头像列。
- 权限：使用现有 `can()` 控制按钮；菜单由 `getRouters` 动态返回。

## 9. 默认配置

| 项 | 默认 |
|---|---|
| 单文件上限 | 1024 MB |
| 分片阈值 / 分片大小 | 20 MB / 10 MB |
| 分片并发 | 3 |
| 上传会话有效期 | 24 小时 |
| 上传分片签名有效期 | 120 分钟 |
| 下载签名有效期 | 900 秒 |
| 默认可见性 | private |
| 允许后缀 | 空=不限 |
| CORS 允许来源 | 开发 `http://localhost:5173,http://127.0.0.1:5173`，生产在设置页追加 |

## 10. 安全与一致性

- MinIO Secret Fernet 加密入库；页面只回显末 4 位。
- API Key 只存 SHA-256 哈希；常数时间比较；创建/重置一次性返回明文。
- 对象键全部服务端生成；文件名只入库；目录名过滤 `/`、`\`、`..`。
- 上传前校验后缀/MIME/大小；完成后 HEAD 复核。
- 私有桶无匿名策略；公开桶仅匿名 GetObject。
- 删除：MinIO 成功后再删元数据；批量删除逐条汇总；删除 `source='api'` 的文件时，若 Key 仍存在则回退其 `used_bytes`。
- 完成上传：对象成功后再写库；写库失败删除对象。
- 配额：初始化预检 + 完成复核；并发上传可能轻微超出，提示用户；编辑 Key 时配额不得低于已用量（0=不限除外）。
- 存储配置缓存 Redis，保存后删除缓存；不存在时读库并回填。
- 头像上传限制图片类型，最大 2MB，不计入 API Key 配额。
- 删除 API Key 时将其未完成上传会话标记过期，由清理任务 abort；已上传文件保留。
- MinIO 不可用或未配置时返回明确错误，不留下半条文件记录；已完成对象按失败处理回滚。

## 11. 部署要求

- MinIO 两个桶（可由「初始化桶」创建）。
- 浏览器/第三方必须能访问 `public_endpoint`；否则直传与预览失败。
- CORS：允许后台域名；方法 `GET/PUT/HEAD/POST`；请求头 `*`；**ExposeHeaders 必须含 `ETag`**；两桶都要配。
- 预签名 URL 对 Host/Path 敏感：对外建议独立子域或独立端口（如 `minio.example.com`）；避免会改写路径的 `/minio` 子路径反代。
- 后台 HTTPS 时 MinIO 也需 HTTPS，避免混合内容。
- Nginx 反代到 MinIO：`proxy_request_buffering off`、`client_max_body_size` 足够大、支持 Range。
- MinIO 版本需支持 S3 Multipart 与 bucket CORS；若 bucket CORS 不生效，使用 `mc admin config set api cors_allow_origin=...` 作为兜底。

## 12. 实施顺序

1. 后端依赖：`pyproject.toml` 增加 `boto3`，更新 `uv.lock`。
2. 数据层：5 个模型 + Alembic 002。
3. 基础能力：加密工具、存储配置缓存、boto3 client 工厂。
4. 服务层：目录、文件、上传会话、API Key、存储配置、头像。
5. 接口层：后台文件、存储设置、API Key、开放接口、头像/个人资料、旧 `/upload` 迁移。
6. 权限：菜单/F 按钮种子 SQL（挂系统工具），路由注册。
7. 清理任务：`fileUploadCleanup`，启动时加入 APScheduler 每小时执行。
8. 前端：类型/API → 路由/图标 → 文件管理页与上传恢复 → 存储设置 → API Key → 头像/个人资料 → 用户管理头像 → 权限控制。
9. 验证与修复。

## 13. 验收标准

- 页面可完成：建目录、拖拽/多选上传、暂停继续、刷新后续传、预览、下载、复制链接、改名/移动、单条/批量删除。
- 小文件单 PUT；超过阈值自动分片；断网/刷新后只补缺失分片。
- 公开文件永久直链；私有文件签名链接有有效期；私有桶匿名访问失败。
- 存储设置可测试连接、初始化桶、保存即时生效；Secret 不回显。
- API Key 按权限/命名空间/配额工作；越权、过期、超配额被拒绝；删除 Key 立即失效。
- 头像在顶栏、个人资料、用户管理三处正常读写，数据来自 `sys_user`。
- 旧 `/api/v1/upload` 返回 MinIO 公开直链，旧本地下载路径仍可访问历史文件；新上传不写本地磁盘。
- 普通角色未授权看不到菜单/按钮，直接调接口返回无权限。
- 前端 `tsc --noEmit && vite build` 通过；后端可导入、Alembic 迁移成功。

## 14. 风险与假设

- MinIO 可达性与 CORS 需部署侧配合；页面只能验证后端连通，浏览器连通性需实际测试。
- boto3 与目标 MinIO 版本兼容性需在实施时用测试连接确认。
- 大文件在浏览器侧通过 Blob.slice 分片，内存占用可控；超长会话依赖定时清理。
- 更换 JWT secret 会导致已存 MinIO Secret 无法解密，需要在设置页重填。
