# MinIO 文件服务实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为已部署的 MinIO 建立完整的文件服务：后台文件管理（目录/表格/网格/直传/断点续传/预览/下载）、对外开放 API（API Key 鉴权 + 配额/命名空间/续传）、存储设置页、API 密钥页、头像与个人资料闭环、旧 `/api/v1/upload` 迁移。

**Architecture:** 后端 FastAPI + boto3（s3v4 + path addressing）双 client（internal 操作 / public 预签名），5 张新表（存储配置/目录/文件/密钥/上传会话）+ Alembic 002；上传为预签名直传 + S3 Multipart 断点续传，会话落 MySQL；开放接口与后台接口共用 service 层。前端 React 19 + HeroUI v3，沿用现有表格页骨架与弹窗体系，上传用 XHR 直传 MinIO 并由前端任务队列管理并发/暂停/续传。

**Tech Stack:** FastAPI、SQLModel、SQLAlchemy async、MySQL、Redis、APScheduler、boto3、cryptography(Fernet)；React 19、HeroUI v3、Tailwind v4、TanStack Query、TypeScript。

**Spec:** `docs/superpowers/specs/2026-10-26-minio-file-service-design.md`（实现时先读该文件，本计划以其为准绳）

## Global Constraints

- **仓库边界**：后端在 `D:\Desktop\template_project\backend`（独立 git 仓库），前端在 `D:\Desktop\heroUI`。**后端仓库未经用户点名不得 git commit**，每个后端任务只做 `git status` 记录变更文件；前端仓库同样默认不提交，仅在用户明确要求时提交（历史身份用临时环境变量 `GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local`，勿改 config）。
- **前端 WIP 禁动**：`src/components/editor/RichTextEditor.tsx`、`src/index.css` 为用户未提交修改，`pnpm-lock.yaml` 未跟踪——任何任务不得覆盖或提交这三个文件。
- **响应大小写约定**：请求体一律 camelCase（后端请求模型继承 `CamelModel`）；响应行/实体一律 snake_case（与现有 `R.page` + ORM 行一致）。前端行类型字段用 snake_case，请求 payload 用 camelCase。
- **上传链路**：文件服务与开放接口一律预签名直传 MinIO，不做后端中转；仅头像（≤2MB 图片）与旧 `POST /api/v1/upload` 为后端中转例外。
- **默认配置**：单文件 1024MB、分片阈值 20MB、分片 10MB、并发 3、会话 24h、上传签名 120min、下载签名 900s、默认可见性 private、允许后缀空=不限。
- **权限**：后端写接口全部挂 `require_permission`（`app/api/deps.py` 现成），权限点 `file:list/upload/download/edit/delete/config`、`file:key:list/add/edit/delete/reset`；管理员 `*:*:*` 直通。前端按钮用 `hasPermission()`（`src/stores/auth.ts`）。
- **迁移执行**：`alembic upgrade head` 影响真实数据库，执行前提示用户确认/备份；本计划中该步骤标注「需用户确认」。
- **dev server**：前后端服务均由用户手动重启；agent 不代跑 dev server。
- **验证方式**：后端验证用 `uv run python -m compileall app` + 纯函数 pytest（`--confcutdir=tests/unit` 避开缺 aiosqlite 的根 conftest）；前端验证用 `npx tsc --noEmit`；UI 视觉留给用户手验。
- **UI 规范**（与全站一致）：表格页骨架=搜索行→标题行→TableRoot 卡片→分页；按钮 size sm、图标 12px；软色按钮语义（新增/上传 accent-soft、次要 secondary、批量删除 danger-soft、取消类 tertiary）；弹窗用 FormModal/FormSection、分组软色 Chip、字段标签 12px、标题 18px；避免卡中卡；chrome 字号 12px、表格内容 14px。

---

## 文件结构

### 后端（`D:\Desktop\template_project\backend`）

```
app/
├── core/crypto.py                    # 新建：Fernet 加解密（密钥由 JWT secret 派生）
├── utils/file_utils.py               # 新建：纯函数（对象键/分类/路径/密钥哈希等）
├── utils/minio.py                    # 新建：boto3 client 工厂 + 预签名/CORS/策略
├── models/file.py                    # 新建：SysStorageConfig/SysFileFolder/SysFile/SysApiKey/SysFileUpload
├── models/__init__.py                # 修改：导出新模型
├── models/user.py                    # 修改：avatar 长度 100→500
├── core/constants.py                 # 修改：RedisKey.STORAGE_CONFIG
├── schemas/file.py                   # 新建：文件/目录/上传会话请求模型
├── schemas/storage.py                # 新建：存储配置请求模型
├── schemas/api_key.py                # 新建：API Key 请求模型
├── schemas/user.py                   # 修改：ProfileUpdate
├── repositories/storage.py           # 新建
├── repositories/file.py              # 新建：目录/文件/上传会话
├── repositories/api_key.py           # 新建
├── services/storage.py               # 新建：配置缓存/测试连接/初始化桶
├── services/folder.py                # 新建：目录 CRUD + 子树路径刷新
├── services/file.py                  # 新建：列表/删除/URL/文本 + 小文件中转（头像/旧上传）
├── services/upload.py                # 新建：上传会话（init/status/part-urls/complete/abort）
├── services/api_key.py               # 新建
├── api/v1/storage.py                 # 新建：/system/storage
├── api/v1/file.py                    # 新建：/system/file
├── api/v1/api_key.py                 # 新建：/system/api-key
├── api/v1/open_file.py               # 新建：/open/file
├── api/open_deps.py                  # 新建：API Key 鉴权依赖
├── api/v1/user.py                    # 修改：profile/avatar 真实上传 + profile/info
├── api/v1/common.py                  # 修改：/upload 迁 MinIO
├── api/v1/router.py                  # 修改：注册 4 个新路由
├── tasks/file_cleanup.py             # 新建：fileUploadCleanup
├── tasks/scheduler.py                # 修改：init_scheduler 挂每小时 interval job
alembic/versions/002_file_service.py  # 新建
sql/menu_file_service.sql             # 新建
tests/unit/test_file_utils.py         # 新建（避开根 conftest）
```

### 前端（`D:\Desktop\heroUI`）

```
src/
├── types/file.ts / storage.ts / apiKey.ts   # 新建
├── api/file.ts / storage.ts / apiKey.ts / profile.ts  # 新建
├── lib/uploadManager.ts                     # 新建：上传任务队列（XHR 直传/分片/暂停/续传）
├── components/ColumnSettings.tsx            # 修改：useColPrefs 增加 defaultHiddenKeys
├── components/layout/menuIcons.ts           # 修改：file/storage/key 图标
├── router/menuRegistry.tsx                  # 修改：file/index、file/storage、file/api-key
├── components/layout/AppShell.tsx           # 修改：头像图片 + 个人资料入口
├── components/ProfileModal.tsx              # 新建：个人资料弹窗
├── pages/file/index.tsx                     # 新建：文件管理页（表格视图）
├── pages/file/fileUtils.tsx                 # 新建：图标/大小格式化/Chip
├── pages/file/FileDialogs.tsx               # 新建：目录/改名/移动/删除/预览弹窗
├── pages/file/UploadDrawer.tsx              # 新建：上传抽屉 + 断点恢复
├── pages/file/FileGrid.tsx                  # 新建：网格视图
├── pages/file/storage.tsx                   # 新建：存储设置页
├── pages/file/api-key.tsx                   # 新建：API 密钥页
└── pages/system/user/{index,UserFormModal}.tsx  # 修改：头像字段/列
```

---

# 后端任务

### Task B1: 依赖 + 加密工具 + 纯函数工具 + 单测

**Files:**
- Modify: `D:\Desktop\template_project\backend\pyproject.toml`
- Create: `app/core/crypto.py`
- Create: `app/utils/file_utils.py`
- Create: `tests/unit/test_file_utils.py`

**Interfaces:**
- Produces（后续所有任务依赖）:
  - `crypto.encrypt_secret(plain: str) -> str`、`crypto.decrypt_secret(token: str) -> str`
  - `file_utils.sha256_hex / hash_api_secret / generate_access_key / generate_secret_key / mask_secret / split_api_key`
  - `file_utils.file_ext_of / category_of / build_object_key / normalize_folder_name / join_folder_path / normalize_relative_path / part_count / is_allowed_ext`

- [ ] **Step 1: 加依赖**

`pyproject.toml` 的 `dependencies` 列表追加一行（保持字母序无关，放在 `cryptography` 之后）：

```toml
    "boto3>=1.35",
```

然后执行（用户环境装依赖，命令可代跑）：

```bash
cd D:/Desktop/template_project/backend && uv lock && uv sync
```

- [ ] **Step 2: 写失败测试** `tests/unit/test_file_utils.py`

```python
"""文件服务纯函数单测（独立运行，不依赖 DB）"""
from datetime import datetime

import pytest

from app.utils.file_utils import (
    build_object_key, category_of, file_ext_of, generate_access_key,
    generate_secret_key, hash_api_secret, is_allowed_ext, join_folder_path,
    mask_secret, normalize_folder_name, normalize_relative_path, part_count,
    split_api_key,
)


def test_file_ext_and_category():
    assert file_ext_of("报告.PDF") == "pdf"
    assert file_ext_of("noext") == ""
    assert category_of("a.png") == "image"
    assert category_of("a.mp4") == "video"
    assert category_of("a.mp3") == "audio"
    assert category_of("a.zip") == "archive"
    assert category_of("a.pdf") == "document"
    assert category_of("a.bin") == "other"
    assert category_of("x", "image/webp") == "image"


def test_object_key_shape():
    key = build_object_key("合同.pdf", datetime(2026, 10, 26, 12, 0, 0))
    assert key.startswith("2026/10/") and key.endswith(".pdf")
    assert "/" not in key.split("2026/10/")[1].rsplit(".pdf")[0]  # 无路径段


def test_folder_name_validation():
    assert normalize_folder_name(" 合同 ") == "合同"
    for bad in ["", "..", ".", "a/b", "a\\b"]:
        with pytest.raises(ValueError):
            normalize_folder_name(bad)


def test_paths():
    assert join_folder_path("", "API-demo") == "/API-demo"
    assert join_folder_path("/API-demo", "2026") == "/API-demo/2026"
    assert normalize_relative_path("/API-demo/2026/") == ["API-demo", "2026"]
    with pytest.raises(ValueError):
        normalize_relative_path("../etc")
    with pytest.raises(ValueError):
        normalize_relative_path("a//b")


def test_part_count():
    assert part_count(0, 10) == 1
    assert part_count(25, 10) == 3
    assert part_count(10, 10) == 1


def test_api_key_secrets():
    ak, sk = generate_access_key(), generate_secret_key()
    assert ak.startswith("ak_") and sk.startswith("sk_")
    assert len(ak) > 10 and len(sk) > 30
    assert mask_secret("sk_abcdefgh") == "efgh"
    assert hash_api_secret("s") == hash_api_secret("s")
    access, secret = split_api_key(f"{ak}.{sk}")
    assert (access, secret) == (ak, sk)
    with pytest.raises(ValueError):
        split_api_key("ak_only")
    assert is_allowed_ext("a.PDF", "pdf, doc") is True
    assert is_allowed_ext("a.exe", "pdf") is False
    assert is_allowed_ext("a.exe", "") is True
```

- [ ] **Step 3: 跑测试确认失败**

```bash
cd D:/Desktop/template_project/backend && uv run pytest tests/unit/test_file_utils.py --confcutdir=tests/unit -q
```
预期：FAIL（ModuleNotFoundError: app.utils.file_utils）。

- [ ] **Step 4: 实现** `app/utils/file_utils.py`

```python
"""文件服务纯函数工具（不依赖 boto3 / DB，便于单测）"""
import hashlib
import secrets
import uuid
from datetime import datetime

IMAGE_EXTS = {"jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"}
DOCUMENT_EXTS = {"pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "md",
                 "csv", "json", "xml", "html", "htm", "log"}
VIDEO_EXTS = {"mp4", "webm", "mov", "avi", "mkv", "flv", "m4v"}
AUDIO_EXTS = {"mp3", "wav", "ogg", "flac", "aac", "m4a"}
ARCHIVE_EXTS = {"zip", "rar", "7z", "tar", "gz", "bz2", "xz"}


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def hash_api_secret(secret: str) -> str:
    return sha256_hex(secret)


def generate_access_key() -> str:
    return "ak_" + secrets.token_hex(12)


def generate_secret_key() -> str:
    return "sk_" + secrets.token_urlsafe(32)


def mask_secret(secret: str) -> str:
    return secret[-4:] if len(secret) >= 4 else secret


def split_api_key(raw: str) -> tuple[str, str]:
    if "." not in raw:
        raise ValueError("API Key 格式错误")
    access_key, secret = raw.split(".", 1)
    if not access_key.startswith("ak_") or not secret.startswith("sk_"):
        raise ValueError("API Key 格式错误")
    return access_key, secret


def file_ext_of(filename: str) -> str:
    name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    if "." not in name:
        return ""
    return name.rsplit(".", 1)[-1].lower()[:32]


def category_of(filename: str, mime_type: str = "") -> str:
    ext = file_ext_of(filename)
    mime = (mime_type or "").lower()
    if ext in IMAGE_EXTS or mime.startswith("image/"):
        return "image"
    if ext in VIDEO_EXTS or mime.startswith("video/"):
        return "video"
    if ext in AUDIO_EXTS or mime.startswith("audio/"):
        return "audio"
    if ext in ARCHIVE_EXTS:
        return "archive"
    if ext in DOCUMENT_EXTS or mime.startswith("text/") or "pdf" in mime:
        return "document"
    return "other"


def build_object_key(filename: str, now: datetime | None = None) -> str:
    now = now or datetime.now()
    ext = file_ext_of(filename)
    return f"{now:%Y/%m}/{uuid.uuid4().hex}{f'.{ext}' if ext else ''}"


def normalize_folder_name(name: str) -> str:
    value = (name or "").strip()
    if not value:
        raise ValueError("目录名称不能为空")
    if value in {".", ".."} or any(ch in value for ch in ("/", "\\", "\x00")):
        raise ValueError("目录名称不能包含路径分隔符")
    if len(value) > 128:
        raise ValueError("目录名称过长")
    return value


def join_folder_path(parent_path: str, name: str) -> str:
    parent = (parent_path or "").rstrip("/")
    return f"{parent}/{name}" if parent else f"/{name}"


def normalize_relative_path(path: str | None) -> list[str]:
    raw = (path or "").replace("\\", "/").strip()
    parts = [p for p in raw.split("/") if p]
    for part in parts:
        normalize_folder_name(part)
    return parts


def part_count(file_size: int, part_size: int) -> int:
    if file_size <= 0:
        return 1
    return max(1, (file_size + part_size - 1) // part_size)


def is_allowed_ext(filename: str, allowed: str | None) -> bool:
    if not allowed or not allowed.strip():
        return True
    values = {v.strip().lower().lstrip(".") for v in allowed.split(",") if v.strip()}
    return file_ext_of(filename) in values
```

`app/core/crypto.py`：

```python
"""对称加密工具：密钥由 JWT secret 派生（Fernet 要求 32 字节 url-safe base64）"""
import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_jwt_config


def _fernet() -> Fernet:
    key = hashlib.sha256(get_jwt_config().secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(plain: str) -> str:
    return _fernet().encrypt(plain.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:  # 典型场景：更换过 JWT secret
        raise ValueError("密钥无法解密，请在存储设置重新填写 Secret Key") from exc
```

- [ ] **Step 5: 跑测试确认通过**

```bash
uv run pytest tests/unit/test_file_utils.py --confcutdir=tests/unit -q
```
预期：全部 PASS。

- [ ] **Step 6: 记录变更（后端不提交）**：`git status` 留存。

---

### Task B2: 5 个模型 + Alembic 002 迁移

**Files:**
- Create: `app/models/file.py`
- Modify: `app/models/__init__.py`
- Modify: `app/models/user.py`（avatar 100→500）
- Create: `alembic/versions/002_file_service.py`

**Interfaces:**
- Produces: `SysStorageConfig / SysFileFolder / SysFile / SysApiKey / SysFileUpload`（SQLModel 表模型，字段见下）；`SysUser.avatar` 长度 500。

- [ ] **Step 1: 新建 `app/models/file.py`**

```python
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Text
from sqlmodel import Field, SQLModel

from app.models.base import BaseModel


class SysStorageConfig(BaseModel, table=True):
    """存储配置（单例，id 恒为 1）"""

    __tablename__ = "sys_storage_config"

    id: Optional[int] = Field(default=1, primary_key=True, description="配置ID")
    internal_endpoint: str = Field(default="", max_length=255, description="后端访问地址")
    public_endpoint: str = Field(default="", max_length=255, description="预签名对外地址")
    region: str = Field(default="us-east-1", max_length=64, description="Region")
    access_key: str = Field(default="", max_length=128, description="MinIO Access Key")
    secret_key_encrypted: str = Field(default="", sa_column=Column(Text), description="Fernet 加密的 Secret Key")
    private_bucket: str = Field(default="", max_length=64, description="私有桶")
    public_bucket: str = Field(default="", max_length=64, description="公开桶")
    public_base_url: str = Field(default="", max_length=255, description="公开文件基础地址，空则用公开端点+公开桶")
    allowed_origins: str = Field(default="", sa_column=Column(Text), description="CORS 允许来源，逗号分隔")
    max_file_size_mb: int = Field(default=1024, description="单文件上限 MB")
    multipart_threshold_mb: int = Field(default=20, description="分片阈值 MB")
    part_size_mb: int = Field(default=10, description="分片大小 MB")
    upload_concurrency: int = Field(default=3, description="前端分片并发")
    upload_session_expire_hours: int = Field(default=24, description="上传会话有效期（小时）")
    upload_presign_expire_minutes: int = Field(default=120, description="上传预签名有效期（分钟）")
    download_presign_expire_seconds: int = Field(default=900, description="下载预签名有效期（秒）")
    default_visibility: str = Field(default="private", max_length=16, description="默认可见性")
    allowed_extensions: str = Field(default="", sa_column=Column(Text), description="允许后缀，逗号分隔，空=不限")


class SysFileFolder(BaseModel, table=True):
    """逻辑目录（仅数据库，与对象键无关）"""

    __tablename__ = "sys_file_folder"

    folder_id: Optional[int] = Field(default=None, primary_key=True, description="目录ID")
    parent_id: int = Field(default=0, index=True, description="父目录ID，0=根")
    folder_name: str = Field(max_length=128, description="目录名")
    folder_path: str = Field(default="", max_length=512, description="物化路径，如 /API-demo/2026")
    is_system: int = Field(default=0, description="1=系统目录不可删改")
    sort: int = Field(default=0, description="排序")


class SysFile(BaseModel, table=True):
    """文件元数据"""

    __tablename__ = "sys_file"

    file_id: Optional[int] = Field(default=None, primary_key=True, description="文件ID")
    folder_id: int = Field(default=0, index=True, description="所属目录，0=根")
    file_name: str = Field(max_length=255, index=True, description="原始文件名")
    object_key: str = Field(max_length=512, unique=True, description="对象键，服务端生成")
    bucket: str = Field(max_length=64, description="实际桶名")
    visibility: str = Field(default="private", max_length=16, description="private/public")
    category: str = Field(default="other", max_length=16, index=True, description="分类")
    mime_type: str = Field(default="", max_length=128, description="MIME 类型")
    file_ext: str = Field(default="", max_length=32, description="小写后缀不含点")
    file_size: int = Field(default=0, description="字节数")
    etag: str = Field(default="", max_length=128, description="S3 ETag")
    source: str = Field(default="admin", max_length=16, description="admin/api/avatar")
    api_key_id: Optional[int] = Field(default=None, index=True, description="API 上传来源 Key，可悬空")
    uploader_id: Optional[int] = Field(default=None, description="后台上传者用户ID")
    uploader_name: str = Field(default="", max_length=64, description="上传者名称/Key 名称")


class SysApiKey(BaseModel, table=True):
    """对外 API 凭证"""

    __tablename__ = "sys_api_key"

    key_id: Optional[int] = Field(default=None, primary_key=True, description="KeyID")
    key_name: str = Field(max_length=64, description="Key 名称")
    access_key: str = Field(max_length=64, unique=True, index=True, description="ak_ 前缀")
    secret_hash: str = Field(max_length=128, description="SHA-256(secret)")
    secret_hint: str = Field(default="", max_length=8, description="末 4 位")
    scopes: str = Field(default="upload,download,list,delete", max_length=255, description="逗号分隔权限")
    folder_id: int = Field(default=0, index=True, description="命名空间根目录ID")
    quota_bytes: int = Field(default=0, description="容量配额，0=不限")
    used_bytes: int = Field(default=0, description="已用容量")
    expires_at: Optional[datetime] = Field(default=None, description="过期时间")
    status: str = Field(default="0", max_length=1, description="0正常 1停用")
    last_used_at: Optional[datetime] = Field(default=None, description="最后使用时间")
    last_used_ip: str = Field(default="", max_length=64, description="最后使用IP")


class SysFileUpload(SQLModel, table=True):
    """上传会话（断点续传载体；轻量表，自带时间字段不走 BaseModel）"""

    __tablename__ = "sys_file_upload"

    session_id: str = Field(primary_key=True, max_length=36, description="UUID")
    user_id: Optional[int] = Field(default=None, index=True, description="后台发起人")
    api_key_id: Optional[int] = Field(default=None, index=True, description="API Key 发起人")
    file_name: str = Field(max_length=255, description="文件名")
    file_size: int = Field(default=0, description="文件大小")
    mime_type: str = Field(default="", max_length=128, description="MIME")
    folder_id: int = Field(default=0, description="目标目录")
    visibility: str = Field(default="private", max_length=16, description="可见性")
    bucket: str = Field(max_length=64, description="目标桶")
    object_key: str = Field(max_length=512, description="对象键")
    mode: str = Field(default="single", max_length=16, description="single/multipart")
    upload_id: str = Field(default="", max_length=255, description="S3 Multipart UploadId")
    part_size: int = Field(default=0, description="分片大小，single=文件大小")
    status: str = Field(default="pending", max_length=16, description="pending/uploading/completed/aborted/expired")
    expires_at: datetime = Field(description="过期时间")
    file_id: Optional[int] = Field(default=None, description="完成后关联文件")
    create_time: Optional[datetime] = Field(default=None, description="创建时间")
    update_time: Optional[datetime] = Field(default=None, description="更新时间")
```

- [ ] **Step 2: 导出模型**：`app/models/__init__.py` 追加

```python
from app.models.file import (
    SysApiKey,
    SysFile,
    SysFileFolder,
    SysFileUpload,
    SysStorageConfig,
)
```
并把 5 个名字加入 `__all__`（若该文件有 `__all__`；没有则不加）。Alembic `env.py` 已通过 `app.models` 元数据自动发现。

- [ ] **Step 3: `app/models/user.py` 的 avatar 放宽**

```python
    avatar: Optional[str] = Field(default="", max_length=500, description="头像地址")
```

- [ ] **Step 4: 写迁移** `alembic/versions/002_file_service.py`

```python
"""file service tables

Revision ID: 002
Revises: 001
"""
import sqlalchemy as sa
from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None

BASE_COLS = [
    sa.Column("create_by", sa.String(64), default="", comment="创建者"),
    sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), comment="创建时间"),
    sa.Column("update_by", sa.String(64), default="", comment="更新者"),
    sa.Column("update_time", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now(), comment="更新时间"),
    sa.Column("remark", sa.String(500), nullable=True, comment="备注"),
]


def _text(name):
    return sa.Column(name, sa.Text(), nullable=True)


def upgrade() -> None:
    op.create_table(
        "sys_storage_config",
        sa.Column("id", sa.Integer(), primary_key=True, comment="配置ID"),
        sa.Column("internal_endpoint", sa.String(255), default="", comment="后端访问地址"),
        sa.Column("public_endpoint", sa.String(255), default="", comment="预签名对外地址"),
        sa.Column("region", sa.String(64), default="us-east-1", comment="Region"),
        sa.Column("access_key", sa.String(128), default="", comment="MinIO Access Key"),
        _text("secret_key_encrypted"),
        sa.Column("private_bucket", sa.String(64), default="", comment="私有桶"),
        sa.Column("public_bucket", sa.String(64), default="", comment="公开桶"),
        sa.Column("public_base_url", sa.String(255), default="", comment="公开文件基础地址"),
        _text("allowed_origins"),
        sa.Column("max_file_size_mb", sa.Integer(), default=1024, comment="单文件上限MB"),
        sa.Column("multipart_threshold_mb", sa.Integer(), default=20, comment="分片阈值MB"),
        sa.Column("part_size_mb", sa.Integer(), default=10, comment="分片大小MB"),
        sa.Column("upload_concurrency", sa.Integer(), default=3, comment="分片并发"),
        sa.Column("upload_session_expire_hours", sa.Integer(), default=24, comment="会话有效期"),
        sa.Column("upload_presign_expire_minutes", sa.Integer(), default=120, comment="上传签名有效期"),
        sa.Column("download_presign_expire_seconds", sa.Integer(), default=900, comment="下载签名有效期"),
        sa.Column("default_visibility", sa.String(16), default="private", comment="默认可见性"),
        _text("allowed_extensions"),
        *BASE_COLS,
        comment="存储配置",
    )

    op.create_table(
        "sys_file_folder",
        sa.Column("folder_id", sa.Integer(), primary_key=True, autoincrement=True, comment="目录ID"),
        sa.Column("parent_id", sa.Integer(), default=0, comment="父目录ID"),
        sa.Column("folder_name", sa.String(128), nullable=False, comment="目录名"),
        sa.Column("folder_path", sa.String(512), default="", comment="物化路径"),
        sa.Column("is_system", sa.Integer(), default=0, comment="1=系统目录"),
        sa.Column("sort", sa.Integer(), default=0, comment="排序"),
        *BASE_COLS,
        comment="文件目录",
    )
    op.create_index("ix_sys_file_folder_parent_id", "sys_file_folder", ["parent_id"])

    op.create_table(
        "sys_file",
        sa.Column("file_id", sa.Integer(), primary_key=True, autoincrement=True, comment="文件ID"),
        sa.Column("folder_id", sa.Integer(), default=0, comment="所属目录"),
        sa.Column("file_name", sa.String(255), nullable=False, comment="原始文件名"),
        sa.Column("object_key", sa.String(512), nullable=False, comment="对象键"),
        sa.Column("bucket", sa.String(64), nullable=False, comment="桶名"),
        sa.Column("visibility", sa.String(16), default="private", comment="可见性"),
        sa.Column("category", sa.String(16), default="other", comment="分类"),
        sa.Column("mime_type", sa.String(128), default="", comment="MIME"),
        sa.Column("file_ext", sa.String(32), default="", comment="后缀"),
        sa.Column("file_size", sa.BigInteger(), default=0, comment="字节数"),
        sa.Column("etag", sa.String(128), default="", comment="ETag"),
        sa.Column("source", sa.String(16), default="admin", comment="来源"),
        sa.Column("api_key_id", sa.Integer(), nullable=True, comment="API Key"),
        sa.Column("uploader_id", sa.Integer(), nullable=True, comment="上传者ID"),
        sa.Column("uploader_name", sa.String(64), default="", comment="上传者名称"),
        *BASE_COLS,
        comment="文件元数据",
    )
    op.create_index("ix_sys_file_folder_id", "sys_file", ["folder_id"])
    op.create_index("ix_sys_file_file_name", "sys_file", ["file_name"])
    op.create_index("ix_sys_file_category", "sys_file", ["category"])
    op.create_index("ix_sys_file_api_key_id", "sys_file", ["api_key_id"])
    op.create_index("ix_sys_file_create_time", "sys_file", ["create_time"])
    op.create_unique_constraint("uq_sys_file_object_key", "sys_file", ["object_key"])

    op.create_table(
        "sys_api_key",
        sa.Column("key_id", sa.Integer(), primary_key=True, autoincrement=True, comment="KeyID"),
        sa.Column("key_name", sa.String(64), nullable=False, comment="名称"),
        sa.Column("access_key", sa.String(64), nullable=False, comment="ak_ 前缀"),
        sa.Column("secret_hash", sa.String(128), nullable=False, comment="SHA-256"),
        sa.Column("secret_hint", sa.String(8), default="", comment="末4位"),
        sa.Column("scopes", sa.String(255), default="upload,download,list,delete", comment="权限"),
        sa.Column("folder_id", sa.Integer(), default=0, comment="命名空间目录"),
        sa.Column("quota_bytes", sa.BigInteger(), default=0, comment="配额0=不限"),
        sa.Column("used_bytes", sa.BigInteger(), default=0, comment="已用"),
        sa.Column("expires_at", sa.DateTime(), nullable=True, comment="过期时间"),
        sa.Column("status", sa.String(1), default="0", comment="0正常1停用"),
        sa.Column("last_used_at", sa.DateTime(), nullable=True, comment="最后使用"),
        sa.Column("last_used_ip", sa.String(64), default="", comment="最后IP"),
        *BASE_COLS,
        comment="API密钥",
    )
    op.create_index("ix_sys_api_key_folder_id", "sys_api_key", ["folder_id"])
    op.create_unique_constraint("uq_sys_api_key_access_key", "sys_api_key", ["access_key"])

    op.create_table(
        "sys_file_upload",
        sa.Column("session_id", sa.String(36), primary_key=True, comment="会话ID"),
        sa.Column("user_id", sa.Integer(), nullable=True, comment="发起人"),
        sa.Column("api_key_id", sa.Integer(), nullable=True, comment="Key"),
        sa.Column("file_name", sa.String(255), nullable=False, comment="文件名"),
        sa.Column("file_size", sa.BigInteger(), default=0, comment="大小"),
        sa.Column("mime_type", sa.String(128), default="", comment="MIME"),
        sa.Column("folder_id", sa.Integer(), default=0, comment="目标目录"),
        sa.Column("visibility", sa.String(16), default="private", comment="可见性"),
        sa.Column("bucket", sa.String(64), nullable=False, comment="桶"),
        sa.Column("object_key", sa.String(512), nullable=False, comment="对象键"),
        sa.Column("mode", sa.String(16), default="single", comment="模式"),
        sa.Column("upload_id", sa.String(255), default="", comment="UploadId"),
        sa.Column("part_size", sa.BigInteger(), default=0, comment="分片大小"),
        sa.Column("status", sa.String(16), default="pending", comment="状态"),
        sa.Column("expires_at", sa.DateTime(), nullable=False, comment="过期时间"),
        sa.Column("file_id", sa.Integer(), nullable=True, comment="完成文件"),
        sa.Column("create_time", sa.DateTime(), server_default=sa.func.now(), comment="创建时间"),
        sa.Column("update_time", sa.DateTime(), server_default=sa.func.now(), comment="更新时间"),
        comment="上传会话",
    )
    op.create_index("ix_sys_file_upload_user_id", "sys_file_upload", ["user_id", "status"])
    op.create_index("ix_sys_file_upload_api_key_id", "sys_file_upload", ["api_key_id", "status"])
    op.create_index("ix_sys_file_upload_expires_at", "sys_file_upload", ["expires_at"])

    op.alter_column("sys_user", "avatar", existing_type=sa.String(100),
                    type_=sa.String(500), existing_nullable=True, comment="头像地址")


def downgrade() -> None:
    op.alter_column("sys_user", "avatar", existing_type=sa.String(500),
                    type_=sa.String(100), existing_nullable=True)
    op.drop_table("sys_file_upload")
    op.drop_table("sys_api_key")
    op.drop_table("sys_file")
    op.drop_table("sys_file_folder")
    op.drop_table("sys_storage_config")
```

- [ ] **Step 5: 验证模型可导入**

```bash
uv run python -c "from app.models import SysFile, SysApiKey, SysStorageConfig, SysFileFolder, SysFileUpload; print('ok')"
```

- [ ] **Step 6: 执行迁移（需用户确认已备份数据库）**

```bash
uv run alembic upgrade head
```
预期：`Running upgrade 001 -> 002`。若失败贴报错修正。

---

### Task B3: boto3 工厂 + 存储配置服务 + 存储设置接口

**Files:**
- Create: `app/utils/minio.py`
- Create: `app/repositories/storage.py`
- Create: `app/schemas/storage.py`
- Create: `app/services/storage.py`
- Create: `app/api/v1/storage.py`
- Modify: `app/core/constants.py`（RedisKey.STORAGE_CONFIG）
- Modify: `app/api/v1/router.py`

**Interfaces:**
- Consumes: B1 的 crypto/file_utils；B2 的 `SysStorageConfig`。
- Produces:
  - `minio.build_s3_client(cfg, public=False)`、`minio.run_s3(func, *args, **kwargs)`、`minio.presign_put/presign_part/presign_get/presign_delete`、`minio.public_object_url(cfg, bucket, key)`、`minio.ensure_buckets_and_policy(client_factory, cfg)`
  - `StorageService.get_config(db, redis, required=False) -> SysStorageConfig | None`（带 Redis 缓存）、`StorageService.save_config(...)`、`StorageService.to_out(cfg) -> dict`、`StorageService.test_connection(cfg) -> list[dict]`、`StorageService.init_buckets(db, redis) -> list[dict]`
  - 路由：`GET/PUT /api/v1/system/storage/config`、`POST /api/v1/system/storage/test`、`POST /api/v1/system/storage/init`

- [ ] **Step 1: `app/core/constants.py`** 的 `RedisKey` 类加一行

```python
    STORAGE_CONFIG = "system:storage:config"
```

- [ ] **Step 2: `app/utils/minio.py`**

```python
"""boto3 client 工厂与预签名工具。所有阻塞调用经 run_s3 包装进线程池。"""
import asyncio
import json
from urllib.parse import quote

import boto3
import httpx
from botocore.client import Config
from botocore.exceptions import ClientError

from app.core.crypto import decrypt_secret
from app.models.file import SysStorageConfig


def _bucket_config():
    return Config(signature_version="s3v4", s3={"addressing_style": "path"})


def build_s3_client(cfg: SysStorageConfig, public: bool = False):
    endpoint = cfg.public_endpoint if public else cfg.internal_endpoint
    return boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id=cfg.access_key,
        aws_secret_access_key=decrypt_secret(cfg.secret_key_encrypted),
        region_name=cfg.region or "us-east-1",
        config=_bucket_config(),
    )


async def run_s3(func, *args, **kwargs):
    return await asyncio.to_thread(func, *args, **kwargs)


def public_object_url(cfg: SysStorageConfig, bucket: str, object_key: str) -> str:
    base = cfg.public_base_url.rstrip("/") if cfg.public_base_url else f"{cfg.public_endpoint.rstrip('/')}/{cfg.public_bucket}"
    return f"{base}/{quote(object_key)}"


def presign_put(client, bucket: str, key: str, mime_type: str, expires: int) -> str:
    return client.generate_presigned_url(
        "put_object",
        Params={"Bucket": bucket, "Key": key, "ContentType": mime_type or "application/octet-stream"},
        ExpiresIn=expires,
    )


def presign_part(client, bucket: str, key: str, upload_id: str, part_number: int, expires: int) -> str:
    return client.generate_presigned_url(
        "upload_part",
        Params={"Bucket": bucket, "Key": key, "UploadId": upload_id, "PartNumber": part_number},
        ExpiresIn=expires,
    )


def presign_get(client, bucket: str, key: str, expires: int, filename: str | None = None, attachment: bool = False) -> str:
    params: dict = {"Bucket": bucket, "Key": key}
    if filename:
        params["ResponseContentDisposition"] = f"{'attachment' if attachment else 'inline'}; filename*=UTF-8''{quote(filename)}"
    return client.generate_presigned_url("get_object", Params=params, ExpiresIn=expires)


def public_bucket_policy(bucket: str) -> str:
    return json.dumps({
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"AWS": ["*"]},
            "Action": ["s3:GetObject"],
            "Resource": [f"arn:aws:s3:::{bucket}/*"],
        }],
    })


def bucket_cors_config(allowed_origins: str) -> dict:
    origins = [o.strip() for o in (allowed_origins or "").split(",") if o.strip()] or ["*"]
    return {
        "CORSRules": [{
            "AllowedOrigins": origins,
            "AllowedMethods": ["GET", "PUT", "HEAD", "POST"],
            "AllowedHeaders": ["*"],
            "ExposeHeaders": ["ETag"],
            "MaxAgeSeconds": 3600,
        }]
    }


def ensure_buckets_and_policy(cfg: SysStorageConfig) -> list[dict]:
    """同步函数：建双桶 + 公开桶匿名只读 + 两桶 CORS。调用方放线程池执行。"""
    client = build_s3_client(cfg)
    results = []

    def _ensure(name: str, public: bool):
        try:
            client.head_bucket(Bucket=name)
            results.append({"key": f"bucket:{name}", "ok": True, "message": "桶已存在"})
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "")
            if code not in ("404", "NoSuchBucket"):
                raise
            client.create_bucket(Bucket=name)
            results.append({"key": f"bucket:{name}", "ok": True, "message": "桶已创建"})
        if public:
            client.put_bucket_policy(Bucket=name, Policy=public_bucket_policy(name))
        client.put_bucket_cors(Bucket=name, CORSConfiguration=bucket_cors_config(cfg.allowed_origins))
        results.append({"key": f"cors:{name}", "ok": True, "message": "CORS 已配置（ExposeHeaders=ETag）"})

    if cfg.private_bucket:
        _ensure(cfg.private_bucket, public=False)
    if cfg.public_bucket:
        _ensure(cfg.public_bucket, public=True)
    return results


async def check_public_reachable(cfg: SysStorageConfig) -> dict:
    url = public_object_url(cfg, cfg.public_bucket, "")
    try:
        resp = await httpx.AsyncClient(timeout=5, follow_redirects=True).get(url)
        # 200/403 都说明端点可达（403=未匿名授权）
        return {"key": "public_url", "ok": resp.status_code < 500, "message": f"公开地址可达（HTTP {resp.status_code}）"}
    except Exception as exc:
        return {"key": "public_url", "ok": False, "message": f"公开地址不可达：{exc}"}
```

- [ ] **Step 3: `app/repositories/storage.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import SysStorageConfig
from app.repositories.base import BaseRepository


class StorageRepository(BaseRepository[SysStorageConfig]):
    def __init__(self, db: AsyncSession):
        super().__init__(SysStorageConfig, db)

    async def get_singleton(self) -> SysStorageConfig | None:
        return await self.get_by_id(1)
```

- [ ] **Step 4: `app/schemas/storage.py`**

```python
from pydantic import BaseModel

from app.schemas.base import CamelModel


class StorageConfigUpdate(CamelModel):
    internal_endpoint: str = ""
    public_endpoint: str = ""
    region: str = "us-east-1"
    access_key: str = ""
    secret_key: str | None = None  # 留空=不修改
    private_bucket: str = ""
    public_bucket: str = ""
    public_base_url: str = ""
    allowed_origins: str = ""
    max_file_size_mb: int = 1024
    multipart_threshold_mb: int = 20
    part_size_mb: int = 10
    upload_concurrency: int = 3
    upload_session_expire_hours: int = 24
    upload_presign_expire_minutes: int = 120
    download_presign_expire_seconds: int = 900
    default_visibility: str = "private"
    allowed_extensions: str = ""


class StorageConfigOut(BaseModel):
    """响应模型用 snake_case，与全站行数据一致"""
    internal_endpoint: str = ""
    public_endpoint: str = ""
    region: str = ""
    access_key: str = ""
    has_secret: bool = False
    secret_hint: str = ""
    private_bucket: str = ""
    public_bucket: str = ""
    public_base_url: str = ""
    allowed_origins: str = ""
    max_file_size_mb: int = 0
    multipart_threshold_mb: int = 0
    part_size_mb: int = 0
    upload_concurrency: int = 0
    upload_session_expire_hours: int = 0
    upload_presign_expire_minutes: int = 0
    download_presign_expire_seconds: int = 0
    default_visibility: str = "private"
    allowed_extensions: str = ""


class StorageTestIn(StorageConfigUpdate):
    """测试连接：允许用未保存的表单值，缺省回退已存配置"""
```

- [ ] **Step 5: `app/services/storage.py`**

```python
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession
from botocore.exceptions import ClientError

from app.core.constants import RedisKey
from app.core.crypto import decrypt_secret, encrypt_secret, mask_secret
from app.models.file import SysStorageConfig
from app.repositories.storage import StorageRepository
from app.schemas.storage import StorageConfigOut, StorageConfigUpdate
from app.utils import minio


class StorageService:
    """存储配置：读缓存 → 单例表；保存后失效缓存"""

    CACHE_KEY = RedisKey.STORAGE_CONFIG

    @staticmethod
    async def get_config(db: AsyncSession, redis, required: bool = False) -> SysStorageConfig | None:
        cached = await redis.get(StorageService.CACHE_KEY)
        if cached:
            return SysStorageConfig.model_validate_json(cached)
        repo = StorageRepository(db)
        cfg = await repo.get_singleton()
        if cfg and cfg.internal_endpoint:
            await redis.set(StorageService.CACHE_KEY, cfg.model_dump_json())
        if required and (cfg is None or not cfg.internal_endpoint or not cfg.secret_key_encrypted):
            from app.core.exceptions import BusinessException
            raise BusinessException("存储服务未配置，请先在「存储设置」完成配置并测试连接")
        return cfg

    @staticmethod
    async def save_config(db: AsyncSession, redis, payload: StorageConfigUpdate, operator: str = "") -> dict:
        repo = StorageRepository(db)
        cfg = await repo.get_singleton()
        data = payload.model_dump(exclude={"secret_key"})
        if cfg is None:
            cfg = SysStorageConfig(id=1, create_by=operator, **data)
        else:
            for k, v in data.items():
                setattr(cfg, k, v)
            cfg.update_by = operator
        if payload.secret_key:
            cfg.secret_key_encrypted = encrypt_secret(payload.secret_key)
        db.add(cfg)
        await db.flush()
        await redis.delete(StorageService.CACHE_KEY)
        return StorageService.to_out(cfg)

    @staticmethod
    def to_out(cfg: SysStorageConfig) -> dict:
        out = StorageConfigOut(
            **{f.name: getattr(cfg, f.name) for f in StorageConfigOut.model_fields.values() if hasattr(cfg, f.name)},
        )
        data = out.model_dump()
        data.pop("has_secret", None)
        data["has_secret"] = bool(cfg.secret_key_encrypted)
        try:
            data["secret_hint"] = mask_secret(decrypt_secret(cfg.secret_key_encrypted)) if cfg.secret_key_encrypted else ""
        except ValueError:
            data["secret_hint"] = "****"
        return data

    @staticmethod
    def merge_for_test(base: SysStorageConfig | None, payload: StorageConfigUpdate | None) -> SysStorageConfig:
        cfg = base.model_copy(deep=True) if base else SysStorageConfig(id=1)
        if payload:
            for k, v in payload.model_dump(exclude={"secret_key"}).items():
                if v not in (None, ""):
                    setattr(cfg, k, v)
            if payload.secret_key:
                cfg.secret_key_encrypted = encrypt_secret(payload.secret_key)
        return cfg

    @staticmethod
    async def test_connection(cfg: SysStorageConfig) -> list[dict]:
        results: list[dict] = []
        for label, endpoint in (("内部连接", cfg.internal_endpoint), ("公开地址", cfg.public_endpoint)):
            try:
                await minio.run_s3(minio.build_s3_client(cfg, public=(label == "公开地址")).head_bucket,
                                   Bucket=cfg.private_bucket or cfg.public_bucket)
                results.append({"key": label, "ok": True, "message": f"{label}连通，桶可访问"})
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                results.append({"key": label, "ok": code in ("403", "404"),
                                "message": f"{label}可达（HTTP {code}），请检查桶名/密钥" if code else f"{label}失败：{e}"})
            except Exception as e:
                results.append({"key": label, "ok": False, "message": f"{label}不可达：{e}"})
        results.append(await minio.check_public_reachable(cfg))
        return results

    @staticmethod
    async def init_buckets(db: AsyncSession, redis) -> list[dict]:
        cfg = await StorageService.get_config(db, redis, required=True)
        logger.info("初始化 MinIO 桶与 CORS")
        return await minio.run_s3(minio.ensure_buckets_and_policy, cfg)
```

- [ ] **Step 6: `app/api/v1/storage.py`**

```python
from typing import Annotated, Optional

from fastapi import APIRouter

from app.api.deps import DbSession, CurrentUserDep, require_permission
from app.core.response import R
from app.schemas.common import CurrentUser
from app.schemas.storage import StorageConfigUpdate, StorageTestIn
from app.services.storage import StorageService

router = APIRouter(prefix="/storage", tags=["存储设置"])


@router.get("/config", summary="查询存储配置")
async def get_storage_config(
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    """查询存储配置（Secret 只回显末 4 位）"""
    from fastapi import Depends  # noqa: PLC0415 —— 放函数内避免循环导入亦可提到顶部
    cfg = await StorageService.get_config(db, current_user and Depends and None)  # 占位见下
```

> 上面注释示意即可——实际写法不要在函数体里 import Depends，直接在文件顶部统一导入，签名写：
> `current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))]`。
> 三个接口实现：

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_permission
from app.core.response import R
from app.schemas.common import CurrentUser
from app.schemas.storage import StorageConfigUpdate, StorageTestIn
from app.services.storage import StorageService

router = APIRouter(prefix="/storage", tags=["存储设置"])


@router.get("/config", summary="查询存储配置")
async def get_storage_config(
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    """查询存储配置（Secret 只回显末 4 位）"""
    cfg = await StorageService.get_config(db, db.session and None) if False else None  # 见下
```

> ⚠️ 写代码时不要照抄上面两段示意，最终文件如下（一次成型）：

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_permission
from app.core.redis import get_redis
from app.core.response import R
from app.schemas.common import CurrentUser
from app.schemas.storage import StorageConfigUpdate, StorageTestIn
from app.services.storage import StorageService

router = APIRouter(prefix="/storage", tags=["存储设置"])


@router.get("/config", summary="查询存储配置")
async def get_storage_config(
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    """查询存储配置（Secret 只回显末 4 位）"""
    cfg = await StorageService.get_config(db, get_redis())
    return R.ok(data=StorageService.to_out(cfg) if cfg else None, msg="查询成功")


@router.put("/config", summary="保存存储配置")
async def save_storage_config(
    payload: StorageConfigUpdate,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    """保存后立即失效缓存，改完即时生效"""
    data = await StorageService.save_config(db, get_redis(), payload, current_user.user.user_name)
    return R.ok(data=data, msg="保存成功")


@router.post("/test", summary="测试连接")
async def test_storage(
    payload: StorageTestIn | None = None,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    """用表单值（缺省回退已存配置）测试内部连接/公开地址/公开可达性"""
    cfg = StorageService.merge_for_test(await StorageService.get_config(db, get_redis()), payload)
    if not cfg.internal_endpoint:
        from app.core.exceptions import BusinessException
        raise BusinessException("请先填写内部端点与密钥")
    return R.ok(data=await StorageService.test_connection(cfg), msg="测试完成")


@router.post("/init", summary="初始化桶与 CORS")
async def init_storage(
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:config"))],
):
    return R.ok(data=await StorageService.init_buckets(db, get_redis()), msg="初始化完成")
```

- [ ] **Step 7: 注册路由** `app/api/v1/router.py`：import `storage`，在「字典与配置模块」注释块后加

```python
# 文件服务模块
api_v1_router.include_router(storage.router, prefix="/system", tags=["存储设置"])
```
（file/api-key/open 路由后续任务再注册。）

- [ ] **Step 8: 验证**

```bash
uv run python -m compileall app -q && echo OK
```

- [ ] **Step 9: 记录变更（不提交）**

---

### Task B4: 目录服务 + 文件列表接口

**Files:**
- Create: `app/repositories/file.py`
- Create: `app/schemas/file.py`
- Create: `app/services/folder.py`
- Create: `app/api/v1/file.py`（本任务只放 list/folders/folder CRUD，后续任务继续追加）
- Modify: `app/api/v1/router.py`

**Interfaces:**
- Consumes: B2 模型、B3 `StorageService.get_config`（本任务暂不需要）。
- Produces:
  - `FileFolderRepository.get_all/get_child/get_children/is_empty/exists_name`
  - `FolderService.list_folders/create_folder/update_folder/delete_folders/create_system_folder(db, name) -> SysFileFolder`
  - `FileService.list_files(db, query) -> dict`（rows 带 `folder_path`、`api_key_name`）
  - 路由：`GET /system/file/list`、`GET /system/file/folders`、`POST /system/file/folder`、`PUT /system/file/folder/{folder_id}`、`DELETE /system/file/folder/{ids}`
  - `schemas/file.py` 中 `FilePageQuery / FolderCreate / FolderUpdate`（后续上传任务复用 `FilePageQuery`）

- [ ] **Step 1: `app/repositories/file.py`**

```python
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import SysFile, SysFileFolder, SysFileUpload
from app.repositories.base import BaseRepository


class FileFolderRepository(BaseRepository[SysFileFolder]):
    def __init__(self, db: AsyncSession):
        super().__init__(SysFileFolder, db)

    async def get_all(self) -> list[SysFileFolder]:
        result = await self.db.execute(
            select(SysFileFolder).order_by(SysFileFolder.sort, SysFileFolder.folder_id)
        )
        return list(result.scalars().all())

    async def get_child(self, parent_id: int, name: str) -> SysFileFolder | None:
        result = await self.db.execute(
            select(SysFileFolder).where(SysFileFolder.parent_id == parent_id, SysFileFolder.folder_name == name)
        )
        return result.scalar_one_or_none()

    async def get_children(self, parent_id: int) -> list[SysFileFolder]:
        result = await self.db.execute(select(SysFileFolder).where(SysFileFolder.parent_id == parent_id))
        return list(result.scalars().all())

    async def exists_name(self, parent_id: int, name: str, exclude_id: int | None = None) -> bool:
        child = await self.get_child(parent_id, name)
        return child is not None and child.folder_id != exclude_id

    async def is_empty(self, folder_id: int) -> bool:
        f_count = (await self.db.execute(
            select(func.count()).select_from(SysFile).where(SysFile.folder_id == folder_id)
        )).scalar_one()
        d_count = (await self.db.execute(
            select(func.count()).select_from(SysFileFolder).where(SysFileFolder.parent_id == folder_id)
        )).scalar_one()
        return f_count == 0 and d_count == 0


class FileRepository(BaseRepository[SysFile]):
    def __init__(self, db: AsyncSession):
        super().__init__(SysFile, db)

    async def count_in_folder(self, folder_id: int) -> int:
        return (await self.db.execute(
            select(func.count()).select_from(SysFile).where(SysFile.folder_id == folder_id)
        )).scalar_one()


class UploadSessionRepository(BaseRepository[SysFileUpload]):
    def __init__(self, db: AsyncSession):
        super().__init__(SysFileUpload, db)

    async def get_expired(self, now: datetime) -> list[SysFileUpload]:
        result = await self.db.execute(
            select(SysFileUpload).where(
                SysFileUpload.status.in_(("pending", "uploading")),
                SysFileUpload.expires_at < now,
            )
        )
        return list(result.scalars().all())

    async def get_active(self, *, user_id: int | None = None, api_key_id: int | None = None) -> list[SysFileUpload]:
        stmt = select(SysFileUpload).where(SysFileUpload.status.in_(("pending", "uploading")))
        if user_id is not None:
            stmt = stmt.where(SysFileUpload.user_id == user_id)
        if api_key_id is not None:
            stmt = stmt.where(SysFileUpload.api_key_id == api_key_id)
        result = await self.db.execute(stmt.order_by(SysFileUpload.create_time.desc()))
        return list(result.scalars().all())
```

- [ ] **Step 2: `app/schemas/file.py`（本任务部分）**

```python
from datetime import datetime

from pydantic import field_validator

from app.schemas.base import CamelModel, PageQuery


class FilePageQuery(PageQuery):
    folder_id: int | None = None
    file_name: str | None = None
    category: str | None = None
    visibility: str | None = None
    source: str | None = None
    begin_time: str | None = None
    end_time: str | None = None


class FolderCreate(CamelModel):
    parent_id: int = 0
    folder_name: str


class FolderUpdate(CamelModel):
    folder_name: str | None = None
    parent_id: int | None = None
```

- [ ] **Step 3: `app/services/folder.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessException, ValidationException
from app.models.file import SysFileFolder
from app.repositories.file import FileFolderRepository
from app.utils.file_utils import join_folder_path, normalize_folder_name


class FolderService:
    @staticmethod
    async def list_folders(db: AsyncSession) -> list[SysFileFolder]:
        return await FileFolderRepository(db).get_all()

    @staticmethod
    async def create_folder(db: AsyncSession, parent_id: int, folder_name: str,
                            operator: str = "", is_system: bool = False) -> SysFileFolder:
        repo = FileFolderRepository(db)
        name = normalize_folder_name(folder_name)
        parent: SysFileFolder | None = None
        if parent_id:
            parent = await repo.get_by_id(parent_id)
            if not parent:
                raise BusinessException("父目录不存在")
        if await repo.exists_name(parent_id, name):
            raise ValidationException("同级目录下已存在同名目录")
        folder = SysFileFolder(
            parent_id=parent_id,
            folder_name=name,
            folder_path=join_folder_path(parent.folder_path if parent else "", name),
            is_system=1 if is_system else 0,
            create_by=operator,
        )
        return await repo.create(folder)

    @staticmethod
    async def create_system_folder(db: AsyncSession, name: str) -> SysFileFolder:
        """系统目录（头像/通用上传/API Key 命名空间）：存在即复用"""
        repo = FileFolderRepository(db)
        name = normalize_folder_name(name)
        existing = await repo.get_child(0, name)
        if existing:
            return existing
        return await FolderService.create_folder(db, 0, name, is_system=True)

    @staticmethod
    async def update_folder(db: AsyncSession, folder_id: int, folder_name: str | None,
                            parent_id: int | None, operator: str = "") -> SysFileFolder:
        repo = FileFolderRepository(db)
        folder = await repo.get_by_id(folder_id)
        if not folder:
            raise BusinessException("目录不存在")
        if folder.is_system:
            raise BusinessException("系统目录不允许改名或移动")
        new_parent = folder.parent_id if parent_id is None else parent_id
        if parent_id is not None:
            if parent_id == folder_id:
                raise ValidationException("不能移动到自身")
            parent = await repo.get_by_id(parent_id) if parent_id else None
            if parent_id and not parent:
                raise BusinessException("目标父目录不存在")
            # 目标不能是自己的后代
            if parent and parent.folder_path.startswith(folder.folder_path + "/"):
                raise ValidationException("不能移动到自己的子目录")
        name = normalize_folder_name(folder_name) if folder_name else folder.folder_name
        if await repo.exists_name(new_parent, name, exclude_id=folder_id):
            raise ValidationException("同级目录下已存在同名目录")
        folder.parent_id = new_parent
        folder.folder_name = name
        folder.update_by = operator
        await FolderService._refresh_subtree_paths(db, folder)
        await db.flush()
        return folder

    @staticmethod
    async def _refresh_subtree_paths(db: AsyncSession, folder: SysFileFolder) -> None:
        repo = FileFolderRepository(db)
        folder.folder_path = join_folder_path(
            (await repo.get_by_id(folder.parent_id)).folder_path if folder.parent_id else "",
            folder.folder_name,
        )
        for child in await repo.get_children(folder.folder_id):
            await FolderService._refresh_subtree_paths(db, child)

    @staticmethod
    async def delete_folders(db: AsyncSession, ids: list[int]) -> int:
        repo = FileFolderRepository(db)
        deleted = 0
        for fid in ids:
            folder = await repo.get_by_id(fid)
            if not folder:
                continue
            if folder.is_system:
                raise BusinessException(f"系统目录「{folder.folder_name}」不允许删除")
            if not await repo.is_empty(fid):
                raise BusinessException(f"目录「{folder.folder_name}」非空，无法删除")
            await repo.hard_delete(fid)
            deleted += 1
        return deleted
```

- [ ] **Step 4: `app/api/v1/file.py`（第一阶段）**

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_permission
from app.core.response import R
from app.schemas.common import CurrentUser
from app.schemas.file import FilePageQuery, FolderCreate, FolderUpdate
from app.services.file import FileService
from app.services.folder import FolderService

router = APIRouter(prefix="/file", tags=["文件管理"])


@router.get("/list", summary="文件分页列表")
async def get_file_list(
    query: Annotated[FilePageQuery, Depends()],
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:list"))],
):
    result = await FileService.list_files(db, query)
    return R.page(rows=result["rows"], total=result["total"],
                  page_num=query.page_num, page_size=query.page_size)


@router.get("/folders", summary="全部目录")
async def get_folders(
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:list"))],
):
    return R.ok(data=FolderService.list_folders.__wrapped__(db) if False else await FolderService.list_folders(db), msg="查询成功")


@router.post("/folder", summary="新建目录")
async def create_folder(
    payload: FolderCreate,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:edit"))],
):
    folder = await FolderService.create_folder(db, payload.parent_id, payload.folder_name,
                                               current_user.user.user_name)
    return R.ok(data={"folder_id": folder.folder_id}, msg="创建成功")


@router.put("/folder/{folder_id}", summary="重命名/移动目录")
async def update_folder(
    folder_id: int,
    payload: FolderUpdate,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:edit"))],
):
    await FolderService.update_folder(db, folder_id, payload.folder_name, payload.parent_id,
                                      current_user.user.user_name)
    return R.ok(msg="修改成功")


@router.delete("/folder/{folder_ids}", summary="删除空目录")
async def delete_folders(
    folder_ids: str,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:delete"))],
):
    ids = [int(x.strip()) for x in folder_ids.split(",") if x.strip()]
    deleted = await FolderService.delete_folders(db, ids)
    return R.ok(msg=f"已删除 {deleted} 个目录")
```

> 写文件时把 `get_folders` 函数体写成 `return R.ok(data=await FolderService.list_folders(db), msg="查询成功")`（上面的三元表达式是排版噪音，勿照抄）。

- [ ] **Step 5: `app/services/file.py`（第一阶段：仅 list_files，后续任务继续加方法）**

```python
from datetime import datetime

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import SysApiKey, SysFile
from app.repositories.file import FileFolderRepository
from app.schemas.file import FilePageQuery


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("T", " ").replace("Z", ""))


class FileService:
    @staticmethod
    async def list_files(db: AsyncSession, query: FilePageQuery) -> dict:
        conditions = []
        if query.folder_id is not None:
            conditions.append(SysFile.folder_id == query.folder_id)
        if query.file_name:
            conditions.append(SysFile.file_name.like(f"%{query.file_name}%"))
        if query.category:
            conditions.append(SysFile.category == query.category)
        if query.visibility:
            conditions.append(SysFile.visibility == query.visibility)
        if query.source:
            conditions.append(SysFile.source == query.source)
        begin, end = _parse_time(query.begin_time), _parse_time(query.end_time)
        if begin:
            conditions.append(SysFile.create_time >= begin)
        if end:
            conditions.append(SysFile.create_time <= end)

        stmt = select(SysFile)
        if conditions:
            stmt = stmt.where(*conditions)
        total = (await db.execute(
            select(func.count()).select_from(SysFile).where(*conditions) if conditions
            else select(func.count()).select_from(SysFile)
        )).scalar_one()
        rows = list((await db.execute(
            stmt.order_by(SysFile.create_time.desc())
            .offset((query.page_num - 1) * query.page_size).limit(query.page_size)
        )).scalars().all())

        folder_map = {f.folder_id: f.folder_path for f in await FileFolderRepository(db).get_all()}
        key_ids = {r.api_key_id for r in rows if r.api_key_id}
        key_map: dict[int, str] = {}
        if key_ids:
            from sqlalchemy import select as _select
            keys = (await db.execute(_select(SysApiKey).where(SysApiKey.key_id.in_(key_ids)))).scalars().all()
            key_map = {k.key_id: k.key_name for k in keys}

        out = []
        for r in rows:
            d = r.model_dump()
            d["folder_path"] = folder_map.get(r.folder_id, "")
            d["api_key_name"] = key_map.get(r.api_key_id)
            out.append(d)
        return {"rows": out, "total": total}
```

- [ ] **Step 6: 注册路由**：router.py 加 `file` import 与

```python
api_v1_router.include_router(file.router, prefix="/system", tags=["文件管理"])
```

- [ ] **Step 7: 验证** `uv run python -m compileall app -q && echo OK`

- [ ] **Step 8: 记录变更（不提交）**

---

### Task B5: 文件元数据操作（改名/移动/删除/URL/文本/下载）

**Files:**
- Modify: `app/services/file.py`
- Modify: `app/api/v1/file.py`

**Interfaces:**
- Consumes: B3 `StorageService.get_config`、`minio.presign_get/public_object_url`。
- Produces:
  - `FileService.update_file / delete_files / build_urls / get_text`
  - 路由：`PUT /system/file/{file_id}`、`DELETE /system/file/{ids}`、`POST /system/file/urls`、`GET /system/file/{file_id}/text`、`GET /system/file/{file_id}/download`

- [ ] **Step 1: schemas 追加**（`app/schemas/file.py`）

```python
class FileUpdate(CamelModel):
    file_name: str | None = None
    folder_id: int | None = None


class FileUrlsIn(CamelModel):
    file_ids: list[int]
    download: bool = False
```

- [ ] **Step 2: `FileService` 追加方法**

```python
    @staticmethod
    async def update_file(db: AsyncSession, file_id: int, file_name: str | None,
                          folder_id: int | None, operator: str = "") -> None:
        repo = FileRepository(db)
        f = await repo.get_by_id(file_id)
        if not f:
            raise BusinessException("文件不存在")
        if file_name:
            f.file_name = file_name.strip()[:255] or f.file_name
        if folder_id is not None and folder_id != f.folder_id:
            folder = await FileFolderRepository(db).get_by_id(folder_id) if folder_id else None
            if folder_id and not folder:
                raise BusinessException("目标目录不存在")
            f.folder_id = folder_id
        f.update_by = operator
        await db.flush()

    @staticmethod
    async def delete_files(db: AsyncSession, redis, ids: list[int]) -> dict:
        cfg = await StorageService.get_config(db, redis, required=True)
        repo = FileRepository(db)
        client = minio.build_s3_client(cfg)
        deleted, failed = 0, []
        for fid in ids:
            f = await repo.get_by_id(fid)
            if not f:
                continue
            try:
                await minio.run_s3(client.delete_object, Bucket=f.bucket, Key=f.object_key)
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code not in ("NoSuchKey", "404"):
                    failed.append(f"{f.file_name}（{code or e}）")
                    continue
            if f.source == "api" and f.api_key_id:
                key = await ApiKeyRepository(db).get_by_id(f.api_key_id)
                if key:
                    key.used_bytes = max(0, key.used_bytes - f.file_size)
            await repo.hard_delete(fid)
            deleted += 1
        if failed:
            raise BusinessException(f"{deleted} 个已删除，{len(failed)} 个失败：{'；'.join(failed[:3])}")
        return {"deleted": deleted, "failed": []}

    @staticmethod
    async def build_urls(db: AsyncSession, redis, file_ids: list[int], download: bool = False) -> list[dict]:
        cfg = await StorageService.get_config(db, redis, required=True)
        client = minio.build_s3_client(cfg, public=True)
        repo = FileRepository(db)
        out = []
        expires = cfg.download_presign_expire_seconds
        for fid in file_ids:
            f = await repo.get_by_id(fid)
            if not f:
                continue
            if f.visibility == "public":
                out.append({"file_id": fid, "url": minio.public_object_url(cfg, f.bucket, f.object_key),
                            "is_public": True, "expires_at": None})
            else:
                url = await minio.run_s3(minio.presign_get, client, f.bucket, f.object_key, expires,
                                         f.file_name, download)
                expires_at = datetime.fromtimestamp(datetime.now().timestamp() + expires).isoformat(timespec="seconds")
                out.append({"file_id": fid, "url": url, "is_public": False, "expires_at": expires_at})
        return out

    TEXT_LIMIT = 256 * 1024

    @staticmethod
    async def get_text(db: AsyncSession, redis, file_id: int) -> dict:
        cfg = await StorageService.get_config(db, redis, required=True)
        repo = FileRepository(db)
        f = await repo.get_by_id(file_id)
        if not f:
            raise BusinessException("文件不存在")
        client = minio.build_s3_client(cfg)
        obj = await minio.run_s3(client.get_object, Bucket=f.bucket, Key=f.object_key)
        body = obj["Body"].read(FileService.TEXT_LIMIT + 1)
        return {"content": body[: FileService.TEXT_LIMIT].decode("utf-8", errors="replace"),
                "truncated": len(body) > FileService.TEXT_LIMIT}

    @staticmethod
    async def get_download_url(db: AsyncSession, redis, file_id: int) -> str:
        urls = await FileService.build_urls(db, redis, [file_id], download=True)
        if not urls:
            raise BusinessException("文件不存在")
        return urls[0]["url"]
```

- [ ] **Step 3: 路由追加（在 `/{file_id}` 系列之前注册 folders/urls 之类，FastAPI 按注册顺序匹配——`/urls` POST 与 `/{file_id}` 不同方法不冲突，但 `/folders`、`/upload/sessions` 必须在 `/{file_id}` 之前）**

```python
@router.put("/{file_id}", summary="重命名/移动文件")
async def update_file(
    file_id: int,
    payload: FileUpdate,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:edit"))],
):
    await FileService.update_file(db, file_id, payload.file_name, payload.folder_id, current_user.user.user_name)
    return R.ok(msg="修改成功")


@router.delete("/{file_ids}", summary="删除文件（MinIO 对象+元数据）")
async def delete_files(
    file_ids: str,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:delete"))],
):
    ids = [int(x.strip()) for x in file_ids.split(",") if x.strip()]
    return R.ok(data=await FileService.delete_files(db, redis, ids), msg="删除完成")


@router.post("/urls", summary="批量换取预览/下载链接")
async def file_urls(
    payload: FileUrlsIn,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:download"))],
):
    return R.ok(data=await FileService.build_urls(db, redis, payload.file_ids, payload.download), msg="查询成功")


@router.get("/{file_id}/text", summary="文本预览（最多 256KB）")
async def file_text(
    file_id: int,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:download"))],
):
    return R.ok(data=await FileService.get_text(db, redis, file_id), msg="查询成功")


@router.get("/{file_id}/download", summary="下载（302 到直链或签名链接）")
async def file_download(
    file_id: int,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:download"))],
):
    from fastapi.responses import RedirectResponse
    url = await FileService.get_download_url(db, redis, file_id)
    return RedirectResponse(url, status_code=302)
```

> `RedisDep`：在 `app/api/deps.py` 增加
> ```python
> from app.core.redis import get_redis as _get_redis
> RedisDep = Annotated[aioredis.Redis, Depends(_get_redis)]
> ```
> （顶部 `import redis.asyncio as aioredis`。）本任务所有需要 redis 的接口签名加 `redis: RedisDep`；B4 已写的接口不需要。

- [ ] **Step 4: 验证** `uv run python -m compileall app -q && echo OK`

- [ ] **Step 5: 记录变更（不提交）**

---

### Task B6: 上传会话服务 + 后台上传接口

**Files:**
- Modify: `app/schemas/file.py`（追加会话模型）
- Create: `app/services/upload.py`
- Modify: `app/api/v1/file.py`（追加 6 个 upload 路由，位置在 `/{file_id}` 之前）

**Interfaces:**
- Consumes: B2 `SysFileUpload`、B3 minio 工厂、B4 `UploadSessionRepository`。
- Produces:
  - `UploadService.init_session(db, redis, *, user_id, api_key_id, payload, actor_name) -> dict`
  - `UploadService.get_status / part_urls / complete / abort / active_sessions`
  - `schemas/file.py`：`UploadInit / PartUrlsIn / CompleteIn`
  - 路由：`POST /system/file/upload/sessions`、`GET /system/file/upload/sessions`、`GET /system/file/upload/sessions/{sid}`、`POST .../part-urls`、`POST .../complete`、`DELETE .../{sid}`

- [ ] **Step 1: schemas 追加**

```python
class UploadInit(CamelModel):
    file_name: str
    file_size: int
    mime_type: str | None = None
    folder_id: int = 0
    visibility: str | None = None
    folder_path: str | None = None  # 仅开放接口使用


class PartUrlsIn(CamelModel):
    part_numbers: list[int]


class CompleteIn(CamelModel):
    parts: list[dict] = []  # [{partNumber, etag}]；single 模式可空
```

- [ ] **Step 2: `app/services/upload.py`**

```python
import uuid
from datetime import datetime, timedelta

from botocore.exceptions import ClientError
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessException, ValidationException
from app.models.file import SysApiKey, SysFile, SysFileUpload
from app.repositories.file import FileFolderRepository, UploadSessionRepository
from app.repositories.api_key import ApiKeyRepository
from app.schemas.file import CompleteIn, PartUrlsIn, UploadInit
from app.services.folder import FolderService
from app.services.storage import StorageService
from app.utils import minio
from app.utils.file_utils import (
    build_object_key, category_of, file_ext_of, is_allowed_ext, part_count,
)


def _session_out(s: SysFileUpload, uploaded_parts: list[dict] | None = None) -> dict:
    d = s.model_dump()
    d["uploaded_parts"] = uploaded_parts or []
    return d


class UploadService:
    @staticmethod
    async def _cfg(db, redis):
        return await StorageService.get_config(db, redis, required=True)

    @staticmethod
    async def init_session(db: AsyncSession, redis, *, user_id: int | None, api_key_id: int | None,
                           payload: UploadInit, actor_name: str = "") -> dict:
        cfg = await UploadService._cfg(db, redis)
        if not is_allowed_ext(payload.file_name, cfg.allowed_extensions):
            raise ValidationException("该文件后缀不被允许上传")
        max_bytes = cfg.max_file_size_mb * 1024 * 1024
        if payload.file_size <= 0 or payload.file_size > max_bytes:
            raise ValidationException(f"文件大小超出限制（上限 {cfg.max_file_size_mb}MB）")

        folder_id = payload.folder_id
        if api_key_id:
            key = await ApiKeyRepository(db).get_by_id(api_key_id)
            if key and key.quota_bytes:
                if key.used_bytes + payload.file_size > key.quota_bytes:
                    raise ValidationException("超出该 API Key 的容量配额")
        if payload.folder_path:
            # 仅开放接口走目录路径（调用方已保证在命名空间内）
            folder_id = await FolderService.ensure_path(db, api_key_id, payload.folder_path)

        visibility = payload.visibility or cfg.default_visibility
        bucket = cfg.private_bucket if visibility == "private" else cfg.public_bucket
        object_key = build_object_key(payload.file_name)
        threshold = cfg.multipart_threshold_mb * 1024 * 1024
        mode = "single" if payload.file_size <= threshold else "multipart"
        p_size = payload.file_size if mode == "single" else cfg.part_size_mb * 1024 * 1024

        session = SysFileUpload(
            session_id=str(uuid.uuid4()),
            user_id=user_id,
            api_key_id=api_key_id,
            file_name=payload.file_name[:255],
            file_size=payload.file_size,
            mime_type=payload.mime_type or "application/octet-stream",
            folder_id=folder_id,
            visibility=visibility,
            bucket=bucket,
            object_key=object_key,
            mode=mode,
            part_size=p_size,
            expires_at=datetime.now() + timedelta(hours=cfg.upload_session_expire_hours),
        )
        client = minio.build_s3_client(cfg, public=True)
        if mode == "multipart":
            resp = await minio.run_s3(client.create_multipart_upload, Bucket=bucket, Key=object_key,
                                      ContentType=session.mime_type)
            session.upload_id = resp["UploadId"]
            session.status = "uploading"
        db.add(session)
        await db.flush()

        out = _session_out(session)
        out["part_count"] = 1 if mode == "single" else part_count(payload.file_size, p_size)
        out["concurrency"] = cfg.upload_concurrency
        if mode == "single":
            out["upload_url"] = await minio.run_s3(
                minio.presign_put, client, bucket, object_key, session.mime_type,
                cfg.upload_presign_expire_minutes * 60,
            )
            out["method"] = "PUT"
            out["headers"] = {"Content-Type": session.mime_type}
        return out

    @staticmethod
    async def _get_owned(db: AsyncSession, session_id: str, *, user_id: int | None,
                         api_key_id: int | None) -> SysFileUpload:
        repo = UploadSessionRepository(db)
        session = await repo.get_by_id(session_id)
        if not session:
            raise BusinessException("上传会话不存在")
        if user_id is not None and session.user_id != user_id:
            raise BusinessException("无权操作该上传会话")
        if api_key_id is not None and session.api_key_id != api_key_id:
            raise BusinessException("无权操作该上传会话")
        return session

    @staticmethod
    async def _list_parts(client, session: SysFileUpload) -> list[dict]:
        if session.mode != "multipart" or not session.upload_id:
            return []
        try:
            resp = await minio.run_s3(client.list_parts, Bucket=session.bucket, Key=session.object_key,
                                      UploadId=session.upload_id)
        except ClientError:
            return []
        return [{"part_number": p["PartNumber"], "etag": p["ETag"], "size": p.get("Size", 0)}
                for p in resp.get("Parts", [])]

    @staticmethod
    async def get_status(db: AsyncSession, redis, session_id: str, *, user_id, api_key_id) -> dict:
        session = await UploadService._get_owned(db, session_id, user_id=user_id, api_key_id=api_key_id)
        cfg = await UploadService._cfg(db, redis)
        parts: list[dict] = []
        if session.status in ("pending", "uploading") and session.expires_at < datetime.now():
            session.status = "expired"
            await db.flush()
        elif session.status == "uploading":
            parts = await UploadService._list_parts(minio.build_s3_client(cfg, public=True), session)
        out = _session_out(session, parts)
        out["part_count"] = 1 if session.mode == "single" else part_count(session.file_size, session.part_size)
        out["concurrency"] = cfg.upload_concurrency
        return out

    @staticmethod
    async def part_urls(db: AsyncSession, redis, session_id: str, payload: PartUrlsIn,
                        *, user_id, api_key_id) -> list[dict]:
        if not payload.part_numbers or len(payload.part_numbers) > 20:
            raise ValidationException("每次最多获取 20 个分片链接")
        session = await UploadService._get_owned(db, session_id, user_id=user_id, api_key_id=api_key_id)
        if session.mode != "multipart" or not session.upload_id:
            raise BusinessException("该会话不是分片上传")
        total = part_count(session.file_size, session.part_size)
        cfg = await UploadService._cfg(db, redis)
        client = minio.build_s3_client(cfg, public=True)
        out = []
        for n in sorted(set(payload.part_numbers)):
            if not 1 <= n <= total:
                raise ValidationException(f"分片号 {n} 超出范围 1~{total}")
            url = await minio.run_s3(minio.presign_part, client, session.bucket, session.object_key,
                                     session.upload_id, n, cfg.upload_presign_expire_minutes * 60)
            out.append({"part_number": n, "url": url})
        return out

    @staticmethod
    async def complete(db: AsyncSession, redis, session_id: str, payload: CompleteIn,
                       *, user_id, api_key_id) -> dict:
        session = await UploadService._get_owned(db, session_id, user_id=user_id, api_key_id=api_key_id)
        if session.status == "completed" and session.file_id:
            return {"file_id": session.file_id}
        if session.status not in ("pending", "uploading"):
            raise BusinessException(f"会话状态 {session.status}，无法完成")
        if session.expires_at < datetime.now():
            raise BusinessException("上传会话已过期，请重新上传")

        cfg = await UploadService._cfg(db, redis)
        client = minio.build_s3_client(cfg, public=True)
        if session.mode == "multipart":
            parts = payload.parts or await UploadService._list_parts(client, session)
            if not parts:
                raise ValidationException("没有已上传分片，无法合并")
            parts.sort(key=lambda p: p["partNumber"])
            await minio.run_s3(
                client.complete_multipart_upload,
                Bucket=session.bucket, Key=session.object_key, UploadId=session.upload_id,
                MultipartUpload={"Parts": [{"PartNumber": p["partNumber"], "ETag": p["etag"]} for p in parts]},
            )
        head = await minio.run_s3(client.head_object, Bucket=session.bucket, Key=session.object_key)
        actual_size = head["ContentLength"]
        if actual_size != session.file_size:
            raise BusinessException(f"对象大小 {actual_size} 与会话 {session.file_size} 不一致，请重传")

        f = SysFile(
            folder_id=session.folder_id,
            file_name=session.file_name,
            object_key=session.object_key,
            bucket=session.bucket,
            visibility=session.visibility,
            category=category_of(session.file_name, session.mime_type),
            mime_type=session.mime_type,
            file_ext=file_ext_of(session.file_name),
            file_size=actual_size,
            etag=str(head.get("ETag", "")).strip('"'),
            source="api" if api_key_id else "admin",
            api_key_id=api_key_id,
            uploader_id=user_id,
            uploader_name=actor if False else ("" if user_id is None else ""),
        )
        f.uploader_name = ""  # 由调用层在 open 接口填 Key 名，后台接口由路由层补用户昵称
        db.add(f)
        try:
            await db.flush()
            if api_key_id:
                key = await ApiKeyRepository(db).get_by_id(api_key_id)
                if key:
                    key.used_bytes += actual_size
            session.status = "completed"
            session.file_id = f.file_id
            await db.commit()  # 显式提交：写库失败时回滚刚传的对象，防孤儿
        except Exception:
            try:
                await minio.run_s3(client.delete_object, Bucket=session.bucket, Key=session.object_key)
            except Exception as e:  # noqa: BLE001
                logger.warning(f"清理孤儿对象失败 {session.object_key}: {e}")
            raise
        return {"file_id": f.file_id, "file_name": f.file_name, "file_size": f.file_size}

    @staticmethod
    async def abort(db: AsyncSession, redis, session_id: str, *, user_id, api_key_id) -> None:
        session = await UploadService._get_owned(db, session_id, user_id=user_id, api_key_id=api_key_id)
        cfg = await UploadService._cfg(db, redis)
        client = minio.build_s3_client(cfg, public=True)
        try:
            if session.mode == "multipart" and session.upload_id:
                await minio.run_s3(client.abort_multipart_upload, Bucket=session.bucket,
                                   Key=session.object_key, UploadId=session.upload_id)
            elif session.mode == "single":
                await minio.run_s3(client.delete_object, Bucket=session.bucket, Key=session.object_key)
        except ClientError as e:
            logger.warning(f"abort 对象失败 {session.object_key}: {e}")
        session.status = "aborted"
        await db.flush()

    @staticmethod
    async def active_sessions(db: AsyncSession, redis, *, user_id, api_key_id) -> list[dict]:
        sessions = await UploadSessionRepository(db).get_active(user_id=user_id, api_key_id=api_key_id)
        out = []
        for s in sessions:
            d = s.model_dump()
            d["part_count"] = 1 if s.mode == "single" else part_count(s.file_size, s.part_size)
            out.append(d)
        return out
```

> ⚠️ 上面 `f.uploader_name` 两行是示意错误，实际实现：`UploadService.complete` 增加参数 `actor_name: str = ""`，创建文件时直接 `uploader_name=actor_name`；后台路由传 `current_user.user.nick_name`，开放路由传 `key.key_name`。删掉那两行占位。

- [ ] **Step 3: `FolderService.ensure_path`**（供 open 接口的 `folder_path` 使用；B8 的 open 接口同样依赖）。在 `app/services/folder.py` 追加：

```python
    @staticmethod
    async def ensure_path(db: AsyncSession, root_folder_id: int | None, relative: str | None) -> int:
        """按相对路径逐级创建目录。root_folder_id=None 表示后台根目录。"""
        repo = FileFolderRepository(db)
        from app.utils.file_utils import normalize_relative_path
        parts = normalize_relative_path(relative)
        if root_folder_id:
            root = await repo.get_by_id(root_folder_id)
            if not root:
                raise BusinessException("API Key 命名空间目录不存在")
        else:
            root = None
        current = root
        for name in parts:
            child = await repo.get_child(current.folder_id if current else 0, name)
            current = child or await FolderService.create_folder(db, current.folder_id if current else 0, name)
        return current.folder_id if current else 0
```

- [ ] **Step 4: 路由追加**（`app/api/v1/file.py`，全部在 `/{file_id}` 之前注册）：

```python
@router.post("/upload/sessions", summary="初始化上传会话")
async def create_upload_session(
    payload: UploadInit,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
):
    data = await UploadService.init_session(db, redis, user_id=current_user.user.user_id, api_key_id=None,
                                            payload=payload)
    return R.ok(data=data, msg="会话已创建")


@router.get("/upload/sessions", summary="未完成上传会话（断点恢复）")
async def list_upload_sessions(
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
    status: str = "active",
):
    if status != "active":
        return R.ok(data=[], msg="查询成功")
    return R.ok(data=await UploadService.active_sessions(
        db, redis, user_id=current_user.user.user_id, api_key_id=None), msg="查询成功")


@router.get("/upload/sessions/{session_id}", summary="会话状态+已传分片")
async def upload_session_status(
    session_id: str,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
):
    return R.ok(data=await UploadService.get_status(
        db, redis, session_id, user_id=current_user.user.user_id, api_key_id=None), msg="查询成功")


@router.post("/upload/sessions/{session_id}/part-urls", summary="获取分片预签名 URL（≤20/次）")
async def upload_part_urls(
    session_id: str,
    payload: PartUrlsIn,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
):
    return R.ok(data=await UploadService.part_urls(
        db, redis, session_id, payload, user_id=current_user.user.user_id, api_key_id=None), msg="查询成功")


@router.post("/upload/sessions/{session_id}/complete", summary="完成上传")
async def complete_upload(
    session_id: str,
    payload: CompleteIn,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
):
    data = await UploadService.complete(db, redis, session_id, payload,
                                        user_id=current_user.user.user_id, api_key_id=None,
                                        actor_name=current_user.user.nick_name)
    return R.ok(data=data, msg="上传完成")


@router.delete("/upload/sessions/{session_id}", summary="放弃上传")
async def abort_upload(
    session_id: str,
    db: DbSession,
    redis: RedisDep,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:upload"))],
):
    await UploadService.abort(db, redis, session_id, user_id=current_user.user.user_id, api_key_id=None)
    return R.ok(msg="已放弃")
```

- [ ] **Step 5: 验证** `uv run python -m compileall app -q && echo OK`

- [ ] **Step 6: 记录变更（不提交）**

---

### Task B7: API Key 服务 + 管理接口

**Files:**
- Create: `app/repositories/api_key.py`
- Create: `app/schemas/api_key.py`
- Create: `app/services/api_key.py`
- Create: `app/api/v1/api_key.py`
- Modify: `app/api/v1/router.py`

**Interfaces:**
- Consumes: B2 `SysApiKey`、B4 `FolderService.create_system_folder`。
- Produces:
  - `ApiKeyRepository.get_by_access_key`
  - `ApiKeyService.list_keys / create_key / update_key / reset_key / delete_keys / to_out`
  - 路由：`GET /system/api-key/list`、`POST /system/api-key`、`PUT /system/api-key`、`POST /system/api-key/{key_id}/reset`、`DELETE /system/api-key/{ids}`

- [ ] **Step 1: `app/repositories/api_key.py`**

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.file import SysApiKey
from app.repositories.base import BaseRepository


class ApiKeyRepository(BaseRepository[SysApiKey]):
    def __init__(self, db: AsyncSession):
        super().__init__(SysApiKey, db)

    async def get_by_access_key(self, access_key: str) -> SysApiKey | None:
        result = await self.db.execute(select(SysApiKey).where(SysApiKey.access_key == access_key))
        return result.scalar_one_or_none()
```

- [ ] **Step 2: `app/schemas/api_key.py`**

```python
from datetime import datetime

from app.schemas.base import CamelModel, PageQuery

VALID_SCOPES = {"upload", "download", "list", "delete"}


class ApiKeyPageQuery(PageQuery):
    key_name: str | None = None
    status: str | None = None


class ApiKeyCreate(CamelModel):
    key_name: str
    scopes: list[str]
    folder_name: str | None = None  # 命名空间目录名，缺省 API-<key_name>
    quota_mb: int = 0               # 0=不限
    expires_at: datetime | None = None
    remark: str | None = None


class ApiKeyUpdate(CamelModel):
    key_id: int
    key_name: str | None = None
    scopes: list[str] | None = None
    quota_mb: int | None = None
    expires_at: datetime | None = None
    status: str | None = None
    remark: str | None = None
```

- [ ] **Step 3: `app/services/api_key.py`**

```python
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import BusinessException, ValidationException
from app.models.file import SysApiKey, SysFileUpload
from app.repositories.api_key import ApiKeyRepository
from app.repositories.file import FileFolderRepository, UploadSessionRepository
from app.schemas.api_key import ApiKeyCreate, ApiKeyUpdate, VALID_SCOPES
from app.services.folder import FolderService
from app.utils.file_utils import generate_access_key, generate_secret_key, hash_api_secret, mask_secret


def _scopes_str(scopes: list[str]) -> str:
    invalid = set(scopes) - VALID_SCOPES
    if invalid:
        raise ValidationException(f"非法权限：{','.join(invalid)}")
    if not scopes:
        raise ValidationException("至少勾选一个权限")
    return ",".join(sorted(set(scopes)))


class ApiKeyService:
    @staticmethod
    def to_out(key: SysApiKey) -> dict:
        d = key.model_dump()
        d["scopes"] = [s for s in (key.scopes or "").split(",") if s]
        d["quota_mb"] = key.quota_bytes // (1024 * 1024)
        return d

    @staticmethod
    async def list_keys(db: AsyncSession, query) -> dict:
        from sqlalchemy import func, select
        from app.models.file import SysApiKey as K
        conditions = []
        if query.key_name:
            conditions.append(K.key_name.like(f"%{query.key_name}%"))
        if query.status:
            conditions.append(K.status == query.status)
        stmt = select(K)
        if conditions:
            stmt = stmt.where(*conditions)
        total = (await db.execute(
            select(func.count()).select_from(K).where(*conditions) if conditions
            else select(func.count()).select_from(K))).scalar_one()
        rows = list((await db.execute(
            stmt.order_by(K.key_id.desc()).offset((query.page_num - 1) * query.page_size)
            .limit(query.page_size))).scalars().all())
        return {"rows": [ApiKeyService.to_out(r) for r in rows], "total": total}

    @staticmethod
    async def create_key(db: AsyncSession, payload: ApiKeyCreate, operator: str = "") -> dict:
        repo = ApiKeyRepository(db)
        scopes = _scopes_str(payload.scopes)
        secret = generate_secret_key()
        key = SysApiKey(
            key_name=payload.key_name.strip()[:64],
            access_key=generate_access_key(),
            secret_hash=hash_api_secret(secret),
            secret_hint=mask_secret(secret),
            scopes=scopes,
            quota_bytes=max(0, payload.quota_mb) * 1024 * 1024,
            expires_at=payload.expires_at,
            status="0",
            create_by=operator,
            remark=payload.remark,
        )
        # access_key 撞库极小概率，重试 3 次
        for _ in range(3):
            if not await repo.get_by_access_key(key.access_key):
                break
            key.access_key = generate_access_key()
        db.add(key)
        await db.flush()
        ns_name = (payload.folder_name or f"API-{key.key_name}").strip()[:120]
        folder = await FolderService.create_system_folder(db, ns_name)
        key.folder_id = folder.folder_id
        await db.flush()
        return {"key": ApiKeyService.to_out(key), "secret": secret}

    @staticmethod
    async def update_key(db: AsyncSession, payload: ApiKeyUpdate, operator: str = "") -> None:
        repo = ApiKeyRepository(db)
        key = await repo.get_by_id(payload.key_id)
        if not key:
            raise BusinessException("API Key 不存在")
        if payload.key_name:
            key.key_name = payload.key_name.strip()[:64]
        if payload.scopes is not None:
            key.scopes = _scopes_str(payload.scopes)
        if payload.quota_mb is not None:
            quota = max(0, payload.quota_mb) * 1024 * 1024
            if quota and quota < key.used_bytes:
                raise ValidationException("配额不能低于已用容量")
            key.quota_bytes = quota
        if payload.expires_at is not None:
            key.expires_at = payload.expires_at
        if payload.status is not None:
            key.status = payload.status
        if payload.remark is not None:
            key.remark = payload.remark
        key.update_by = operator
        await db.flush()

    @staticmethod
    async def reset_key(db: AsyncSession, key_id: int, operator: str = "") -> dict:
        repo = ApiKeyRepository(db)
        key = await repo.get_by_id(key_id)
        if not key:
            raise BusinessException("API Key 不存在")
        secret = generate_secret_key()
        key.secret_hash = hash_api_secret(secret)
        key.secret_hint = mask_secret(secret)
        key.update_by = operator
        await db.flush()
        return {"key_id": key.key_id, "secret": secret}

    @staticmethod
    async def delete_keys(db: AsyncSession, ids: list[int]) -> int:
        repo = ApiKeyRepository(db)
        session_repo = UploadSessionRepository(db)
        deleted = 0
        for kid in ids:
            key = await repo.get_by_id(kid)
            if not key:
                continue
            # 未完成会话标记过期，由清理任务 abort
            for s in await session_repo.get_active(api_key_id=kid):
                s.status = "expired"
            await repo.hard_delete(kid)
            deleted += 1
        return deleted
```

- [ ] **Step 4: `app/api/v1/api_key.py`**

```python
from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import DbSession, require_permission
from app.core.response import R
from app.schemas.api_key import ApiKeyCreate, ApiKeyPageQuery, ApiKeyUpdate
from app.schemas.common import CurrentUser
from app.services.api_key import ApiKeyService

router = APIRouter(prefix="/api-key", tags=["API 密钥"])


@router.get("/list", summary="API Key 分页列表")
async def list_keys(
    query: Annotated[ApiKeyPageQuery, Depends()],
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:key:list"))],
):
    return R.page(rows=(r := await ApiKeyService.list_keys(db, query))["rows"],
                  total=r["total"], page_num=query.page_num, page_size=query.page_size)


@router.post("", summary="创建 API Key（一次性返回完整密钥）")
async def create_key(
    payload: ApiKeyCreate,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:key:add"))],
):
    return R.ok(data=await ApiKeyService.create_key(db, payload, current_user.user.user_name), msg="创建成功")


@router.put("", summary="编辑 API Key")
async def update_key(
    payload: ApiKeyUpdate,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:key:edit"))],
):
    await ApiKeyService.update_key(db, payload, current_user.user.user_name)
    return R.ok(msg="修改成功")


@router.post("/{key_id}/reset", summary="重置密钥")
async def reset_key(
    key_id: int,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:key:reset"))],
):
    return R.ok(data=await ApiKeyService.reset_key(db, key_id, current_user.user.user_name), msg="重置成功")


@router.delete("/{key_ids}", summary="删除 API Key（已上传文件保留）")
async def delete_keys(
    key_ids: str,
    db: DbSession,
    current_user: Annotated[CurrentUser, Depends(require_permission("file:key:delete"))],
):
    ids = [int(x.strip()) for x in key_ids.split(",") if x.strip()]
    deleted = await ApiKeyService.delete_keys(db, ids)
    return R.ok(msg=f"已删除 {deleted} 个 Key")
```

> `list_keys` 里的海象表达式写法可读性差，实现时改为：
> ```python
> result = await ApiKeyService.list_keys(db, query)
> return R.page(rows=result["rows"], total=result["total"], page_num=query.page_num, page_size=query.page_size)
> ```

- [ ] **Step 5: 注册路由**：router.py 加

```python
api_v1_router.include_router(api_key.router, prefix="/system", tags=["API 密钥"])
```

- [ ] **Step 6: 验证** `uv run python -m compileall app -q && echo OK`，记录变更（不提交）。

---

### Task B8: 开放接口（API Key 鉴权 + /open/file）

**Files:**
- Create: `app/api/open_deps.py`
- Create: `app/api/v1/open_file.py`
- Modify: `app/api/v1/router.py`

**Interfaces:**
- Consumes: B6 UploadService、B5 FileService、B7 ApiKeyRepository、B4 FolderService.ensure_path。
- Produces:
  - `open_deps.get_api_key(request, db) -> SysApiKey`、`open_deps.require_scope(scope)`、`ApiKeyDep`
  - 路由：`POST /api/v1/open/file/upload/sessions`、`GET .../upload/sessions`、`GET .../upload/sessions/{sid}`、`POST .../part-urls`、`POST .../complete`、`DELETE .../{sid}`、`GET .../list`、`GET .../{file_id}`、`GET .../{file_id}/download`、`DELETE .../{file_id}`

- [ ] **Step 1: `app/api/open_deps.py`**

```python
import hmac
from datetime import datetime
from typing import Annotated, Callable

from fastapi import Depends, Request

from app.api.deps import DbSession
from app.core.exceptions import AuthException, PermissionException
from app.models.file import SysApiKey
from app.repositories.api_key import ApiKeyRepository
from app.utils.file_utils import hash_api_secret, split_api_key


async def get_api_key(request: Request, db: DbSession) -> SysApiKey:
    raw = request.headers.get("Authorization", "")
    if not raw.startswith("Bearer "):
        raise AuthException("缺少 API Key")
    try:
        access_key, secret = split_api_key(raw[7:])
    except ValueError as exc:
        raise AuthException(str(exc)) from exc
    key = await ApiKeyRepository(db).get_by_access_key(access_key)
    if not key or key.status != "0":
        raise AuthException("API Key 无效或已停用")
    if not hmac.compare_digest(key.secret_hash, hash_api_secret(secret)):
        raise AuthException("API Key 密钥不正确")
    if key.expires_at and key.expires_at < datetime.now():
        raise AuthException("API Key 已过期")
    key.last_used_at = datetime.now()
    key.last_used_ip = request.client.host if request.client else ""
    await db.flush()
    return key


ApiKeyDep = Annotated[SysApiKey, Depends(get_api_key)]


def require_scope(scope: str) -> Callable:
    async def checker(key: ApiKeyDep) -> SysApiKey:
        if scope not in [s for s in (key.scopes or "").split(",") if s]:
            raise PermissionException(f"该 API Key 缺少权限: {scope}")
        return key
    return checker
```

- [ ] **Step 2: `app/api/v1/open_file.py`**（要点：所有接口经 `require_scope` 校验；命名空间隔离用「文件所在目录的 folder_path 必须等于或位于 Key 根目录之下」）

```python
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import RedirectResponse

from app.api.deps import DbSession
from app.api.open_deps import ApiKeyDep, require_scope
from app.core.exceptions import BusinessException, PermissionException
from app.core.response import R
from app.schemas.file import CompleteIn, PartUrlsIn, UploadInit
from app.schemas.api_key import ApiKeyPageQuery  # list 复用分页模型不合适，见下
from app.services.file import FileService
from app.services.folder import FolderService
from app.services.upload import UploadService
from app.utils.minio import public_object_url
from app.utils.minio import build_s3_client, presign_get, run_s3
from app.services.storage import StorageService

router = APIRouter(prefix="/open/file", tags=["开放文件服务"])

NAMESPACE_ROOT = "API-Key"  # 占位：命名空间根目录由 key.folder_id 决定


async def _ensure_in_namespace(db, key, file) -> None:
    from app.repositories.file import FileFolderRepository
    folders = {f.folder_id: f for f in await FileFolderRepository(db).get_all()}
    root = folders.get(key.folder_id)
    folder = folders.get(file.folder_id)
    if not root or not folder:
        raise PermissionException("文件不在该 API Key 命名空间内")
    if folder.folder_path != root.folder_path and not folder.folder_path.startswith(root.folder_path + "/"):
        raise PermissionException("文件不在该 API Key 命名空间内")
```

列表接口（分页 + `folder_path` 相对路径过滤）：

```python
@router.get("/list", summary="命名空间内文件列表")
async def open_list(
    db: DbSession,
    key: Annotated[object, Depends(require_scope("list"))],
    folder_path: str | None = None,
    file_name: str | None = None,
    page_num: int = 1,
    page_size: int = 10,
):
    from app.repositories.file import FileRepository
    from sqlalchemy import func, select
    from app.models.file import SysFile

    folder_id = await FolderService.ensure_path(db, key.folder_id, folder_path) if folder_path else None
    if folder_id is not None:
        conditions = [SysFile.folder_id == folder_id]
    else:
        # 命名空间子树：所有 folder_path 以根路径开头的目录
        from app.repositories.file import FileFolderRepository
        folders = await FileFolderRepository(db).get_all()
        root = next((f for f in folders if f.folder_id == key.folder_id), None)
        if not root:
            raise BusinessException("API Key 命名空间目录不存在")
        ids = [f.folder_id for f in folders
               if f.folder_path == root.folder_path or f.folder_path.startswith(root.folder_path + "/")]
        conditions = [SysFile.folder_id.in_(ids)]
    if file_name:
        conditions.append(SysFile.file_name.like(f"%{file_name}%"))
    total = (await db.execute(select(func.count()).select_from(SysFile).where(*conditions))).scalar_one()
    rows = list((await db.execute(
        select(SysFile).where(*conditions).order_by(SysFile.create_time.desc())
        .offset((page_num - 1) * page_size).limit(page_size))).scalars().all())
    return R.page(rows=[r.model_dump() for r in rows], total=total, page_num=page_num, page_size=page_size)
```

上传族接口（与后台同构，把 `user_id=None, api_key_id=key.key_id, actor_name=key.key_name` 传入 UploadService，`UploadInit.folder_path` 由 `FolderService.ensure_path(db, key.folder_id, payload.folder_path)` 解析——B6 的 `init_session` 已实现该分支）：

```python
@router.post("/upload/sessions", summary="初始化上传（scope=upload）")
async def open_upload_init(
    payload: UploadInit,
    db: DbSession,
    key: Annotated[object, Depends(require_scope("upload"))],
):
    data = await UploadService.init_session(db, None, user_id=None, api_key_id=key.key_id,
                                            payload=payload, actor_name=key.key_name)
    return R.ok(data=data, msg="会话已创建")
```

> ⚠️ `UploadService.init_session` 内部需要 redis 取配置。open 路由没有全局 redis 依赖时，直接注入 `RedisDep`（B5 已加到 deps），所有 open 上传接口签名加 `redis: RedisDep` 并传给 UploadService；`init_session` 调用改为 `await UploadService.init_session(db, redis, ...)`。status/part-urls/complete/abort 同理。

其余接口（照 B6 后台版本逐个镜像，仅鉴权与归属参数不同）：

```python
@router.get("/upload/sessions", summary="当前 Key 未完成会话")
@router.get("/upload/sessions/{session_id}", summary="会话状态+已传分片")
@router.post("/upload/sessions/{session_id}/part-urls", summary="获取分片 URL")
@router.post("/upload/sessions/{session_id}/complete", summary="完成上传")
@router.delete("/upload/sessions/{session_id}", summary="放弃上传")
```

详情/下载/删除：

```python
@router.get("/{file_id}", summary="文件详情+下载链接（scope=list）")
async def open_file_detail(file_id: int, db: DbSession, redis: RedisDep,
                           key: Annotated[object, Depends(require_scope("list"))]):
    f = await FileRepository(db).get_by_id(file_id)
    if not f:
        raise BusinessException("文件不存在")
    await _ensure_in_namespace(db, key, f)
    cfg = await StorageService.get_config(db, redis, required=True)
    if f.visibility == "public":
        url, is_public, expires_at = public_object_url(cfg, f.bucket, f.object_key), True, None
    else:
        client = build_s3_client(cfg, public=True)
        url = await run_s3(presign_get, client, f.bucket, f.object_key,
                           cfg.download_presign_expire_seconds, f.file_name, False)
        is_public, expires_at = False, None
    data = f.model_dump()
    data.update({"url": url, "is_public": is_public, "expires_at": expires_at})
    return R.ok(data=data, msg="查询成功")


@router.get("/{file_id}/download", summary="下载（scope=download）")
async def open_file_download(file_id: int, db: DbSession, redis: RedisDep,
                             key: Annotated[object, Depends(require_scope("download"))]):
    f = await FileRepository(db).get_by_id(file_id)
    if not f:
        raise BusinessException("文件不存在")
    await _ensure_in_namespace(db, key, f)
    cfg = await StorageService.get_config(db, redis, required=True)
    if f.visibility == "public":
        url = public_object_url(cfg, f.bucket, f.object_key)
    else:
        client = build_s3_client(cfg, public=True)
        url = await run_s3(presign_get, client, f.bucket, f.object_key,
                           cfg.download_presign_expire_seconds, f.file_name, True)
    return RedirectResponse(url, status_code=302)


@router.delete("/{file_id}", summary="删除文件（scope=delete，回退配额）")
async def open_file_delete(file_id: int, db: DbSession, redis: RedisDep,
                           key: Annotated[object, Depends(require_scope("delete"))]):
    f = await FileRepository(db).get_by_id(file_id)
    if not f:
        raise BusinessException("文件不存在")
    await _ensure_in_namespace(db, key, f)
    result = await FileService.delete_files(db, redis, [file_id])
    return R.ok(data=result, msg="删除完成")
```

- [ ] **Step 3: 注册路由**：router.py 加 `open_file` import 与 `api_v1_router.include_router(open_file.router, tags=["开放文件服务"])`（prefix 已在 router 内）。同时在 `app/main.py` 的 `public_paths` 之外确认：open 接口**需要** API Key 鉴权，不加白名单（OpenAPI 的 Bearer security 提示无关紧要，可忽略）。

- [ ] **Step 4: 验证** `uv run python -m compileall app -q && echo OK`，记录变更（不提交）。

---

### Task B9: 头像 / 个人资料 / 旧上传迁移

**Files:**
- Modify: `app/services/file.py`（小文件中转）
- Modify: `app/schemas/user.py`（ProfileUpdate）
- Modify: `app/api/v1/user.py`（avatar 真实化 + profile/info）
- Modify: `app/api/v1/common.py`（/upload 迁 MinIO）

**Interfaces:**
- Produces:
  - `FileService.upload_public(db, redis, upload, *, source, folder_name, max_bytes, mime_prefix, uploader_id, uploader_name) -> SysFile`（后端中转写公开桶）
  - `POST /api/v1/system/file/avatar`（`file:upload`，返回 `{url, file_id}`）
  - `POST /api/v1/system/user/profile/avatar`（仅登录，同时更新 `sys_user.avatar`，返回 `{avatar}`）
  - `PUT /api/v1/system/user/profile/info`（本人更新 nickName/email/phonenumber/avatar）
  - `POST /api/v1/upload`（保留返回字段，内部写公开桶 + `sys_file`）

- [ ] **Step 1: `FileService.upload_public`** 追加到 `app/services/file.py`：

```python
    AVATAR_MAX_BYTES = 2 * 1024 * 1024

    @staticmethod
    async def upload_public(db: AsyncSession, redis, upload, *, source: str, folder_name: str,
                            max_bytes: int, mime_prefix: str | None, uploader_id: int | None,
                            uploader_name: str) -> SysFile:
        """后端中转小文件 → 公开桶 + sys_file（头像/旧通用上传例外链路）"""
        from app.services.folder import FolderService
        from app.services.storage import StorageService

        content = await upload.read(max_bytes + 1)
        if len(content) > max_bytes:
            raise ValidationException(f"文件超过 {max_bytes // (1024 * 1024)}MB 限制")
        if not content:
            raise ValidationException("文件内容为空")
        mime = upload.content_type or ""
        if mime_prefix and not mime.startswith(mime_prefix):
            raise ValidationException("仅支持图片文件")
        cfg = await StorageService.get_config(db, redis, required=True)
        original = upload.filename or "file"
        object_key = build_object_key(original)
        client = minio.build_s3_client(cfg)
        await minio.run_s3(client.put_object, Bucket=cfg.public_bucket, Key=object_key,
                           Body=content, ContentType=mime or "application/octet-stream")
        try:
            folder = await FolderService.create_system_folder(db, folder_name)
            f = SysFile(
                folder_id=folder.folder_id,
                file_name=original[:255],
                object_key=object_key,
                bucket=cfg.public_bucket,
                visibility="public",
                category=category_of(original, mime),
                mime_type=mime,
                file_ext=file_ext_of(original),
                file_size=len(content),
                source=source,
                uploader_id=uploader_id,
                uploader_name=uploader_name[:64],
            )
            db.add(f)
            await db.flush()
            return f
        except Exception:
            await minio.run_s3(client.delete_object, Bucket=cfg.public_bucket, Key=object_key)
            raise
```

- [ ] **Step 2: `app/schemas/user.py` 追加**

```python
class ProfileUpdate(CamelModel):
    """个人资料：仅允许改这四个字段"""
    nick_name: str | None = None
    email: str | None = None
    phonenumber: str | None = None
    avatar: str | None = None
```

- [ ] **Step 3: `app/api/v1/user.py`**

替换原占位 `POST /profile/avatar`，并新增 `PUT /profile/info`：

```python
@router.post("/profile/avatar", summary="上传头像（本人）")
async def upload_avatar(
    db: DbSession,
    redis: RedisDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(...),
):
    """中转写公开桶（source=avatar），并更新 sys_user.avatar"""
    from app.services.file import FileService
    f = await FileService.upload_public(
        db, redis, file, source="avatar", folder_name="头像",
        max_bytes=FileService.AVATAR_MAX_BYTES, mime_prefix="image/",
        uploader_id=current_user.user.user_id, uploader_name=current_user.user.user_name,
    )
    from app.utils.minio import public_object_url
    from app.services.storage import StorageService
    cfg = await StorageService.get_config(db, redis, required=True)
    url = public_object_url(cfg, f.bucket, f.object_key)
    if len(url) > 500:
        raise BusinessException("头像 URL 过长，请检查公开地址配置")
    from app.repositories.user import UserRepository
    await UserRepository(db).update_by_id(current_user.user.user_id, {"avatar": url})
    return R.ok(data={"avatar": url, "file_id": f.file_id}, msg="头像上传成功")


@router.put("/profile/info", summary="修改个人资料")
async def update_profile_info(
    payload: ProfileUpdate,
    db: DbSession,
    current_user: CurrentUserDep,
):
    from app.repositories.user import UserRepository
    data = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not data:
        return R.fail(msg="没有需要修改的字段")
    if data.get("nick_name"):
        data["nick_name"] = data["nick_name"].strip()[:30]
    await UserRepository(db).update_by_id(current_user.user.user_id, data)
    return R.ok(msg="资料已更新")
```

- [ ] **Step 4: `app/api/v1/common.py` 替换 `POST /upload` 实现**（保留路径/返回字段；旧 `GET /download/{path}` 原样保留服务历史文件）：

```python
@router.post("/upload", summary="文件上传（迁移至 MinIO 公开桶）")
async def upload_file(
    db: DbSession,
    redis: RedisDep,
    current_user: CurrentUserDep,
    file: UploadFile = File(...),
):
    """兼容旧返回结构：fileName/url/newFileName/originalFilename；内部写公开桶 + sys_file"""
    from app.services.file import FileService
    from app.utils.minio import public_object_url
    from app.services.storage import StorageService

    f = await FileService.upload_public(
        db, redis, file, source="admin", folder_name="通用上传",
        max_bytes=get_upload_config().max_size * 1024 * 1024, mime_prefix=None,
        uploader_id=current_user.user.user_id, uploader_name=current_user.user.nick_name,
    )
    cfg = await StorageService.get_config(db, redis, required=True)
    return R.ok(
        data={
            "fileName": f.file_name,
            "url": public_object_url(cfg, f.bucket, f.object_key),
            "newFileName": f.object_key.rsplit("/", 1)[-1],
            "originalFilename": f.file_name,
        },
        msg="上传成功",
    )
```
（`get_upload_config` 来自 `app.core.config`；`LocalStorage` 导入可删。）

- [ ] **Step 5: 验证** `uv run python -m compileall app -q && echo OK`，记录变更（不提交）。

---

### Task B10: 菜单/权限 SQL + 清理任务 + 全量编译

**Files:**
- Create: `sql/menu_file_service.sql`
- Create: `app/tasks/file_cleanup.py`
- Modify: `app/tasks/scheduler.py`
- Modify: `app/main.py`

**Interfaces:**
- Produces: 菜单种子（admin 自动可见）；`fileUploadCleanup` 任务 + 每小时 interval。

- [ ] **Step 1: `sql/menu_file_service.sql`**

```sql
-- 文件服务菜单与按钮权限（挂「系统工具」目录下；管理员角色自动可见，普通角色在角色管理勾选）
SET @tool_id = (SELECT menu_id FROM sys_menu WHERE menu_name = '系统工具' AND menu_type = 'M' LIMIT 1);

INSERT INTO sys_menu (menu_name, parent_id, order_num, path, component, query, route_name, is_frame, is_cache, menu_type, visible, status, perms, icon, create_by, create_time, remark)
VALUES ('文件服务', @tool_id, 5, 'file', NULL, '', '', 1, 0, 'M', '0', '0', '', 'file', 'admin', NOW(), '文件服务目录');
SET @file_dir = LAST_INSERT_ID();

INSERT INTO sys_menu (menu_name, parent_id, order_num, path, component, query, route_name, is_frame, is_cache, menu_type, visible, status, perms, icon, create_by, create_time)
VALUES
('文件管理', @file_dir, 1, '/file', 'file/index', '', '', 1, 0, 'C', '0', '0', 'file:list', 'folder', 'admin', NOW()),
('存储设置', @file_dir, 2, '/file/storage', 'file/storage', '', '', 1, 0, 'C', '0', '0', 'file:config', 'storage', 'admin', NOW()),
('API 密钥', @file_dir, 3, '/file/api-key', 'file/api-key', '', '', 1, 0, 'C', '0', '0', 'file:key:list', 'key', 'admin', NOW());
SET @file_page   = (SELECT menu_id FROM sys_menu WHERE perms = 'file:list' LIMIT 1);
SET @file_sto    = (SELECT menu_id FROM sys_menu WHERE perms = 'file:config' LIMIT 1);
SET @file_key    = (SELECT menu_id FROM sys_menu WHERE perms = 'file:key:list' LIMIT 1);

INSERT INTO sys_menu (menu_name, parent_id, order_num, path, component, query, route_name, is_frame, is_cache, menu_type, visible, status, perms, icon, create_by, create_time)
VALUES
('文件上传',   @file_page, 1, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:upload',   '#', 'admin', NOW()),
('文件下载',   @file_page, 2, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:download', '#', 'admin', NOW()),
('文件编辑',   @file_page, 3, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:edit',     '#', 'admin', NOW()),
('文件删除',   @file_page, 4, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:delete',   '#', 'admin', NOW()),
('存储保存',   @file_sto,  1, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:config',   '#', 'admin', NOW()),
('Key 查询',  @file_key,  1, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:key:list',   '#', 'admin', NOW()),
('Key 新增',  @file_key,  2, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:key:add',    '#', 'admin', NOW()),
('Key 编辑',  @file_key,  3, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:key:edit',   '#', 'admin', NOW()),
('Key 删除',  @file_key,  4, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:key:delete', '#', 'admin', NOW()),
('Key 重置',  @file_key,  5, '', NULL, '', '', 1, 0, 'F', '0', '0', 'file:key:reset',  '#', 'admin', NOW());
```

执行前先 `SELECT menu_id, menu_name FROM sys_menu WHERE menu_name='系统工具' AND menu_type='M';` 确认存在；若名为其他（如「系统工具」被改名），按实际改 SQL。执行（需用户确认）：
```bash
mysql -u<user> -p <db> < sql/menu_file_service.sql
```
或让用户在客户端执行。

- [ ] **Step 2: `app/tasks/file_cleanup.py`**

```python
from datetime import datetime

from botocore.exceptions import ClientError
from loguru import logger

from app.core.database import async_session
from app.core.redis import get_redis
from app.repositories.file import UploadSessionRepository
from app.services.storage import StorageService
from app.tasks.scheduler import register_task
from app.utils import minio


@register_task("fileUploadCleanup")
async def file_upload_cleanup():
    """每小时：abort 过期上传会话，清理未确认对象"""
    async with async_session() as db:
        try:
            cfg = await StorageService.get_config(db, get_redis())
        except Exception as e:  # noqa: BLE001
            logger.warning(f"文件清理任务读取存储配置失败: {e}")
            return
        if not cfg:
            return
        repo = UploadSessionRepository(db)
        sessions = await repo.get_expired(datetime.now())
        if not sessions:
            return
        client = minio.build_s3_client(cfg)
        for s in sessions:
            try:
                if s.mode == "multipart" and s.upload_id:
                    await minio.run_s3(client.abort_multipart_upload, Bucket=s.bucket,
                                       Key=s.object_key, UploadId=s.upload_id)
                else:
                    await minio.run_s3(client.delete_object, Bucket=s.bucket, Key=s.object_key)
            except ClientError as e:
                logger.warning(f"清理会话对象失败 {s.object_key}: {e}")
            s.status = "expired"
        await db.commit()
        logger.info(f"fileUploadCleanup: 清理 {len(sessions)} 个过期上传会话")
```

- [ ] **Step 3: `app/tasks/scheduler.py`** 在 `init_scheduler` 中 `await cls.load_jobs_from_db()` 之后追加：

```python
        # 系统内置 interval 任务（不入库，固定每小时）
        from app.tasks.file_cleanup import file_upload_cleanup
        cls._scheduler.add_job(file_upload_cleanup, "interval", hours=1,
                               id="system-file-upload-cleanup", name="过期上传会话清理",
                               replace_existing=True)
```

- [ ] **Step 4: `app/main.py`** 在 `import app.tasks.examples` 旁加：

```python
import app.tasks.file_cleanup  # noqa: F401  注册文件上传清理任务
```

- [ ] **Step 5: 全量验证**

```bash
uv run python -m compileall app -q && echo OK
uv run pytest tests/unit/test_file_utils.py --confcutdir=tests/unit -q
```

- [ ] **Step 6: 记录变更（不提交）。后端任务全部完成后向用户汇报：改动文件清单 + 需要用户做的事（重启后端、执行 SQL、配置存储设置）。**

---

# 前端任务

### Task F1: 类型 + API 封装 + 列设置 defaultHiddenKeys

**Files:**
- Create: `src/types/file.ts`、`src/types/storage.ts`、`src/types/apiKey.ts`
- Create: `src/api/file.ts`、`src/api/storage.ts`、`src/api/apiKey.ts`、`src/api/profile.ts`
- Modify: `src/components/ColumnSettings.tsx`
- Modify: `src/components/layout/menuIcons.ts`

**Interfaces:**
- Produces: F2-F8 全部消费的类型与 API 函数（签名见代码）。

- [ ] **Step 1: `src/types/file.ts`**

```ts
export type FileCategory = 'image' | 'document' | 'video' | 'audio' | 'archive' | 'other'
export type FileVisibility = 'private' | 'public'
export type FileSource = 'admin' | 'api' | 'avatar'

export const FILE_CATEGORY_LABELS: Record<FileCategory, string> = {
  image: '图片', document: '文档', video: '视频', audio: '音频', archive: '压缩包', other: '其他',
}

export const FILE_SOURCE_LABELS: Record<FileSource, string> = {
  admin: '后台', api: 'API', avatar: '头像',
}

export interface SysFileRow {
  file_id: number
  folder_id: number
  folder_path?: string
  file_name: string
  object_key: string
  bucket: string
  visibility: FileVisibility
  category: FileCategory
  mime_type: string
  file_ext: string
  file_size: number
  etag?: string
  source: FileSource
  api_key_id?: number | null
  api_key_name?: string | null
  uploader_id?: number | null
  uploader_name?: string
  create_time?: string | null
  update_time?: string | null
}

export interface FileFolder {
  folder_id: number
  parent_id: number
  folder_name: string
  folder_path: string
  is_system: number
  sort: number
}

export interface FileListQuery {
  pageNum: number
  pageSize: number
  folderId?: number
  fileName?: string
  category?: string
  visibility?: string
  source?: string
  beginTime?: string
  endTime?: string
}

export interface FileUrlItem {
  file_id: number
  url: string
  is_public: boolean
  expires_at?: string | null
}

export interface UploadSessionInit {
  fileName: string
  fileSize: number
  mimeType?: string
  folderId?: number
  visibility?: FileVisibility
  folderPath?: string
}

export interface UploadSessionResult {
  session_id: string
  mode: 'single' | 'multipart'
  part_size: number
  part_count: number
  concurrency: number
  upload_url?: string
  method?: string
  headers?: Record<string, string>
  expires_at?: string
}

export interface UploadedPart { part_number: number; etag: string; size?: number }

export interface UploadSessionStatus {
  session_id: string
  file_name: string
  file_size: number
  folder_id: number
  visibility: FileVisibility
  mode: 'single' | 'multipart'
  part_size: number
  part_count: number
  uploaded_parts: UploadedPart[]
  status: string
  expires_at?: string
}
```

- [ ] **Step 2: `src/types/storage.ts` / `src/types/apiKey.ts`**

```ts
// storage.ts
export interface StorageConfig {
  internal_endpoint: string
  public_endpoint: string
  region: string
  access_key: string
  has_secret: boolean
  secret_hint: string
  private_bucket: string
  public_bucket: string
  public_base_url: string
  allowed_origins: string
  max_file_size_mb: number
  multipart_threshold_mb: number
  part_size_mb: number
  upload_concurrency: number
  upload_session_expire_hours: number
  upload_presign_expire_minutes: number
  download_presign_expire_seconds: number
  default_visibility: 'private' | 'public'
  allowed_extensions: string
}

export interface StorageConfigPayload extends Partial<Omit<StorageConfig, 'has_secret' | 'secret_hint'>> {
  secretKey?: string
}

export interface StorageCheckItem { key: string; ok: boolean; message: string }

export interface StorageInitItem { key: string; ok: boolean; message: string }
```

```ts
// apiKey.ts
export type ApiKeyScope = 'upload' | 'download' | 'list' | 'delete'

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  upload: '上传', download: '下载', list: '列表', delete: '删除',
}

export interface SysApiKeyRow {
  key_id: number
  key_name: string
  access_key: string
  secret_hint: string
  scopes: ApiKeyScope[]
  folder_id: number
  quota_bytes: number
  used_bytes: number
  quota_mb: number
  expires_at?: string | null
  status: string
  last_used_at?: string | null
  last_used_ip?: string
  remark?: string | null
  create_time?: string | null
}

export interface ApiKeyCreatePayload {
  keyName: string
  scopes: ApiKeyScope[]
  folderName?: string
  quotaMb?: number
  expiresAt?: string
  remark?: string
}

export interface ApiKeyUpdatePayload {
  keyId: number
  keyName?: string
  scopes?: ApiKeyScope[]
  quotaMb?: number
  expiresAt?: string | null
  status?: string
  remark?: string
}

export interface ApiKeySecretResult { key: SysApiKeyRow; secret: string }
export interface ApiKeyResetResult { key_id: number; secret: string }
```

- [ ] **Step 3: `src/api/file.ts`**

```ts
import request from './request'
import type { PageResult } from '../types/api'
import type {
  FileFolder, FileListQuery, FileUrlItem, SysFileRow,
  UploadedPart, UploadSessionInit, UploadSessionResult, UploadSessionStatus,
} from '../types/file'

export const getFileList = (params: FileListQuery) =>
  request.get<never, PageResult<SysFileRow>>('/system/file/list', { params })

export const getFileFolders = () =>
  request.get<never, FileFolder[]>('/system/file/folders')

export const createFolder = (data: { parentId: number; folderName: string }) =>
  request.post<never, { folder_id: number }>('/system/file/folder', data)

export const updateFolder = (folderId: number, data: { folderName?: string; parentId?: number }) =>
  request.put<never, null>(`/system/file/folder/${folderId}`, data)

export const deleteFolders = (ids: number[]) =>
  request.delete<never, null>(`/system/file/folder/${ids.join(',')}`)

export const updateFile = (fileId: number, data: { fileName?: string; folderId?: number }) =>
  request.put<never, null>(`/system/file/${fileId}`, data)

export const deleteFiles = (ids: number[]) =>
  request.delete<never, { deleted: number; failed: string[] }>(`/system/file/${ids.join(',')}`)

export const getFileUrls = (fileIds: number[], download = false) =>
  request.post<never, FileUrlItem[]>('/system/file/urls', { fileIds, download })

export const getFileText = (fileId: number) =>
  request.get<never, { content: string; truncated: boolean }>(`/system/file/${fileId}/text`)

export const initUploadSession = (data: UploadSessionInit) =>
  request.post<never, UploadSessionResult>('/system/file/upload/sessions', data)

export const getUploadSession = (sessionId: string) =>
  request.get<never, UploadSessionStatus>(`/system/file/upload/sessions/${sessionId}`)

export const getUploadPartUrls = (sessionId: string, partNumbers: number[]) =>
  request.post<never, { part_number: number; url: string }[]>(
    `/system/file/upload/sessions/${sessionId}/part-urls`, { partNumbers })

export const completeUploadSession = (sessionId: string, parts: { partNumber: number; etag: string }[] = []) =>
  request.post<never, { file_id: number }>(`/system/file/upload/sessions/${sessionId}/complete`, { parts })

export const abortUploadSession = (sessionId: string) =>
  request.delete<never, null>(`/system/file/upload/sessions/${sessionId}`)

export const getActiveUploadSessions = () =>
  request.get<never, UploadSessionStatus[]>('/system/file/upload/sessions', { params: { status: 'active' } })
```

- [ ] **Step 4: `src/api/storage.ts` / `src/api/apiKey.ts` / `src/api/profile.ts`**

```ts
// storage.ts
import request from './request'
import type { StorageCheckItem, StorageConfig, StorageConfigPayload, StorageInitItem } from '../types/storage'

export const getStorageConfig = () =>
  request.get<never, StorageConfig | null>('/system/storage/config')

export const saveStorageConfig = (data: StorageConfigPayload) =>
  request.put<never, StorageConfig>('/system/storage/config', data)

export const testStorage = (data?: StorageConfigPayload) =>
  request.post<never, StorageCheckItem[]>('/system/storage/test', data ?? {})

export const initStorageBuckets = () =>
  request.post<never, StorageInitItem[]>('/system/storage/init')
```

```ts
// apiKey.ts
import request from './request'
import type { PageResult } from '../types/api'
import type {
  ApiKeyCreatePayload, ApiKeyResetResult, ApiKeySecretResult,
  ApiKeyUpdatePayload, SysApiKeyRow,
} from '../types/apiKey'

export interface ApiKeyListQuery { pageNum: number; pageSize: number; keyName?: string; status?: string }

export const getApiKeyList = (params: ApiKeyListQuery) =>
  request.get<never, PageResult<SysApiKeyRow>>('/system/api-key/list', { params })

export const addApiKey = (data: ApiKeyCreatePayload) =>
  request.post<never, ApiKeySecretResult>('/system/api-key', data)

export const editApiKey = (data: ApiKeyUpdatePayload) =>
  request.put<never, null>('/system/api-key', data)

export const resetApiKey = (keyId: number) =>
  request.post<never, ApiKeyResetResult>(`/system/api-key/${keyId}/reset`)

export const deleteApiKeys = (ids: number[]) =>
  request.delete<never, null>(`/system/api-key/${ids.join(',')}`)
```

```ts
// profile.ts
import request from './request'

export const uploadMyAvatar = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<never, { avatar: string; file_id: number }>('/system/user/profile/avatar', fd)
}

export const uploadAdminAvatar = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<never, { avatar: string; file_id: number }>('/system/file/avatar', fd)
}

export const updateProfileInfo = (data: { nickName?: string; email?: string; phonenumber?: string; avatar?: string }) =>
  request.put<never, null>('/system/user/profile/info', data)
```

- [ ] **Step 5: `useColPrefs` 加 `defaultHiddenKeys`**（`src/components/ColumnSettings.tsx`）：

- `UseColPrefsOptions` 增加 `defaultHiddenKeys?: string[]`
- `defaultPrefs` 计算：`visible: columns.filter(c => !defaultHiddenSet.has(c.key)).map(c => c.key)`（`defaultHiddenSet = useMemo(() => new Set(defaultHiddenKeys ?? []), [defaultHiddenKeys?.join(',')])`）
- 「新增列」迁移逻辑里 `added` 列的可见性：`for (const k of added) if (!visible.includes(k) && !defaultHiddenSet.has(k)) visible.push(k)`
- 其他页面不传该参数，行为不变（回归确认 tsc）。

- [ ] **Step 6: `menuIcons.ts`** 追加（`lucide-react` import 增加 `Files`、`HardDrive`、`KeyRound`）：

```ts
  { key: 'file', label: '文件', icon: Files },
  { key: 'storage', label: '存储', icon: HardDrive },
  { key: 'key', label: '密钥', icon: KeyRound },
```

- [ ] **Step 7: 验证** `cd D:/Desktop/heroUI && npx tsc --noEmit`

---

### Task F2: 上传任务队列（XHR 直传 + 分片 + 暂停/续传）

**Files:**
- Create: `src/lib/uploadManager.ts`

**Interfaces:**
- Consumes: F1 的 `initUploadSession/getUploadSession/getUploadPartUrls/completeUploadSession/abortUploadSession`。
- Produces（F4 消费）: `useUploadQueue(onAllDone?: () => void)` 返回
  `{ tasks, addFiles(fileList, folderId, visibility), pause(id), resume(id), cancel(id), retry(id), pauseAll(), resumeAll(), recoverSessions: UploadSessionStatus[], recover(file: File, session: UploadSessionStatus), refreshRecover(), uploadDrawerOpen…（不在此，Drawer 自管） }`。
  - `UploadTask`：`{ id, file: File | null, fileName, fileSize, folderId, visibility, sessionId?, mode?, partSize, partCount, uploaded: Map<number,{etag}>, uploadedBytes, progress, speed, status: 'queued'|'uploading'|'paused'|'completing'|'done'|'error'|'canceled', error?, concurrency }`

- [ ] **Step 1: 实现 `src/lib/uploadManager.ts`**

```ts
import { useCallback, useRef, useState } from 'react'
import {
  abortUploadSession, completeUploadSession, getActiveUploadSessions,
  getUploadPartUrls, getUploadSession, initUploadSession,
} from '../api/file'
import type { FileVisibility, UploadSessionStatus } from '../types/file'

export type UploadStatus = 'queued' | 'uploading' | 'paused' | 'completing' | 'done' | 'error' | 'canceled'

export interface UploadTask {
  id: string
  file: File | null
  fileName: string
  fileSize: number
  folderId: number
  visibility: FileVisibility
  sessionId?: string
  mode?: 'single' | 'multipart'
  partSize: number
  partCount: number
  concurrency: number
  uploaded: Map<number, { etag: string }>
  uploadedBytes: number
  progress: number
  speed: number
  status: UploadStatus
  error?: string
  aborting?: boolean
}

const controllers = new Map<string, AbortController[]>()  // taskId → 在途请求

function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

function putWithProgress(url: string, data: Blob, headers: Record<string, string>,
  onProgress: (loaded: number) => void, signal: AbortSignal, taskKey: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.getResponseHeader('ETag') ?? '')
      } else {
        reject(new Error(`MinIO 返回 ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('网络错误'))
    xhr.onabort = () => reject(new DOMException('已暂停', 'AbortError'))
    signal.addEventListener('abort', () => xhr.abort())
    const list = controllers.get(taskKey) ?? []
    controllers.set(taskKey, list)  // controller 由调用方登记
    xhr.send(data)
  })
}

export function useUploadQueue(onAllDone?: () => void) {
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [recoverSessions, setRecoverSessions] = useState<UploadSessionStatus[]>([])
  const tasksRef = useRef<UploadTask[]>([])
  const pumpingRef = useRef(false)

  const setTask = useCallback((id: string, patch: Partial<UploadTask> | ((t: UploadTask) => Partial<UploadTask>)) => {
    setTasks((prev) => prev.map((t) => {
      if (t.id !== id) return t
      const p = typeof patch === 'function' ? patch(t) : patch
      const next = { ...t, ...p }
      tasksRef.current = tasksRef.current.map((x) => (x.id === id ? next : x))
      return next
    }))
  }, [])

  const refreshRecover = useCallback(async () => {
    try {
      const sessions = await getActiveUploadSessions()
      setRecoverSessions(sessions.filter((s) => s.status === 'pending' || s.status === 'uploading'))
    } catch { /* 未配置存储等场景静默 */ }
  }, [])

  const pump = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    try {
      for (;;) {
        const uploading = tasksRef.current.filter((t) => t.status === 'uploading').length
        const next = tasksRef.current.find((t) => t.status === 'queued')
        if (!next || uploading >= (next.concurrency || 3)) break
        void runTask(next.id)
        await new Promise((r) => setTimeout(r, 0))  // 让 runTask 先登记状态
      }
    } finally {
      pumpingRef.current = false
    }
  }, [])

  const runTask = useCallback(async (id: string) => {
    const task = tasksRef.current.find((t) => t.id === id)
    if (!task || !task.file) return
    const acList: AbortController[] = []
    controllers.set(id, acList)
    try {
      if (!task.sessionId) {
        setTask(id, { status: 'uploading', error: undefined })
        const init = await initUploadSession({
          fileName: task.fileName, fileSize: task.fileSize, mimeType: task.file.type || undefined,
          folderId: task.folderId, visibility: task.visibility,
        })
        setTask(id, { sessionId: init.session_id, mode: init.mode, partSize: init.part_size,
          partCount: init.part_count, concurrency: init.concurrency || 3 })
        if (init.mode === 'single') {
          const ac = new AbortController(); acList.push(ac)
          await putWithProgress(init.upload_url!, task.file, init.headers ?? {},
            (loaded) => setTask(id, { progress: Math.round((loaded / task.fileSize) * 100) }), ac.signal, id)
          setTask(id, { status: 'completing' })
          await completeUploadSession(init.session_id)
          setTask(id, { status: 'done', progress: 100 })
          onAllDone?.()
          return
        }
      }
      // multipart（含恢复）
      const status = task.sessionId
        ? await getUploadSession(task.sessionId)
        : null
      const sessionId = task.sessionId!
      const mode = status?.mode ?? task.mode ?? 'multipart'
      const partSize = status?.part_size ?? task.partSize
      const partCount = status?.part_count ?? task.partCount
      const concurrency = status ? (status as unknown as { concurrency?: number }).concurrency ?? 3 : task.concurrency
      if (status) {
        const uploaded = new Map(status.uploaded_parts.map((p) => [p.part_number, { etag: p.etag }]))
        setTask(id, { uploaded, uploadedBytes: [...uploaded.keys()].length * partSize,
          mode, partSize, partCount, concurrency })
      }
      const t0 = Date.now()
      let doneBytes = 0
      // 缺失分片分批取 URL，片内并发 = min(concurrency, 剩余)
      const missing: number[] = []
      for (let n = 1; n <= partCount; n++) if (!task.uploaded.has(n) && !status?.uploaded_parts.some((p) => p.part_number === n)) missing.push(n)
      const inflight = Math.max(1, Math.min(concurrency, missing.length || 1))
      let cursor = 0
      const worker = async () => {
        for (;;) {
          if (acList[0]?.signal.aborted) return
          const n = missing[cursor++]
          if (n === undefined) return
          if (task.uploaded.has(n)) return
          const urls = await getUploadPartUrls(sessionId, [n])
          const url = urls[0]?.url
          if (!url) throw new Error('获取分片链接失败')
          const start = (n - 1) * partSize
          const blob = task.file!.slice(start, Math.min(start + partSize, task.fileSize))
          const ac = new AbortController(); acList.push(ac)
          const etag = await putWithProgress(url, blob, {},
            (loaded) => {
              setTask(id, (t) => {
                const totalDone = t.uploaded.size * partSize + (t.uploaded.has(n) ? 0 : loaded)
                const progress = Math.min(99, Math.round((totalDone / t.fileSize) * 100))
                const speed = totalDone / Math.max(1, (Date.now() - t0) / 1000)
                return { progress, speed, uploadedBytes: totalDone }
              })
            }, ac.signal, id)
          if (!etag) throw new Error('未取到 ETag：请检查 MinIO CORS 是否 ExposeHeaders=ETag')
          setTask(id, (t) => {
            const uploaded = new Map(t.uploaded); uploaded.set(n, { etag })
            return { uploaded }
          })
        }
      }
      await Promise.all(Array.from({ length: inflight }, worker))
      if (acList[0]?.signal.aborted) return
      setTask(id, { status: 'completing' })
      const uploadedAll = status
        ? [...(status.uploaded_parts.map((p) => [p.part_number, p.etag] as const)),
           ...[...task.uploaded.entries()].map(([n, v]) => [n, v.etag] as const)]
        : [...task.uploaded.entries()].map(([n, v]) => [n, v.etag] as const)
      // 合并去重（恢复时 status 与本地可能重叠）
      const parts = [...new Map(uploadedAll).entries()]
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber)
      await completeUploadSession(sessionId, parts)
      setTask(id, { status: 'done', progress: 100 })
      onAllDone?.()
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') {
        setTask(id, { status: 'paused' })
      } else {
        setTask(id, { status: 'error', error: (e as Error).message })
      }
    } finally {
      controllers.delete(id)
      void pump()
    }
  }, [onAllDone, pump, setTask])
```

> ⚠️ 上面 `runTask` 的 multipart 分支存在几处真实实现时必须修正的细节（计划阶段明确，不属占位）：
> 1. `missing` 的计算要用「合并后的已传集合」：先 `const known = new Map<number,string>()`，把 `status.uploaded_parts` 与 `task.uploaded` 都灌入，再 `for n in 1..partCount if (!known.has(n)) missing.push(n)`；worker 上传成功后 `known.set(n, etag)`。
> 2. complete 的 `parts` 直接由 `known` 生成：`[...known.entries()].map(([partNumber, etag]) => ({ partNumber, etag }))`。
> 3. 进度回调里的 `totalDone = known.size * partSize + 当前片已传 - (known 已含 n ? 0 : 当前片)` 逻辑以 `known.size` 为准，不使用 `t.uploaded`。
> 4. `pump` 里 `void runTask(...)` 需把 `runTask` 的声明提到 `pump` 之前或用 `useRef` 存函数引用，避免 TDZ。
> 5. `putWithProgress` 里的 `controllers.set(taskKey, list)` 两行无意义，删除；controller 登记只由 `runTask` 负责。
> 6. 恢复场景（`task.file` 非空但已有 `sessionId`）与「单文件 single 已有 session」同样走 `getUploadSession`；single + 已有 session 时，若 status.status 为 uploading 则直接 `completeUploadSession(sessionId)`（single 无法续传，只能重传——恢复 UI 只对 multipart 提供继续，single 恢复提示重新上传）。

继续 hooks 收尾部分（与上面同文件）：

```ts
  const addFiles = useCallback((files: File[], folderId: number, visibility: FileVisibility) => {
    const next: UploadTask[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f, fileName: f.name, fileSize: f.size,
      folderId, visibility,
      partSize: 0, partCount: 1, concurrency: 3,
      uploaded: new Map(), uploadedBytes: 0, progress: 0, speed: 0,
      status: 'queued',
    }))
    tasksRef.current = [...tasksRef.current, ...next]
    setTasks([...tasksRef.current])
    void pump()
  }, [pump])

  const pause = useCallback((id: string) => {
    setTask(id, { aborting: true })
    controllers.get(id)?.forEach((ac) => ac.abort())
  }, [setTask])

  const resume = useCallback((id: string) => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t || !t.file) return
    setTask(id, { status: 'queued', aborting: false })
    void pump()
  }, [pump, setTask])

  const cancel = useCallback(async (id: string) => {
    controllers.get(id)?.forEach((ac) => ac.abort())
    const t = tasksRef.current.find((x) => x.id === id)
    if (t?.sessionId) {
      try { await abortUploadSession(t.sessionId) } catch { /* 会话可能已过期 */ }
    }
    setTask(id, { status: 'canceled' })
  }, [setTask])

  const retry = useCallback((id: string) => {
    setTask(id, { status: 'queued', error: undefined })
    void pump()
  }, [pump, setTask])

  const pauseAll = useCallback(() => {
    tasksRef.current.filter((t) => t.status === 'uploading' || t.status === 'queued')
      .forEach((t) => { if (t.status === 'uploading') pause(t.id); else setTask(t.id, { status: 'paused' }) })
  }, [pause, setTask])

  const resumeAll = useCallback(() => {
    tasksRef.current.filter((t) => t.status === 'paused').forEach((t) => resume(t.id))
  }, [resume])

  const recover = useCallback((file: File, session: UploadSessionStatus) => {
    const task: UploadTask = {
      id: `recover-${session.session_id}`,
      file, fileName: session.file_name, fileSize: session.file_size,
      folderId: session.folder_id, visibility: session.visibility,
      sessionId: session.session_id, mode: session.mode,
      partSize: session.part_size, partCount: session.part_count, concurrency: 3,
      uploaded: new Map(), uploadedBytes: 0, progress: 0, speed: 0, status: 'queued',
    }
    if (session.mode === 'single') {
      // single 无法续传：提示重新上传（Drawer 层校验）
    }
    tasksRef.current = [task, ...tasksRef.current.filter((t) => t.id !== task.id)]
    setTasks([...tasksRef.current])
    setRecoverSessions((prev) => prev.filter((s) => s.session_id !== session.session_id))
    void pump()
  }, [pump])

  return {
    tasks, recoverSessions, addFiles, pause, resume, cancel, retry,
    pauseAll, resumeAll, recover, refreshRecover,
    hasActive: tasks.some((t) => t.status === 'uploading' || t.status === 'queued' || t.status === 'completing'),
  }
}

export { fmtBytes }
```

- [ ] **Step 2: 验证** `npx tsc --noEmit`

---

### Task F3: 文件管理页（表格视图 + 目录 + 文件操作 + 预览/复制链接）

**Files:**
- Create: `src/pages/file/fileUtils.tsx`
- Create: `src/pages/file/FileDialogs.tsx`
- Create: `src/pages/file/index.tsx`
- Modify: `src/router/menuRegistry.tsx`（`'file/index'`）

**Interfaces:**
- Consumes: F1 类型/API、B 系列接口。
- Produces: `UploadDrawer`（F4）在 index.tsx 挂载点预留 props。

- [ ] **Step 1: `fileUtils.tsx`** —— 共享渲染小件

```tsx
import { FileArchive, FileAudio, FileImage, FileText, FileVideo, File as FileIcon } from 'lucide-react'
import { Chip } from '@heroui/react'
import type { FileCategory, FileVisibility } from '../../types/file'
import { FILE_CATEGORY_LABELS } from '../../types/file'
import type { LucideIcon } from 'lucide-react'

export const CATEGORY_ICONS: Record<FileCategory, LucideIcon> = {
  image: FileImage, video: FileVideo, audio: FileAudio,
  archive: FileArchive, document: FileText, other: FileIcon,
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

export function formatTime(value?: string | null): string {
  return value ? String(value).replace('T', ' ').slice(0, 19) : '—'
}

export function CategoryChip({ category }: { category: FileCategory }) {
  return <Chip size="sm" variant="soft" color="default">{FILE_CATEGORY_LABELS[category]}</Chip>
}

export function VisibilityChip({ visibility }: { visibility: FileVisibility }) {
  return (
    <Chip size="sm" variant="soft" color={visibility === 'public' ? 'success' : 'default'}>
      {visibility === 'public' ? '公开' : '私有'}
    </Chip>
  )
}
```

- [ ] **Step 2: `FileDialogs.tsx`** —— 目录表单/重命名/移动/删除/预览

组件清单与行为（全部按项目弹窗规范：FormModal/FormSection/字段 12px、AlertDialog 受控）：
- `FolderFormDialog({ isOpen, parentId, editing, onClose })`：新建/重命名目录（FormModal + TextField「目录名称」，保存调 `createFolder`/`updateFolder`，成功 invalidate `['file-folders']`、`['file-list']`）。
- `MoveDialog({ isOpen, target, kind: 'file' | 'folder', folders, onClose })`：SelectRoot 递归选项（缩进 `folder_path` 全路径展示；排除自身/其后代），保存调 `updateFile({ folderId })` 或 `updateFolder({ parentId })`。
- `FileDeleteDialog({ isOpen, names, onClose, onConfirm })`：AlertDialog danger，文案「将同时删除 MinIO 中的文件对象，不可恢复。」
- `PreviewModal({ target, onClose })`：
  - 打开时 `useQuery(['file-url', target.file_id], () => getFileUrls([target.file_id]))` 取链接；
  - image：`<img src={url} className="mx-auto max-h-[70vh] object-contain" />`
  - pdf：`<iframe src={url} className="h-[70vh] w-full rounded-lg border border-separator" />`
  - video/audio：原生 `<video controls className="max-h-[70vh]" />` / `<audio controls className="w-full" />`
  - text 类（`category==='document' && ['txt','md','csv','json','xml','html','htm','log'].includes(file_ext)`）：`useQuery(['file-text', id], () => getFileText(id))`，`<pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-secondary p-3 text-xs">`；
  - 其他：EmptyState + 下载按钮（`getFileUrls([id], true)` 后 `window.open(url)`）；
  - 用 `ModalRoot + useOverlayState + ModalBackdrop variant`（与 FormModal 同款），size="lg"，标题为文件名。

- [ ] **Step 3: `index.tsx`** —— 页面主体（结构对齐 `src/pages/system/config/index.tsx`）

关键状态与逻辑：

```tsx
const PAGE_SIZE = 10

const columns = [
  { key: 'file_name', label: '名称' },
  { key: 'category', label: '类型' },
  { key: 'file_size', label: '大小' },
  { key: 'visibility', label: '可见性' },
  { key: 'source', label: '来源/上传者' },
  { key: 'create_time', label: '创建时间' },
  { key: 'actions', label: '操作' },
]

export default function FilePage() {
  const [currentFolderId, setCurrentFolderId] = useState(0)          // 0=全部文件
  const [view, setView] = useState<'table' | 'grid'>('table')
  const [query, setQuery] = useState<FileListQuery>({ pageNum: 1, pageSize: PAGE_SIZE })
  const [nameInput, setNameInput] = useState('')
  const [categoryInput, setCategoryInput] = useState<string | null>(null)
  const [visibilityInput, setVisibilityInput] = useState<string | null>(null)
  const [sourceInput, setSourceInput] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<DateRangeValue | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [folderForm, setFolderForm] = useState<{ open: boolean; editing: FileFolder | null }>({ open: false, editing: null })
  const [moving, setMoving] = useState<{ kind: 'file' | 'folder'; row: SysFileRow | FileFolder } | null>(null)
  const [preview, setPreview] = useState<SysFileRow | null>(null)
  const [deleting, setDeleting] = useState<{ kind: 'file' | 'folder'; names: string[]; ids: number[] } | null>(null)
  const [selected, setSelected] = useState<Selection>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  ...
}
```

- **目录数据**：`useQuery(['file-folders'], getFileFolders)`；`childrenOf(pid)` 取子目录；面包屑由 `folder_path` 切段回溯 `folder_id`（自建 `breadcrumbOf(folderId, folders)` 返回 `[{id, name}]`，根为「全部文件」id=0）。
- **合并行**：`rows = [...foldersInCurrent.map(f => ({ kind:'folder' as const, ...f })), ...(data?.rows ?? []).map(r => ({ kind:'file' as const, ...r }))]`，items id 为 `folder-3` / `file-12`；表头全选/勾选仅对 file 行渲染 `SelectionCheckbox`。
- **搜索行**：文件名 SearchField + 类型/可见性/来源三个 SelectRoot + DateRangeFilter + 搜索(accent-soft)/重置(tertiary)；`search()` 组装 `beginTime/endTime`（`dateRange.start.toString()`/`end.toString()`）。
- **标题行**：Typography.Heading level 6「文件管理」+ 面包屑（Folder 图标胶囊链，点击切 `currentFolderId`）+ 右侧按钮：上传(accent-soft, Upload icon)→新建文件夹(secondary)→批量删除(danger-soft, 仅统计 file 勾选)→视图切换(tertiary, LayoutGrid/List 图标)→列设置。上传权限 `hasPermission('file:upload')`、编辑 `file:edit`、删除 `file:delete`。
- **名称列**：文件夹行 = Folder 图标(size 14, text-warning) + 名称按钮，`onDoubleClick={() => setCurrentFolderId(f.folder_id)}`（Tooltip 提示「双击进入」）；文件行 = 分类图标 + 名称（isRowHeader）。
- **大小列**：`formatSize(file_size)`；**来源列**：`FILE_SOURCE_LABELS[source]` + `uploader_name`/`api_key_name`（muted 小字）。
- **行操作**（圆形软底图标钮，同 config 页写法）：
  - 文件：预览(Eye, `file:download`)、下载(Download → `getFileUrls([id], true)` 后 window.open)、复制链接(Link2 → `getFileUrls([id])`，复制 `url`，私有文件 toast 附「链接将于 {expires_at} 过期」)、重命名(SquarePen)、移动(FolderInput)、删除(Trash2 danger-soft)；
  - 文件夹：打开(FolderOpen → setCurrentFolderId)、重命名、移动、删除（`file:edit`/`file:delete`，`is_system===1` 的目录不显示改名/移动/删除）。
- **表格骨架**：与 config 页完全一致（TableRoot flex! 卡片 + ScrollContainer rounded-2xl + TableCornerOverlays + sticky 表头 + `useStickyColumns` fixedRight actions）；`useColPrefs({ storageKey: 'file-table-cols', columns, fixedKeys: ['actions'] })`。
- **分页**：与 config 页一致（PaginationRoot + PageSizeStepper + 跳页）。
- **网格视图**：F5 实现，本任务先留 `{view === 'grid' && <FileGrid ... />}` 注释占位不渲染（F5 任务补上；为满足 tsc，F3 阶段该分支写 `null`）。
- **弹窗挂载**：FolderFormDialog / MoveDialog / FileDeleteDialog / PreviewModal / BatchDeleteDialog（label「文件」，批量走 `deleteFiles(ids)`）。
- **上传 Drawer 挂载点**：`<UploadDrawer isOpen={uploadOpen} onClose={() => { setUploadOpen(false); void refreshRecover() }} folderId={currentFolderId} onUploaded={() => { invalidate(['file-list']); }} />`——F4 实现组件，F3 阶段先 import 一个最小空壳（Drawer 内显示「上传功能接入中」）以保证编译，F4 替换为完整实现。

- [ ] **Step 4: 路由注册** `menuRegistry.tsx`：

```tsx
const FilePage = lazy(() => import('../pages/file'))
...
'file/index': { element: <Suspense><FilePage /></Suspense> },
```

- [ ] **Step 5: 验证** `npx tsc --noEmit`（此时后端未配菜单也能编译）。

---

### Task F4: 上传 Drawer（多选/拖拽/进度/暂停续传/断点恢复）

**Files:**
- Create: `src/pages/file/UploadDrawer.tsx`
- Modify: `src/pages/file/index.tsx`（替换空壳）

**Interfaces:**
- Consumes: F2 `useUploadQueue`、F1 API。
- Props: `{ isOpen: boolean; onClose: () => void; folderId: number; onUploaded?: () => void }`

- [ ] **Step 1: 实现 `UploadDrawer.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import {
  Button, DrawerBackdrop, DrawerBody, DrawerCloseTrigger, DrawerContent, DrawerDialog,
  DrawerFooter, DrawerHeader, DrawerHeading, DrawerRoot, Label, ListBox, ListBoxItem,
  SelectIndicator, SelectPopover, SelectRoot, SelectTrigger, SelectValue, Progress,
  Tooltip, TooltipContent, TooltipTrigger, toast,
} from '@heroui/react'
import { CheckCircle2, CircleAlert, Pause, Play, UploadCloud, X, XCircle } from 'lucide-react'
import { useOverlayState } from '@heroui/react'
import { useUploadQueue, fmtBytes, type UploadTask } from '../../lib/uploadManager'
import type { FileVisibility, UploadSessionStatus } from '../../types/file'
import { useModalBackdropVariant } from '../../components/useModalBackdrop'

interface Props {
  isOpen: boolean
  onClose: () => void
  folderId: number
  onUploaded?: () => void
}

const VISIBILITY_OPTIONS: { id: FileVisibility; label: string }[] = [
  { id: 'private', label: '私有' },
  { id: 'public', label: '公开' },
]

export default function UploadDrawer({ isOpen, onClose, folderId, onUploaded }: Props) {
  const state = useOverlayState({ isOpen, onOpenChange: (v) => !v && onClose() })
  const backdropVariant = useModalBackdropVariant()
  const queue = useUploadQueue(onUploaded)
  const [visibility, setVisibility] = useState<FileVisibility>('private')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const recoverInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (isOpen) void queue.refreshRecover() /* eslint-disable-line */ }, [isOpen])
  useEffect(() => { setVisibility((v) => v) /* 依存储设置默认值可后补 */ }, [])

  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return
    queue.addFiles(Array.from(list), folderId, visibility)
  }

  const statusView = (t: UploadTask) => {
    switch (t.status) {
      case 'done': return <span className="flex items-center gap-1 text-success"><CheckCircle2 size={12} />完成</span>
      case 'error': return <span className="flex items-center gap-1 text-danger"><CircleAlert size={12} />{t.error ?? '失败'}</span>
      case 'paused': return <span className="text-warning">已暂停</span>
      case 'canceled': return <span className="text-muted">已取消</span>
      case 'completing': return <span className="text-muted">合并中…</span>
      case 'uploading': return <span className="text-muted">{fmtBytes(t.speed)}/s</span>
      default: return <span className="text-muted">等待中</span>
    }
  }
  ...
}
```

Drawer 主体（注意宽度类必须放 `DrawerDialog`）：

```tsx
  return (
    <DrawerRoot state={state}>
      <DrawerBackdrop variant={backdropVariant}>
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[92vw] sm:w-[480px]">
            <DrawerCloseTrigger />
            <DrawerHeader className="-mx-6 -mt-6 flex-row items-center gap-3 border-b border-separator/60 bg-linear-to-b from-accent-soft via-accent-soft/40 to-transparent px-6 pt-5 pb-4 pe-14">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-soft-foreground">
                <UploadCloud size={16} aria-hidden />
              </span>
              <DrawerHeading className="text-lg font-semibold">上传文件</DrawerHeading>
            </DrawerHeader>
            <DrawerBody className="flex flex-col gap-4 py-5">
              {/* 断点恢复区 */}
              {queue.recoverSessions.length > 0 && (
                <section className="flex flex-col gap-2 rounded-xl border border-warning/30 bg-warning-soft/30 p-3">
                  <p className="text-xs font-medium">检测到 {queue.recoverSessions.length} 个未完成上传（刷新前遗留）</p>
                  {queue.recoverSessions.map((s) => (
                    <div key={s.session_id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate">{s.file_name}（{fmtBytes(s.file_size)}）</span>
                      {s.mode === 'multipart' ? (
                        <Button size="sm" variant="secondary" className="h-7!"
                          onPress={() => recoverInputRef.current?.click()}
                          data-session={s.session_id}
                          onPress={() => setRecoverTarget(s)}>
                          继续
                        </Button>
                      ) : (
                        <span className="text-muted">需重新上传</span>
                      )}
                      <Button size="sm" variant="tertiary" className="h-7!" isIconOnly aria-label="放弃"
                        onPress={async () => { await abortUploadSession(s.session_id); void queue.refreshRecover() }}>
                        <X size={12} className="size-3!" />
                      </Button>
                    </div>
                  ))}
                </section>
              )}
              {/* 拖拽区 + 可见性选择 */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); pickFiles(e.dataTransfer.files) }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-dashed p-6 transition-colors ${dragOver ? 'border-accent bg-accent-soft/40' : 'border-separator hover:bg-surface-secondary'}`}
              >
                <UploadCloud size={20} className="text-muted" aria-hidden />
                <p className="text-xs">点击选择或拖拽文件到此处（可多选）</p>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-xs font-medium text-muted">可见性</Label>
                <SelectRoot aria-label="可见性" className="w-36" selectedKey={visibility}
                  onSelectionChange={(k) => k && setVisibility(k as FileVisibility)}>
                  <SelectTrigger className="min-h-8!"><SelectValue className="text-xs!" /><SelectIndicator /></SelectTrigger>
                  <SelectPopover><ListBox>
                    {VISIBILITY_OPTIONS.map((o) => <ListBoxItem key={o.id} id={o.id}>{o.label}</ListBoxItem>)}
                  </ListBox></SelectPopover>
                </SelectRoot>
                <div className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="tertiary" onPress={queue.pauseAll}>全部暂停</Button>
                  <Button size="sm" variant="tertiary" onPress={queue.resumeAll}>全部继续</Button>
                </div>
              </div>
              {/* 任务列表 */}
              <div className="flex flex-col gap-2">
                {queue.tasks.length === 0 && <p className="py-6 text-center text-xs text-muted">暂无上传任务</p>}
                {queue.tasks.map((t) => (
                  <div key={t.id} className="flex flex-col gap-1 rounded-lg border border-separator p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{t.fileName}</span>
                      <span className="text-xs text-muted">{fmtBytes(t.fileSize)}</span>
                      {statusView(t)}
                      {(t.status === 'uploading' || t.status === 'queued') && (
                        <Tooltip><TooltipTrigger>
                          <Button size="sm" variant="tertiary" isIconOnly className="size-6! rounded-full!" aria-label="暂停" onPress={() => queue.pause(t.id)}><Pause size={12} className="size-3!" /></Button>
                        </TooltipTrigger><TooltipContent>暂停</TooltipContent></Tooltip>
                      )}
                      {t.status === 'paused' && (
                        <Button size="sm" variant="tertiary" isIconOnly className="size-6! rounded-full!" aria-label="继续" onPress={() => queue.resume(t.id)}><Play size={12} className="size-3!" /></Button>
                      )}
                      {t.status === 'error' && (
                        <Button size="sm" variant="tertiary" isIconOnly className="size-6! rounded-full!" aria-label="重试" onPress={() => queue.retry(t.id)}><Play size={12} className="size-3!" /></Button>
                      )}
                      {t.status !== 'done' && t.status !== 'canceled' && (
                        <Button size="sm" variant="tertiary" isIconOnly className="size-6! rounded-full!" aria-label="取消" onPress={() => void queue.cancel(t.id)}><XCircle size={12} className="size-3!" /></Button>
                      )}
                    </div>
                    <Progress aria-label={`${t.fileName} 上传进度`} value={t.progress} size="sm" className="text-xs" />
                    <p className="text-[11px] text-muted">{t.progress}%{t.mode === 'multipart' ? ` · 分片 ${t.uploaded.size}/${t.partCount}` : ''}</p>
                  </div>
                ))}
              </div>
            </DrawerBody>
            <DrawerFooter className="-mx-6 -mb-6 border-t border-separator/60 px-6 pt-4 pb-6">
              <Button variant="primary" size="sm" onPress={() => fileInputRef.current?.click()}>
                <UploadCloud size={12} className="size-3!" aria-hidden />选择文件
              </Button>
              <Button variant="tertiary" size="sm" onPress={onClose}>收起（不取消任务）</Button>
            </DrawerFooter>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
      <input ref={fileInputRef} type="file" multiple hidden onChange={(e) => { pickFiles(e.target.files); e.currentTarget.value = '' }} />
      {/* 恢复用文件选择：限单个文件，validate 名称+大小后 queue.recover(file, target) */}
      <input ref={recoverInputRef} type="file" hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.currentTarget.value = ''
          if (f && recoverTarget) {
            if (f.name !== recoverTarget.file_name || f.size !== recoverTarget.file_size) {
              toast('提示', { description: '请选择与原任务同名且同大小的文件', variant: 'warning' })
              return
            }
            queue.recover(f, recoverTarget)
            setRecoverTarget(null)
          }
        }} />
    </DrawerRoot>
  )
```

> 实现注意：上面 JSX 里「继续」按钮写了两个 onPress（示意排版错误），只保留 `onPress={() => setRecoverTarget(s)}`；`recoverTarget` 用 `useState<UploadSessionStatus | null>(null)`；`abortUploadSession` 从 `../../api/file` import；`Progress` 组件若本机 d.ts 无该导出，则用计划中给的手写进度条（`<div className="h-1.5 rounded-full bg-surface-secondary"><div className="h-full rounded-full bg-accent" style={{ width: `${t.progress}%` }} /></div>`）。写完后 `grep -c "两个 onPress" 为 0` 自查。

- [ ] **Step 2: 替换 F3 空壳**，`onUploaded` 里 `invalidateQueries(['file-list'])` 并 `toast('成功', { description: '文件上传完成', variant: 'success' })`。

- [ ] **Step 3: 验证** `npx tsc --noEmit`。

---

### Task F5: 网格视图

**Files:**
- Create: `src/pages/file/FileGrid.tsx`
- Modify: `src/pages/file/index.tsx`（启用切换）

**Interfaces:**
- Props: `{ rows: (FileGridRow)[]; onOpenFolder(f: FileFolder): void; onPreview(f: SysFileRow): void; onAction(action, row): void }`，`FileGridRow = ({ kind: 'folder' } & FileFolder) | ({ kind: 'file' } & SysFileRow)`。

- [ ] **Step 1: 实现 `FileGrid.tsx`**

- 布局：`grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3`；目录卡在前。
- 缩略图：图片文件用 `useQuery(['file-grid-urls'], () => getFileUrls(当前页图片 fileIds))`（仅网格模式启用），`<img className="h-20 w-full rounded-lg object-cover" loading="lazy" />`；非图片用 CATEGORY_ICONS size 28 居中。
- 卡片：`group relative flex flex-col gap-1.5 rounded-xl border border-separator bg-surface p-2 hover:shadow-sm`；底部名称 truncate（text-xs）+ 大小（text-[11px] muted）+ 公开/私有角标（VisibilityChip size sm）。
- hover 操作：右上角出现 `opacity-0 group-hover:opacity-100` 的小按钮组（预览/下载/复制链接/删除，同表格语义；目录卡显示 打开）。
- 目录卡双击进入（与表格一致）。
- 空态：EmptyState「暂无文件」。

- [ ] **Step 2: index.tsx 启用**：视图切换按钮 toggle `view`；`{view === 'grid' ? <FileGrid rows={rows} onOpenFolder={(f) => setCurrentFolderId(f.folder_id)} onPreview={setPreview} onAction={handleGridAction} /> : <表格/>}`；`handleGridAction` 复用行操作处理函数。两视图共用 `query/selected/currentFolderId` 状态（spec 要求）。

- [ ] **Step 3: 验证** `npx tsc --noEmit`。

---

### Task F6: 存储设置页

**Files:**
- Create: `src/pages/file/storage.tsx`
- Modify: `src/router/menuRegistry.tsx`（`'file/storage'`）

**Interfaces:**
- Consumes: `getStorageConfig/saveStorageConfig/testStorage/initStorageBuckets`。

- [ ] **Step 1: 页面结构**（单页分区，FormSection 分组 + 2 列字段网格；不用 TableRoot；整页 `flex h-full min-h-0 flex-col gap-6` + 一个 `max-w-3xl` 白卡 `rounded-2xl border border-separator bg-surface p-6 shadow-sm`——同区域只留一层卡）：

- 标题行：Typography.Heading level 6「存储设置」+ 右侧按钮：测试连接(secondary, PlugZap 图标)、初始化桶(secondary, DatabaseBackup)、保存(accent-soft, Save)。
- **FormSection「连接信息」(accent)**：内部端点 `internal_endpoint`、公开端点 `public_endpoint`、Region、Access Key（4 个 TextField）；Secret Key：`type="password"`，placeholder = `has_secret ? `已配置（末 4 位 ${secret_hint}），留空不修改` : '请输入 MinIO Secret Key'`。
- **FormSection「桶配置」(accent)**：私有桶、公开桶、公开基础地址（placeholder「可选，留空使用公开端点/公开桶」）。
- **FormSection「上传策略」(success)**：单文件上限 MB、分片阈值 MB、分片大小 MB、并发数（number Input）；默认可见性 SelectRoot（私有/公开）；允许后缀（placeholder「逗号分隔，如 pdf,docx；留空不限制」）。
- **FormSection「访问与 CORS」(warning)**：CORS 允许来源（placeholder「逗号分隔，生产环境追加正式域名」）、下载签名有效期（秒）、上传会话有效期（小时）、上传签名有效期（分钟）。
- **结果展示区**：`testResult`/`initResult` 各自 `flex flex-col gap-1`，每行 `check.ok ? text-success : text-danger` + CheckCircle2/XCircle 12px + `key` + `message`。
- 保存逻辑：`saveStorageConfig({...form, secretKey: secretInput || undefined})` → toast 成功 → `invalidateQueries(['storage-config'])`；测试：优先传当前表单值 `testStorage({...form, secretKey: secretInput || undefined})`；初始化：AlertDialog 确认「将创建私有/公开两个桶并写入匿名只读策略与 CORS」后 `initStorageBuckets()`。
- 加载：`useQuery(['storage-config'], getStorageConfig)`，`useEffect` 回填表单（secret 输入框保持空）。
- 数值字段用 `type="number"` Input；`onChange` 统一 `setForm(f => ({...f, [key]: value}))`，保存前 `Number()` 化。

- [ ] **Step 2: 路由注册** `'file/storage': { element: <Suspense><StoragePage /></Suspense> }`（lazy）。

- [ ] **Step 3: 验证** `npx tsc --noEmit`。

---

### Task F7: API 密钥页

**Files:**
- Create: `src/pages/file/api-key.tsx`
- Modify: `src/router/menuRegistry.tsx`（`'file/api-key'`）

**Interfaces:**
- Consumes: `getApiKeyList/addApiKey/editApiKey/resetApiKey/deleteApiKeys`。
- 复用 F3 已抽出的 `MoveDialog` 不需要；独立实现。

- [ ] **Step 1: 页面结构**（对齐 config 表格页骨架：搜索行→标题行→TableRoot→分页）：

- 搜索行：名称 SearchField + 状态 SelectRoot + 搜索/重置。
- 标题行：「API 密钥」+ 新增 Key（accent-soft, KeyPlus/KeyRound 图标）+ 批量删除（danger-soft）+ 列设置。
- 列：名称 / Access Key（`ak_xxx…` + 复制按钮 Copy size 12）/ 权限（scopes 软色 Chip 组，success）/ 命名空间（folder_path，经 `['file-folders']` 查询映射）/ 配额用量（文本 `1.2 GB / 10 GB` 或 `已用 1.2 GB` + 8px 细进度条，超 90% 用 warning）/ 状态（开关行内切换 `editApiKey({keyId, status})`，样式对齐岗位页 56×20 开关）/ 过期时间 / 最后使用（时间 + IP muted）/ 操作。
- 操作（圆形软底图标钮）：重置密钥(KeyRound, `file:key:reset` → 确认 AlertDialog → `resetApiKey` → 打开一次性密钥弹窗)、编辑(SquarePen, `file:key:edit` → 表单弹窗)、删除(Trash2 danger-soft, `file:key:delete` → AlertDialog「删除后 Key 立即失效，已上传文件与命名空间目录将保留。」)。
- **新建/编辑弹窗**（FormModal size md）：名称（必填）、权限（4 个 Checkbox，scope labels）、命名空间名称（仅新建，placeholder「默认 API-<名称>」）、配额 MB（0=不限）、过期时间（Input type="date"，可空）、备注。
- **一次性密钥弹窗**（AlertDialog success 图标）：大号等宽字体展示 `ak_xxx.sk_xxx`（`break-all`）+ 复制按钮（`navigator.clipboard.writeText`）+ 警示文案「完整密钥仅此一次显示，请立即保存。」+ 关闭按钮。重置后同样打开此弹窗（只显示 secret）。
- 配额进度条与状态开关字号/尺寸遵循全站规范（开关 56×20、文字挂 SwitchContent 12px）。

- [ ] **Step 2: 路由注册** `'file/api-key'`。

- [ ] **Step 3: 验证** `npx tsc --noEmit`。

---

### Task F8: 头像 / 个人资料 / 用户管理头像

**Files:**
- Create: `src/components/ProfileModal.tsx`
- Modify: `src/components/layout/AppShell.tsx`
- Modify: `src/pages/system/user/UserFormModal.tsx`
- Modify: `src/pages/system/user/index.tsx`

**Interfaces:**
- Consumes: `uploadMyAvatar/updateProfileInfo/uploadAdminAvatar`、auth store。

- [ ] **Step 1: `ProfileModal.tsx`**（FormModal size sm，icon UserRound，tone accent）

- 字段：头像（圆形预览 `size-16 rounded-full object-cover`，无则字母回退；按钮 上传头像(secondary, hidden file input accept="image/*") / 清除(tertiary，仅当有头像)）；昵称（TextField，必填）；手机号；邮箱。
- 打开时从 `useAuthStore(s => s.user)` 回填 `nick_name/email/phonenumber/avatar`。
- 保存：头像若刚选择 → `uploadMyAvatar(file)` 拿 `avatar` URL；然后 `updateProfileInfo({ nickName, email, phonenumber, avatar })`；成功后 `setUserInfo({ ...user, nick_name, email, phonenumber, avatar }, roles, permissions)`（store 里 roles/permissions 原样回传）+ toast + 关闭。
- 头像文件校验：前端先拦 `file.size > 2 * 1024 * 1024` 提示「头像不能超过 2MB」。

- [ ] **Step 2: `AppShell.tsx`**

- 头像触发器：`user?.avatar ? <img src={user.avatar} alt={user.nick_name} className="size-7 rounded-full object-cover" /> : 字母`（外层容器样式不变）。
- DropdownMenu 增加 `<DropdownItem id="profile">`（UserRound 图标，普通色），`onAction` 打开 `setProfileOpen(true)`；挂 `<ProfileModal isOpen={profileOpen} onClose={...} />`。菜单顺序：个人资料 → 退出登录。

- [ ] **Step 3: `UserFormModal.tsx`**

- `emptyForm` 增加 `avatar: ''`；`editing` 回填 `avatar: editing.avatar ?? ''`。
- 基础信息分组顶部整行放头像块：预览 + 上传按钮（`uploadAdminAvatar`，需 `hasPermission('file:upload')` 才显示上传钮；无权限仅展示）+ 清除；上传成功 `setForm(f => ({...f, avatar: res.avatar}))`。
- payload 增加 `avatar: form.avatar || undefined`（`UserPayload` 类型同步加 `avatar?: string`）。

- [ ] **Step 4: `user/index.tsx`**

- `columns` 在 `nick_name` 后插入 `{ key: 'avatar', label: '头像' }`；`useColPrefs` 传 `defaultHiddenKeys: ['avatar']`。
- 渲染：`<img src={row.avatar} className="size-8 rounded-full object-cover" />`，无头像显示字母圆形占位（bg-surface-secondary + muted 字母）。

- [ ] **Step 5: 验证** `npx tsc --noEmit`。

---

### Task F9: 全量验证与手工清单

- [ ] **Step 1: 前端构建**

```bash
cd D:/Desktop/heroUI && npx tsc --noEmit && npx vite build
```

- [ ] **Step 2: 后端编译 + 单测**

```bash
cd D:/Desktop/template_project/backend && uv run python -m compileall app -q && uv run pytest tests/unit/test_file_utils.py --confcutdir=tests/unit -q
```

- [ ] **Step 3: 交给用户的操作清单**（输出到对话，不写文件）
  1. 重启后端（用户手动）；
  2. 执行 `sql/menu_file_service.sql`（先确认「系统工具」menu_id 存在）；
  3. 浏览器强刷 → 系统工具下出现「文件服务」三项菜单；
  4. 先进「存储设置」填 MinIO 连接 → 测试连接 → 初始化桶（MinIO 控制台核对双桶 + CORS ExposeHeaders=ETag）；
  5. 手工验收清单（spec 第 13 节）：建目录/拖拽多传/暂停继续/刷新恢复/预览（图片 PDF 文本 音视频）/下载/复制链接（公开永久、私有带过期）/改名移动/单条与批量删除；小文件单 PUT、超 20MB 分片；API Key 创建/重置一次性密钥、scopes 越权 403、配额超限、命名空间隔离；头像三处（顶栏/个人资料/用户管理）端到端；旧 `POST /api/v1/upload` 返回公开直链且历史本地文件仍可下载。

---

## 自查记录（writing-plans Self-Review）

1. **Spec 覆盖**：5 张表（B2）、后台文件/存储/Key/开放接口（B3-B8）、头像/资料/旧上传（B9）、菜单权限 SQL（B10）、清理任务（B10）、前端三页 + 上传/预览/网格（F1-F7）、头像闭环（F8）、CORS/部署提示（F9 清单）——全覆盖。spec 6.1 的 `part-urls`、7.2 断点续传、7.4 旧上传兼容均有对应任务。
2. **占位符扫描**：B3/B6/B8 中标注 ⚠️ 的段落均为「实现时不要照抄的排版示意」，其后紧跟了正确写法；F4 的两个 onPress 已显式标注修正方式；F2 的 6 条修正清单是设计决策而非 TBD。
3. **类型一致性**：前后端共享契约——`UploadSessionResult` 增加 `concurrency`（spec 未写，B6/F2 同步实现）；响应 snake_case（`session_id/part_number/uploaded_parts`），请求 camelCase（`partNumbers/fileIds/folderName/quotaMb`）——F1 类型与 B 系列 schema 已一一对应；`FileService.upload_public` 的返回 `SysFile` 在 B9 三个调用点一致。
