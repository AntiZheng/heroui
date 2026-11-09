# 轨迹路段解析（OSM 在线匹配）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 轨迹上传后由后端异步完成 OSM 路段匹配（OpenFreeMap/OpenMapTiles 在线瓦片），带状态标识与自动恢复，完成后前端可查看逐路段分类信息。

**Architecture:** 后端新增 `road_match` 服务（拉瓦片→解码→逐点最近道路→聚合分段），通过 APScheduler 内置 60s 周期任务自愈式消化待解析轨迹（status 0 待解析 / 1 解析中 / 2 完成 / 3 失败重试中）；结果（逐点 class + 聚合分段）写 `biz_track.road_segments` JSON 列。前端详情页按状态显示解析进度，完成后提供「速度着色/路段着色」切换 + 路段列表。

**Tech Stack:** 后端 FastAPI + httpx + `mapbox-vector-tile`（pip 新增）+ APScheduler + Redis（瓦片缓存）；前端 MapLibre/AMap 双图层扩展 + HeroUI。

**Spec:** 用户 2026-11-09 指定：① 先用在线瓦片，全部轨迹走 OSM（不做高德/国别分支）；② 上传时先同步完成现有统计，后端慢慢开启路段解析并标识状态；③ 解析失败自行恢复直到完成；④ 完成后才能查看路段信息；⑤ 路段分类使用 OSM 原始 class 字段，不做中国道路叫法映射。

## Global Constraints

- 坐标：geojson 存 WGS-84，OpenMapTiles 瓦片即 WGS-84，无坐标转换
- OSM 原始 class 值直接入库/直出前端：motorway/trunk/primary/secondary/tertiary/minor/service/track/path/…，**不做中文映射**
- 瓦片地址必须动态取 TileJSON（`https://tiles.openfreemap.org/planet`）的 `tiles[0]`（版本化路径，裸 `/planet/{z}/{x}/{y}.pbf` 返回空 body）
- 矢量瓦片解码出的局部坐标必须转 WGS84（`loadGeometry` 坑，Node 版已验证，Python 侧 decode 后同样要核对）
- 匹配参数（z13 瓦片、60m 匹配阈值、3×3 邻域兜底）沿用 2026-11-09 脚本验证结论（实测匹配率 94~95%）
- 前端 chrome 字号 12px、软色 Chip 等按项目既有约定；验证 = `pnpm tsc --no-generate-tsbuildinfo && pnpm build`（以仓库实际脚本为准，至少 `tsc` + `vite build`）
- 后端为独立仓库 `D:\Desktop\template_project\backend`（uv 项目，`uv run alembic upgrade head`）；提交用临时环境变量身份 `ichery <ichery@local>`，不动 git config
- **前端仓库轨迹模块文件全部是用户未提交 WIP**——动手前先向用户确认是否先 checkpoint（仅限提醒，不代为提交）
- 后端 dev server 由用户手动重启；本计划中的"重启后端"步骤只交接命令不代跑

## 数据契约（前后端共同依赖）

`biz_track` 新增列（alembic 004）：
- `road_status VARCHAR(1) NOT NULL DEFAULT '0'` — 0 待解析 / 1 解析中 / 2 完成 / 3 失败待重试
- `road_retry INT NOT NULL DEFAULT 0` — 失败重试次数（观测用，不设上限，周期任务持续自恢复）
- `road_segments JSON NULL` — 完成后写入

`road_segments` JSON 结构：
```json
{
  "z": 13,
  "matched_pct": 94.3,
  "cls_by_point": ["primary", "primary", null],
  "segments": [
    {"s": 0, "e": 45, "dist_s": 0, "dist_e": 620.5,
     "cls": "trunk", "name": "九华北路", "brunnel": null, "avg_spd": 44.2}
  ]
}
```
- `cls_by_point[i]` 与 geojson 坐标按下标对齐，`null`=未匹配（地图渲染用）
- `segments[].s/e` 为点下标区间（左闭右开），`dist_s/e` 来自 `meta.dist_m`，`avg_spd` 来自 `meta.speed_kmh`（无速度数据为 null）
- `brunnel` 取区间内出现过的 bridge/tunnel/ford（无则 null）

---

### Task 1: 后端——alembic 004 迁移 + 模型字段

**Files:**
- Create: `D:\Desktop\template_project\backend\alembic\versions\004_track_road.py`
- Modify: `D:\Desktop\template_project\backend\app\models\track.py`

**Interfaces:**
- Produces: `BizTrack.road_status: str`、`BizTrack.road_retry: int`、`BizTrack.road_segments: dict | None`（后续所有任务依赖）

- [ ] **Step 1: 写迁移 004**

```python
"""track road segments columns

Revision ID: 004
Revises: 003
"""
import sqlalchemy as sa

from alembic import op

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("biz_track", sa.Column("road_status", sa.String(1), nullable=False,
                                         server_default="0", comment="路段解析状态(0待解析 1解析中 2完成 3失败待重试)"))
    op.add_column("biz_track", sa.Column("road_retry", sa.Integer(), nullable=False,
                                         server_default="0", comment="路段解析失败重试次数"))
    op.add_column("biz_track", sa.Column("road_segments", sa.JSON(), comment="OSM 路段匹配结果"))


def downgrade() -> None:
    op.drop_column("biz_track", "road_segments")
    op.drop_column("biz_track", "road_retry")
    op.drop_column("biz_track", "road_status")
```

- [ ] **Step 2: 模型补字段**

`app/models/track.py` 的 `geojson` 字段后追加：

```python
    # ── OSM 路段匹配（异步解析，见 services/road_match.py） ──
    road_status: str = Field(default="0", max_length=1, description="路段解析状态(0待解析 1解析中 2完成 3失败待重试)")
    road_retry: int = Field(default=0, description="路段解析失败重试次数")
    road_segments: dict | None = Field(default=None, sa_column=Column(JSON), description="OSM 路段匹配结果")
```

- [ ] **Step 3: 执行迁移并核对**

```bash
cd D:\Desktop\template_project\backend
uv run alembic upgrade head
uv run python -c "import asyncio,os,sys; asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy()); sys.path.insert(0,'.'); import asyncmy; from app.core.config import DataBaseConfig; c=DataBaseConfig(); exec('''async def m():\n conn=await asyncmy.connect(host=c.host,port=c.port,user=c.username,password=c.password,db=c.database); cur=await conn.cursor(); await cur.execute('SHOW COLUMNS FROM biz_track'); [print(r[0]) for r in await cur.fetchall()]; conn.close()\nasyncio.run(m())''')"
```

Expected: 输出含 `road_status / road_retry / road_segments`

- [ ] **Step 4: Commit（后端仓库）**

```bash
cd D:\Desktop\template_project\backend
export GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local
git add alembic/versions/004_track_road.py app/models/track.py
git commit -m "feat: biz_track 增加路段解析状态与结果列"
```

---

### Task 2: 后端——road_match 纯函数（瓦片数学 + 距离 + 聚合）与测试

**Files:**
- Create: `D:\Desktop\template_project\backend\app\services\road_match.py`
- Test: `D:\Desktop\template_project\backend\tests\test_road_match.py`

**Interfaces:**
- Produces（后续任务调用）:
  - `lng_to_tx(lng: float, z: int) -> int` / `lat_to_ty(lat: float, z: int) -> int`
  - `dist_to_line_m(px, py, ax, ay, bx, by) -> float`
  - `aggregate(points: list[tuple[float, float]], cls_by_point: list[str | None], names: list[str | None], brunnels: list[str | None], speeds: list[float | None], dists: list[float]) -> dict`（返回上文的 road_segments dict，不含 z/matched_pct，由调用方补）

- [ ] **Step 1: 写失败测试**

```python
import math

from app.services.road_match import aggregate, dist_to_line_m, lat_to_ty, lng_to_tx


def test_tile_index_beijing():
    # 北京 (116.391, 39.907) @z13 → x=6753, y=3106（OSM 标准瓦片编号）
    assert lng_to_tx(116.391, 13) == 6753
    assert lat_to_ty(39.907, 13) == 3106


def test_dist_to_line_m():
    # 同经度线上 111.32km/度（赤道近似此处用低纬简化断言），点距竖直线 ~10m
    d = dist_to_line_m(116.0001, 39.0, 116.0, 38.999, 116.0, 39.001)
    assert 8 < d < 12
    # 线段延长线上的投影钳制：点在线端点正上方应返回到端点距离而非垂线
    d2 = dist_to_line_m(116.0, 39.002, 116.0, 39.0, 116.0, 39.001)
    assert math.isclose(d2, 111320 * 0.001, rel_tol=0.01)


def test_aggregate_merges_same_key_across_gaps():
    # 4 个点: primary / gap / primary → 聚合为 1 段（同 key 跨未匹配间隙合并）
    pts = [(0.0, 0.0), (0.001, 0.0), (0.002, 0.0), (0.003, 0.0), (0.004, 0.0)]
    cls = ["primary", None, None, "primary", "primary"]
    names = ["九华北路", None, None, "九华北路", "九华北路"]
    out = aggregate(pts, cls, names, [None] * 5, [None] * 5, [i * 100 for i in range(5)])
    assert len(out["segments"]) == 1
    seg = out["segments"][0]
    assert seg["cls"] == "primary" and seg["s"] == 0 and seg["e"] == 5
    assert seg["dist_s"] == 0 and seg["dist_e"] == 400
    assert out["cls_by_point"] == cls


def test_aggregate_separate_classes():
    cls = ["primary", "primary", "trunk", "trunk"]
    names = ["A路", "A路", "B路", "B路"]
    pts = [(0.0, 0.0), (0.001, 0.0), (0.002, 0.0), (0.003, 0.0)]
    out = aggregate(pts, cls, names, [None] * 4, [None] * 4, [0, 100, 200, 300])
    assert [s["cls"] for s in out["segments"]] == ["primary", "trunk"]
    assert out["matched_pct"] == 100.0
```

- [ ] **Step 2: 跑测试确认失败**

```bash
cd D:\Desktop\template_project\backend && uv run pytest tests/test_road_match.py -v
```

Expected: FAIL（ModuleNotFoundError: app.services.road_match）

- [ ] **Step 3: 实现纯函数**

`app/services/road_match.py` 顶部（网络部分在 Task 3 追加）：

```python
"""OSM 路段匹配：OpenFreeMap/OpenMapTiles 瓦片反查道路 class（z13，60m 阈值）"""
import math

EARTH_R = 6371000.0
Z = 13
MATCH_M = 60.0


def lng_to_tx(lng: float, z: int) -> int:
    return int((lng + 180.0) / 360.0 * 2**z)


def lat_to_ty(lat: float, z: int) -> int:
    r = math.radians(lat)
    return int((1 - math.log(math.tan(r) + 1 / math.cos(r)) / math.pi) / 2 * 2**z)


def _meters_per_deg(lat: float) -> tuple[float, float]:
    rad = math.radians(lat)
    return 111320.0 * math.cos(rad), 110540.0


def dist_to_line_m(px, py, ax, ay, bx, by) -> float:
    mx, my = _meters_per_deg((ay + by) / 2)
    vx, vy = (px - ax) * mx, (py - ay) * my
    wx, wy = (bx - ax) * mx, (by - ay) * my
    len2 = wx * wx + wy * wy
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, (vx * wx + vy * wy) / len2))
    return math.hypot(vx - t * wx, vy - t * wy)


def aggregate(points, cls_by_point, names, brunnels, speeds, dists) -> dict:
    n = len(points)
    # 相邻同名同 class 归并为 key 组（含 gap 断组），再把同 key 组跨 gap 合并
    runs: list[tuple[int, int, str, str | None]] = []  # (s, e, cls, name)
    s = 0
    for i in range(1, n + 1):
        if i == n or (cls_by_point[i], names[i]) != (cls_by_point[s], names[s]):
            if cls_by_point[s] is not None:
                runs.append((s, i, cls_by_point[s], names[s]))
            s = i
    merged: list[list] = []
    for r in runs:
        if merged and merged[-1][2] == r[2] and merged[-1][3] == r[3]:
            merged[-1][1] = r[1]
        else:
            merged.append(list(r))
    segments = []
    for s_, e_, cls, name in merged:
        brunn = [b for b in brunnels[s_:e_] if b]
        seg_speeds = [v for v in speeds[s_:e_] if v is not None]
        segments.append({
            "s": s_, "e": e_,
            "dist_s": dists[s_], "dist_e": dists[e_ - 1],
            "cls": cls, "name": name,
            "brunnel": brunn[0] if brunn else None,
            "avg_spd": round(sum(seg_speeds) / len(seg_speeds), 1) if seg_speeds else None,
        })
    matched = sum(1 for c in cls_by_point if c is not None)
    return {
        "z": Z,
        "matched_pct": round(matched / n * 100, 1) if n else 0.0,
        "cls_by_point": cls_by_point,
        "segments": segments,
    }
```

- [ ] **Step 4: 跑测试确认通过**

```bash
cd D:\Desktop\template_project\backend && uv run pytest tests/test_road_match.py -v
```

Expected: 4 PASS

- [ ] **Step 5: Commit（后端仓库）**

```bash
git add app/services/road_match.py tests/test_road_match.py
git commit -m "feat: OSM 路段匹配纯函数（瓦片数学/距离/分段聚合）"
```

---

### Task 3: 后端——瓦片拉取/解码/逐点匹配管道

**Files:**
- Modify: `D:\Desktop\template_project\backend\app\services\road_match.py`（追加）
- Modify: `D:\Desktop\template_project\backend\pyproject.toml`（加 `mapbox-vector-tile`）

**Interfaces:**
- Consumes: Task 2 的纯函数
- Produces: `async def match_track(geojson: dict) -> dict`（输入 TrackGeoJSON，输出 road_segments dict，含 z/matched_pct/cls_by_point/segments）

- [ ] **Step 1: 加依赖并锁定**

```bash
cd D:\Desktop\template_project\backend
# pyproject.toml dependencies 列表加一行: "mapbox-vector-tile",
uv add mapbox-vector-tile
```

- [ ] **Step 2: 探测 decode 输出形状（一次性脚本，不保留）**

```bash
cd D:\Desktop\template_project\backend && uv run python -c "
import httpx, mapbox_vector_tile as mvt
tj = httpx.get('https://tiles.openfreemap.org/planet', timeout=20).json()
url = tj['tiles'][0].replace('{z}','13').replace('{x}','6789').replace('{y}','3340')
data = httpx.get(url, timeout=30).headers and httpx.get(url, timeout=30).content
d = mvt.decode(data, geojson=True)
layer = d['transportation']
print(list(d.keys()))
f = layer['features'][0]
print(f['properties'])
print(f['geometry']['type'], f['geometry']['coordinates'][:2])
"
```

核对两点并据实调整 Step 3 的访问代码：① `decode(..., geojson=True)` 的 features geometry 是否已是 WGS84 经纬度（lib 默认 transformer 会转）；② properties 是否含 `class/subclass/brunnel`。若 geometry 不是经纬度，改用 `mvt.decode(data, geojson=True, transformer=None)` 的替代写法或手动按 extent 换算（参照 Node 脚本 `tileToLngLat`）。

- [ ] **Step 3: 实现管道（追加到 road_match.py）**

```python
import asyncio
import time

import httpx
import mapbox_vector_tile as mvt

from app.core.redis import get_redis

_TILE_TJ_URL = "https://tiles.openfreemap.org/planet"
_tj_cache: tuple[float, str] | None = None  # (ts, url_template)


async def _tile_template(client: httpx.AsyncClient) -> str:
    global _tj_cache
    now = time.monotonic()
    if _tj_cache and now - _tj_cache[0] < 600:
        return _tj_cache[1]
    tj = (await client.get(_TILE_TJ_URL)).json()
    _tj_cache = (now, tj["tiles"][0])
    return _tj_cache[1]


async def _fetch_tile(client: httpx.AsyncClient, z: int, x: int, y: int) -> bytes | None:
    """瓦片字节，Redis 永久缓存（瓦片静态、按版本快照发布）；失败重试 3 次后放弃"""
    redis = get_redis()
    key = f"ofm:tile:{z}/{x}/{y}"
    cached = await redis.get(key)
    if cached:
        return cached
    template = await _tile_template(client)
    url = template.replace("{z}", str(z)).replace("{x}", str(x)).replace("{y}", str(y))
    for i in range(3):
        try:
            resp = await client.get(url, timeout=30)
            resp.raise_for_status()
            data = resp.content
            if data:
                await redis.set(key, data, ex=7 * 86400)
                return data
        except httpx.HTTPError as e:
            from loguru import logger
            logger.warning(f"road_match: 瓦片 {z}/{x}/{y} 第 {i + 1} 次拉取失败: {e}")
    return None


async def _roads_of_tiles(tiles: set[tuple[int, int]]) -> tuple[list[dict], list[dict]]:
    """并发拉瓦片并解码 transportation / transportation_name 图层"""
    client = httpx.AsyncClient(headers={"User-Agent": "heroUI-admin/1.0"})
    sem = asyncio.Semaphore(5)
    roads: list[dict] = []
    names: list[dict] = []

    async def one(zxy: tuple[int, int]):
        z, x, y = zxy
        async with sem:
            data = await _fetch_tile(client, z, x, y)
        if not data:
            return
        decoded = await asyncio.to_thread(mvt.decode, data, 13, 4096, None, True)
        for feat in decoded.get("transportation", {}).get("features", []):
            props = feat["properties"]
            if props.get("class"):
                roads.append({"cls": props["class"], "sub": props.get("subclass"),
                              "brunnel": props.get("brunnel"), "geom": feat["geometry"]})
        for feat in decoded.get("transportation_name", {}).get("features", []):
            if feat["properties"].get("name"):
                names.append({"name": feat["properties"]["name"], "geom": feat["geometry"]})

    await asyncio.gather(*(one(t) for t in tiles))
    await client.aclose()
    return roads, names


def _nearest(roads: list[dict], lng: float, lat: float) -> tuple[float, dict | None]:
    best_d, best_f = MATCH_M + 1, None
    for f in roads:
        coords = f["geom"]["coordinates"]
        lines = coords[0] if f["geom"]["type"] == "MultiLineString" else [coords]
        for line in lines:
            for a, b in zip(line, line[1:]):
                d = dist_to_line_m(lng, lat, a[0], a[1], b[0], b[1])
                if d < best_d:
                    best_d, best_f = d, f
    return best_d, best_f


async def match_track(geojson: dict) -> dict:
    """主入口：TrackGeoJSON → road_segments dict"""
    feat = geojson["features"][0]
    coords = feat["geometry"]["coordinates"]
    meta = feat.get("properties", {}).get("meta", {})
    points = [(c[0], c[1]) for c in coords]
    speeds = meta.get("speed_kmh") or [None] * len(points)
    dists = meta.get("dist_m") or [0.0] * len(points)
    tiles = {(lng_to_tx(lng, Z), lat_to_ty(lat, Z)) for lng, lat in points}
    roads, name_feats = await _roads_of_tiles(tiles)

    # 道路按覆盖瓦片分桶；路名同理
    road_buckets: dict[tuple[int, int], list[dict]] = {}
    for f in roads:
        geom = f["geom"]
        for c in (geom["coordinates"][0] if geom["type"] == "MultiLineString" else geom["coordinates"]):
            road_buckets.setdefault((lng_to_tx(c[0], Z), lat_to_ty(c[1], Z)), []).append(f)
    name_buckets: dict[tuple[int, int], list[dict]] = {}
    for f in name_feats:
        geom = f["geom"]
        for c in (geom["coordinates"][0] if geom["type"] == "MultiLineString" else geom["coordinates"]):
            name_buckets.setdefault((lng_to_tx(c[0], Z), lat_to_ty(c[1], Z)), []).append(f)

    def pool_3x3(buckets, lng, lat):
        tx, ty = lng_to_tx(lng, Z), lat_to_ty(lat, Z)
        return [f for dx in (-1, 0, 1) for dy in (-1, 0, 1)
                for f in buckets.get((tx + dx, ty + dy), [])]

    cls_by_point: list[str | None] = []
    names_p: list[str | None] = []
    brunnels: list[str | None] = []
    for lng, lat in points:
        d, f = _nearest(road_buckets.get((lng_to_tx(lng, Z), lat_to_ty(lat, Z)), []), lng, lat)
        if d > MATCH_M:  # 瓦片边缘兜底
            d, f = _nearest(pool_3x3(road_buckets, lng, lat), lng, lat)
        if d > MATCH_M or f is None:
            cls_by_point.append(None); names_p.append(None); brunnels.append(None)
            continue
        cls_by_point.append(f["cls"]); brunnels.append(f.get("brunnel"))
        _, nf = _nearest(name_buckets.get((lng_to_tx(lng, Z), lat_to_ty(lat, Z)), []), lng, lat)
        if (nf is None or _nearest(name_buckets.get((lng_to_tx(lng, Z), lat_to_ty(lat, Z)), []), lng, lat)[0] > 80):
            _, nf = _nearest(pool_3x3(name_buckets, lng, lat), lng, lat)
        names_p.append(nf["name"] if nf else None)

    return aggregate(points, cls_by_point, names_p, brunnels, speeds, dists)
```

注意：`mvt.decode` 的位置参数签名以 Step 2 探测结果为准（版本间可能是 `decode(buf, geojson=True)` 关键字形式），实现时按探测脚本实际可用的调用方式写死。

- [ ] **Step 4: 真实轨迹验证（一次性脚本，对 track_id=9 跑 match_track）**

```bash
cd D:\Desktop\template_project\backend && uv run python -c "
import asyncio, os, sys, json
asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.path.insert(0, '.')
from app.services.road_match import match_track
from app.core.database import async_session
from sqlalchemy import select
from app.models.track import BizTrack

async def main():
    async with async_session() as db:
        t = (await db.execute(select(BizTrack).where(BizTrack.track_id == 9))).scalar_one()
        out = await match_track(t.geojson)
    print('matched_pct:', out['matched_pct'], 'segments:', len(out['segments']))
    for s in out['segments'][:8]:
        print(s['cls'], s['name'], round((s['dist_e']-s['dist_s'])/1000, 1), 'km')
asyncio.run(main())
"
```

Expected: matched_pct ≈ 94（与 Node 脚本 3065/3250=94.3% 同量级，±2% 可接受）；segments 首段 trunk/九华北路。**若 decode 形状不对（0 匹配），回到 Step 2 调整。**

- [ ] **Step 5: 跑 Task 2 测试确认纯函数未破坏**

```bash
uv run pytest tests/test_road_match.py -v
```

- [ ] **Step 6: Commit（后端仓库）**

```bash
git add app/services/road_match.py pyproject.toml uv.lock
git commit -m "feat: OSM 瓦片拉取与逐点路段匹配管道（Redis 瓦片缓存）"
```

---

### Task 4: 后端——周期解析任务（状态机 + 自恢复）

**Files:**
- Create: `D:\Desktop\template_project\backend\app\tasks\road_parse.py`
- Modify: `D:\Desktop\template_project\backend\app\tasks\scheduler.py`（init_scheduler 内注册内置 interval，仿 file_cleanup:61-64）

**Interfaces:**
- Consumes: `match_track(geojson) -> dict`（Task 3）、`BizTrack.road_status/road_retry/road_segments`（Task 1）
- Produces: 注册任务名 `trackRoadParse`；行为=每 60s 扫 `road_status IN ('0','3') AND del_flag='0'` 最多 3 条：置 '1' → 匹配 → 成功置 '2' + 写 road_segments、road_retry=0；异常置 '3'、road_retry+1（下次周期继续重试，即"自行恢复直到完成"）

- [ ] **Step 1: 实现 tick 任务**

```python
"""轨迹路段解析自愈任务：每分钟消化待解析/失败轨迹，失败自动重试直到完成"""
from loguru import logger
from sqlalchemy import select, update

from app.core.database import async_session
from app.models.track import BizTrack
from app.services.road_match import match_track
from app.tasks.scheduler import register_task

BATCH = 3


@register_task("trackRoadParse")
async def track_road_parse():
    async with async_session() as db:
        rows = (await db.execute(
            select(BizTrack.track_id)
            .where(BizTrack.del_flag == "0", BizTrack.road_status.in_(("0", "3")))
            .order_by(BizTrack.track_id).limit(BATCH)
        )).all()
    for (track_id,) in rows:
        await parse_one(track_id)


async def parse_one(track_id: int) -> None:
    """单条解析：置 1 → 匹配 → 2/3。独立会话，失败不影响其他轨迹"""
    async with async_session() as db:
        track = await db.get(BizTrack, track_id)
        if not track or track.del_flag == "2" or track.road_status == "2":
            return
        track.road_status = "1"
        await db.commit()
        try:
            result = await match_track(track.geojson)
            track.road_segments = result
            track.road_status = "2"
            track.road_retry = 0
            logger.info(f"trackRoadParse: 轨迹 {track_id} 解析完成，"
                        f"匹配率 {result['matched_pct']}%，{len(result['segments'])} 段")
        except Exception as e:  # noqa: BLE001
            track.road_status = "3"
            track.road_retry += 1
            logger.warning(f"trackRoadParse: 轨迹 {track_id} 第 {track.road_retry} 次解析失败，"
                           f"下轮重试: {e}")
        await db.commit()
```

- [ ] **Step 2: 调度器注册内置任务（scheduler.py 的 init_scheduler 内、file_cleanup 注册之后）**

```python
        from app.tasks.road_parse import track_road_parse
        cls._scheduler.add_job(track_road_parse, "interval", seconds=60,
                               id="system-track-road-parse", name="轨迹路段解析",
                               replace_existing=True, max_instances=1)
```

- [ ] **Step 3: 语法与导入冒烟**

```bash
cd D:\Desktop\template_project\backend && uv run python -c "from app.tasks.road_parse import track_road_parse; from app.tasks.scheduler import _TASK_REGISTRY; assert 'trackRoadParse' in _TASK_REGISTRY; print('ok')"
```

- [ ] **Step 4: Commit（后端仓库）**

```bash
git add app/tasks/road_parse.py app/tasks/scheduler.py
git commit -m "feat: 轨迹路段解析周期任务（60s 自愈，失败自动重试）"
```

---

### Task 5: 后端——端到端验证（存量轨迹 9/10 自动解析）

- [ ] **Step 1: 交接用户重启后端**（dev server 由用户手动重启）

```bash
cd D:\Desktop\template_project\backend && uv run uvicorn app.main:app --host 0.0.0.0 --port 9099
```

- [ ] **Step 2: 等 1~2 分钟后查库核对状态机流转**

```bash
cd D:\Desktop\template_project\backend && uv run python -c "
import asyncio, sys
asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
sys.path.insert(0, '.')
import asyncmy
from app.core.config import DataBaseConfig
c = DataBaseConfig()
async def m():
    conn = await asyncmy.connect(host=c.host, port=c.port, user=c.username, password=c.password, db=c.database)
    cur = await conn.cursor()
    await cur.execute('SELECT track_id, road_status, road_retry, JSON_LENGTH(road_segments, \"$.segments\") FROM biz_track')
    [print(r) for r in await cur.fetchall()]
    conn.close()
asyncio.run(m())
"
```

Expected: track 9/10 的 road_status 先 '1' 后 '2'，segments 数 > 0。若为 '3'，看后端日志 road_retry 递增并排查（OpenFreeMap 国内偶发不可达即自恢复场景，多等几轮）。

- [ ] **Step 3: curl 验证详情接口带出新字段**

```bash
# 用前端登录态 token，或任一已登录会话：
curl -s http://127.0.0.1:9099/dev-api/track/9 -H "Authorization: Bearer <token>" | python -c "import json,sys; d=json.load(sys.stdin)['data']; print(d['road_status'], d['road_segments']['matched_pct'], len(d['road_segments']['segments']))"
```

Expected: `2 94.x >0`

---

### Task 6: 前端——类型 + 路段配色 + 路段列表面板组件

**Files:**
- Modify: `D:\Desktop\heroUI\src\types\track.ts`
- Create: `D:\Desktop\heroUI\src\components\track\roadColors.ts`
- Create: `D:\Desktop\heroUI\src\components\track\RoadSegments.tsx`

**Interfaces:**
- Consumes: 后端 road_segments JSON（数据契约见上）
- Produces:
  - `TrackRow.road_status: string` / `TrackRow.road_segments?: RoadSegmentsData | null`
  - `roadClassColor(cls: string | null): string`（两层共用）
  - `<RoadSegments data={RoadSegmentsData} points={TrackPoint[]} />`（列表 + 图例）

- [ ] **Step 1: types/track.ts 追加**

```ts
// OSM 路段匹配结果（biz_track.road_segments JSON，后端 road_match 服务产出）
export interface RoadSeg {
  s: number // 起点下标（闭）
  e: number // 终点下标（开）
  dist_s: number
  dist_e: number
  cls: string // OSM 原始 class：motorway/trunk/primary/…
  name: string | null
  brunnel: string | null // bridge/tunnel/ford
  avg_spd: number | null
}

export interface RoadSegmentsData {
  z: number
  matched_pct: number
  cls_by_point: (string | null)[]
  segments: RoadSeg[]
}
```

`TrackRow` 追加 `road_status: string` 与 `road_segments?: RoadSegmentsData | null`；`TrackDetail` 自动继承。

- [ ] **Step 2: roadColors.ts（class→色，语义从"快"到"慢/小"由暖到冷）**

```ts
// OSM 原始 class 配色（路段着色/图例共用）：等级高→暖色醒目，低等级/杂项→冷灰
const MAP: Record<string, string> = {
  motorway: '#ef4444',
  trunk: '#f97316',
  primary: '#eab308',
  secondary: '#84cc16',
  tertiary: '#22c55e',
  minor: '#14b8a6',
  service: '#94a3b8',
  track: '#a16207',
  path: '#a78bfa',
  raceway: '#ec4899',
  busway: '#06b6d4',
  ferry: '#3b82f6',
}

export function roadClassColor(cls: string | null | undefined): string {
  return (cls && MAP[cls]) || '#9ca3af'
}
```

- [ ] **Step 3: RoadSegments.tsx（路段列表卡 + 图例，风格随详情页既有卡片：rounded-2xl border border-separator）**

```tsx
// 路段分析面板：图例（出现过的 class）+ 分段列表（里程区间/长度/类别/路名/均速/桥隧）
import { Chip } from '@heroui/react'
import type { RoadSeg, RoadSegmentsData, TrackPoint } from '../../types/track'
import { roadClassColor } from './roadColors'

export function RoadLegend({ data }: { data: RoadSegmentsData }) {
  const used = [...new Set(data.segments.map((s) => s.cls))]
  return (
    <div className="flex flex-wrap gap-2">
      {used.map((cls) => (
        <span key={cls} className="inline-flex items-center gap-1 text-xs">
          <span className="h-1.5 w-4 rounded-full" style={{ background: roadClassColor(cls) }} />
          {cls}
        </span>
      ))}
    </div>
  )
}

export function RoadSegments({ data, points }: { data: RoadSegmentsData; points: TrackPoint[] }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h3 className="text-[13px] font-semibold">路段分析</h3>
        <span className="text-xs text-default-500">匹配率 {data.matched_pct}%（OSM z{data.z}）</span>
      </div>
      <RoadLegend data={data} />
      <div className="flex flex-col divide-y divide-separator">
        {data.segments.map((seg, i) => (
          <RoadSegRow key={i} seg={seg} />
        ))}
      </div>
    </div>
  )
}

function RoadSegRow({ seg }: { seg: RoadSeg }) {
  const len = seg.dist_e - seg.dist_s
  return (
    <div className="flex items-center gap-3 py-2 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: roadClassColor(seg.cls) }} />
      <span className="w-24 shrink-0 truncate" title={seg.name ?? undefined}>
        {seg.name ?? <span className="text-default-400">（无名路段）</span>}
      </span>
      <Chip size="sm" variant="flat" className="h-5 shrink-0 px-1 text-[11px]">{seg.cls}</Chip>
      {seg.brunnel ? (
        <Chip size="sm" variant="flat" className="h-5 shrink-0 px-1 text-[11px]">{seg.brunnel}</Chip>
      ) : null}
      <span className="ml-auto shrink-0 text-default-500">{(len / 1000).toFixed(1)} km</span>
      {seg.avg_spd != null ? (
        <span className="w-16 shrink-0 text-right text-default-500">{seg.avg_spd.toFixed(0)} km/h</span>
      ) : null}
    </div>
  )
}
```

（`points` prop 若列表不需要点数据可去掉——实现时以最终渲染为准，但导出名与 props 保持 `data` 必传。）

- [ ] **Step 4: tsc 核对**

```bash
cd D:\Desktop\heroUI && pnpm tsc --noEmit
```

- [ ] **Step 5: 不单独提交（与 Task 7-9 一并按功能提交）**

---

### Task 7: 前端——TrackMlLayer 路段着色模式

**Files:**
- Modify: `D:\Desktop\heroUI\src\components\track\TrackMlLayer.tsx`

**Interfaces:**
- Consumes: `RoadSegmentsData`、`roadClassColor`
- Produces: 新 prop `roadSegments?: { data: RoadSegmentsData } | null`——传入且非空时轨迹线按逐点 class 着色（新增 road-line 图层、隐藏速度渐变线）；null 时回到现状（速度渐变/主题色）

- [ ] **Step 1: 实现要点（沿用现有 source/layer 模式）**

- 新增常量 `ROAD_SRC = 'track-road-src'`、`ROAD_LAYER = 'track-road'`
- 新增构建函数：

```ts
function roadGeoJSON(points: TrackPoint[], data: RoadSegmentsData): FC {
  return {
    type: 'FeatureCollection',
    features: data.segments
      .filter((s) => s.e - s.s >= 2)
      .map((s) => ({
        type: 'Feature' as const,
        properties: { cls: s.cls },
        geometry: {
          type: 'LineString' as const,
          coordinates: points.slice(s.s, s.e).map((p) => [p.lng, p.lat] as [number, number]),
        },
      })),
  }
}
```

- 主 effect：`roadSegments?.data` 存在时——`map.addSource(ROAD_SRC, { type: 'geojson', data: roadGeoJSON(...) })` + `addLayer({ id: ROAD_LAYER, type: 'line', source: ROAD_SRC, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ['get', ['get', 'cls'], ['literal', ROAD_COLOR_MAP_JSON]] , 'line-width': 4, 'line-opacity': 0.92 } })`，并对 `LINE_LAYER` 执行 `map.setLayoutProperty(LINE_LAYER, 'visibility', 'none')`；`roadSegments` 为 null 或卸载时反向恢复。`ROAD_COLOR_MAP_JSON` = roadColors 的 `MAP` 原对象导入（expression literal 需纯 JSON）。
- 注意 `style.load` 重建路径（现有 setup 已处理整体重建，road source/layer 放进同一 setup 内）
- 依赖数组加 `roadSegments`

- [ ] **Step 2: tsc 核对**

```bash
cd D:\Desktop\heroUI && pnpm tsc --noEmit
```

---

### Task 8: 前端——TrackAmapLayer 路段着色

**Files:**
- Modify: `D:\Desktop\heroUI\src\components\track\TrackAmapLayer.tsx`

**Interfaces:**
- Consumes: 同 Task 7
- Produces: 新 prop `roadSegments?: { data: RoadSegmentsData } | null`——存在时按 segment 分段绘制多条 `AMap.Polyline`（各自 `strokeColor: roadClassColor(seg.cls)`，路径取 GCJ 缓存数组 `slice(s, e)`），并隐藏原单色 Polyline

- [ ] **Step 1: 实现**

- 仿现有 `useEffect + setMap` 生命周期：新增独立 effect，依赖 `[map, gcjPath, roadSegments]`
- 维护 `roadPolysRef: AMap.Polyline[]`；进入路段模式时 `setVisible(false)` 原线、逐段 `new AMap.Polyline({ path: gcjPath.slice(seg.s, seg.e), strokeColor: roadClassColor(seg.cls), strokeWeight: 5, showDir: false }).setMap(map)`；退出时逐个 `setMap(null)` 并恢复原线可见
- 未匹配区间（相邻 segment 之间的 gap）自然断线，与 ML 层行为一致

- [ ] **Step 2: tsc 核对（同 Task 7）**

---

### Task 9: 前端——详情页集成（状态标识 + 着色切换 + 路段面板）

**Files:**
- Modify: `D:\Desktop\heroUI\src\pages\map\track.tsx`

**Interfaces:**
- Consumes: Task 6/7/8 的全部导出；`TrackDetail.road_status / road_segments`

- [ ] **Step 1: TrackDetailView 增加状态与模式 state**

```tsx
const roadData = detail.road_status === '2' ? detail.road_segments ?? null : null
const [colorMode, setColorMode] = useState<'speed' | 'road'>('speed')
const roadActive = roadData != null && colorMode === 'road'
```

（detail 的获取沿用页面现有 useQuery detail 数据流；`road_status` 直接来自 `TrackRow` 扩展。）

- [ ] **Step 2: 状态标识（地图上方/指标卡区域，软色 Chip 风格，12px）**

```tsx
{detail.road_status === '0' || detail.road_status === '1' ? (
  <span className="inline-flex items-center gap-1 text-xs text-default-500">
    <span className="size-1.5 animate-pulse rounded-full bg-warning" /> 路段解析中，完成后可查看
  </span>
) : null}
{detail.road_status === '3' ? (
  <span className="inline-flex items-center gap-1 text-xs text-default-500">
    <span className="size-1.5 rounded-full bg-danger" /> 路段解析失败，将自动重试
  </span>
) : null}
```

- [ ] **Step 3: 着色切换控件（仅 roadData 存在时显示；与页面既有 Button 组风格一致：size sm 软底）**

```tsx
{roadData ? (
  <div className="inline-flex overflow-hidden rounded-lg border border-separator">
    <button onClick={() => setColorMode('speed')}
      className={colorMode === 'speed' ? 'bg-surface-secondary px-2 py-1 text-xs font-medium' : 'px-2 py-1 text-xs text-default-500'}>
      速度
    </button>
    <button onClick={() => setColorMode('road')}
      className={colorMode === 'road' ? 'bg-surface-secondary px-2 py-1 text-xs font-medium' : 'px-2 py-1 text-xs text-default-500'}>
      路段
    </button>
  </div>
) : null}
```

- [ ] **Step 4: 图层 props 接线**

```tsx
<TrackMlLayer
  {...existing}
  roadSegments={roadActive ? { data: roadData } : null}
/>
<TrackAmapLayer
  {...existing}
  roadSegments={roadActive ? { data: roadData } : null}
/>
```

路段模式下隐藏 `SpeedLegend`（`speedRange && !panelOpen` 条件加 `colorMode === 'speed'`），路段模式下显示 `RoadLegend`（复用 Task 6，浮在地图下方图例位或与 SpeedLegend 同位）。

- [ ] **Step 5: 路段面板（详情底部时序分析区追加一节，card 样式随现有分区）**

```tsx
{roadData ? (
  <div className="rounded-2xl border border-separator p-4">
    <RoadSegments data={roadData} points={points} />
  </div>
) : null}
```

- [ ] **Step 6: 全量验证**

```bash
cd D:\Desktop\heroUI && pnpm tsc --noEmit && pnpm build
```

Expected: 均通过

- [ ] **Step 7: 用户手验清单（浏览器，dev 5173）**

- 打开轨迹 9 详情：先见"解析中"（若后端尚未跑完）→ 数十秒后刷新出现"路段"切换
- 切「路段」：轨迹按 class 分色，ML/高德两层都生效，未匹配段断线
- 路段列表与地图颜色一致，九华北路为 trunk 长段
- 切回「速度」恢复速度渐变

- [ ] **Step 8: Commit（前端仓库——需用户先 checkpoint 轨迹 WIP，或用户明确同意由本任务一并提交）**

```bash
git add src/types/track.ts src/components/track/roadColors.ts src/components/track/RoadSegments.tsx src/components/track/TrackMlLayer.tsx src/components/track/TrackAmapLayer.tsx src/pages/map/track.tsx
git commit -m "feat: 轨迹详情路段分析（OSM 匹配状态/路段着色/分段列表）"
```

---

## Self-Review 记录

- 规格覆盖：在线瓦片✓(T3)、全轨迹走 OSM（无国别分支）✓、上传后异步慢慢解析✓(T4 周期任务，非上传阻塞)、状态标识✓(T1/T9)、失败自恢复✓(T4 road_status='3' 下轮重试)、完成后可查✓(T9 roadData 门控)、原始 class 字段✓(契约与 UI 均直出 class)
- 占位符：T3 Step 2 为显式探测步骤（附两种形状的调整指引），非 TBD；T6 RoadSegments 的 points prop 标注了可裁剪的裁量权
- 类型一致性：RoadSegmentsData/RoadSeg 在 T6 定义、T7/T8/T9 消费一致；match_track 返回值与契约一致；road_status 字符串字面量 '0'/'1'/'2'/'3' 全文一致
