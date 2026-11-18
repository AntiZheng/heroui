# HMM 路段解析实施计划（与瓦片法共存，参数切换）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保留现有 OSM 瓦片路段解析的前提下新增 HMM 地图匹配解析方法，二者输出同一契约，由参数 `sys.track.roadMatcher` 全局切换（仅影响新解析）。

**Architecture:** 新增两个后端服务模块——`road_graph.py`（Overpass bbox 精确建图 + Redis 缓存，拓扑来自 way 节点引用 id）与 `road_match_hmm.py`（Newson & Krumm 发射/转移 + 带界 Dijkstra 路由 + Viterbi 解码 + 契约构建）；现有 `road_match.py` 一行不动；`road_parse.parse_one` 读参数选策略并写 `biz_track.road_matcher`。前端仅三处小改动。

**Tech Stack:** Python 3.12 + FastAPI/SQLModel/alembic（uv 工程）；httpx（复用 road_match 的 Overpass 客户端）；Redis（图缓存）；React + HeroUI v3 + TypeScript（前端）。

**Spec:** [docs/superpowers/specs/2026-11-12-hmm-road-matching-design.md](../specs/2026-11-12-hmm-road-matching-design.md)

## Global Constraints

- 后端仓库：`D:\Desktop\template_project\backend`（独立 git 仓库，uv 工程）。测试命令一律 `uv run pytest tests/<file>::<test> -v`（在 backend 目录下执行）。
- 前端仓库：`D:\Desktop\heroUI`。验证命令：`pnpm build`（= `tsc --noEmit && vite build`）。
- git 身份未配置：每次提交用临时环境变量 `GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local`，勿改 git config；不 push。
- Overpass 不走代理（用户明确否决）；`httpx trust_env=False` 已在 road_match._overpass_query 内置，直接复用，mail.ru 镜像首位 + 两轮重试。
- 契约键固定不变：顶层 `{z, matched_pct, cls_by_point, segments}`；segment 键 31 个（Task 7 测试里逐字断言），必须与 `road_parse.parse_one` 落库读取的字段全集一致。
- **契约近似（记录在案）**：HMM 的 `routes` 恒为 `None`（Overpass way tags 无 route 关系展开，与瓦片法来自 MVT route_N 键不同源）；`expressway` = `road_cls=='motorway'`；`ramp` = highway 以 `_link` 结尾；`mtb_scale` 取 OSM 标签 `mtb:scale`。
- Windows 控制台 GBK：脚本/测试输出不要打印非 ASCII 特殊符号。
- 常量初值（spec §11，均标注"我定的可调"）：σ=10m、候选截断 100m、候选上限 8、路由搜索界=2×位移+200m、图缓存 TTL 24h、bbox 外扩 200m 按 0.01° 网格取包含方向圆整；β=轨迹点距中位数（动态）。

---

### Task 1: 迁移 007 + BizTrack.road_matcher 列 + roads 接口返回方法

**Files:**
- Create: `alembic/versions/007_track_road_matcher.py`
- Modify: `app/models/track.py`（BizTrack，road_data 字段之后）
- Modify: `app/services/track.py:42-54`（get_road_segments 返回值）

**Interfaces:**
- Produces: `BizTrack.road_matcher: str | None`（'tile'|'hmm'）；`GET /track/{id}/roads` 响应新增 `"matcher": str | null`（Task 9 前端消费）。

- [ ] **Step 1: 写迁移文件**

```python
"""biz_track 加 road_matcher 列（路段解析方法：tile/hmm，历史行回填 tile）

Revision ID: 007
Revises: 006
"""
import sqlalchemy as sa

from alembic import op

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("biz_track",
                  sa.Column("road_matcher", sa.String(10),
                            comment="路段解析方法(tile=瓦片匹配/hmm=HMM 匹配)"))
    op.execute("UPDATE biz_track SET road_matcher = 'tile'")


def downgrade() -> None:
    op.drop_column("biz_track", "road_matcher")
```

- [ ] **Step 2: 模型加列**（app/models/track.py，`road_data` 字段后追加）

```python
    road_matcher: str | None = Field(default=None, max_length=10,
                                     description="路段解析方法(tile=瓦片匹配/hmm=HMM 匹配)")
```

- [ ] **Step 3: 接口响应加 matcher**（app/services/track.py get_road_segments 的 return 改为）

```python
        return {
            "segments": [TrackRoadItem.model_validate(s).model_dump() for s in segments],
            "matched_pct": track.road_matched_pct,
            "matcher": track.road_matcher,
        }
```

- [ ] **Step 4: 执行迁移并验证**

Run: `uv run alembic upgrade head` → 输出含 `Running upgrade 006 -> 007`；再 `uv run alembic current` 显示 `007`。

- [ ] **Step 5: Commit**

```bash
git add alembic/versions/007_track_road_matcher.py app/models/track.py app/services/track.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: biz_track 加 road_matcher 列（迁移 007）与 roads 接口返回解析方法"
```

---

### Task 2: road_graph.py —— Overpass 精确建图（纯函数）

**Files:**
- Create: `app/services/road_graph.py`
- Test: `tests/test_road_graph.py`

**Interfaces:**
- Consumes: `road_match.EARTH_R`（6371000.0）、`road_match._overpass_query(query: str) -> list[dict] | None`（私有名跨模块导入，不改其可见性）。
- Produces: `class Graph`（`nodes: dict[int, (lat, lng)]`、`ways: list[dict]`——way dict 含 `id/refs/coords[(lng,lat)]/road_cls/tags/cum[累计里程米]`——`node_ways: dict[int, list[(way_idx, pos)]]`、`cells: dict[(int,int), list[int]]`）；`expand_round_bbox(minx, miny, maxx, maxy) -> (minx, miny, maxx, maxy)`；`build_overpass_query(bbox) -> str`；`haversine_m(lat1, lng1, lat2, lng2) -> float`；`build_graph_from_elements(elements) -> Graph`。Task 3/4/5/7 依赖以上全部。

- [ ] **Step 1: 写失败测试**（tests/test_road_graph.py）

```python
import math

import pytest

from app.services import road_graph
from app.services.road_graph import (
    build_graph_from_elements,
    build_overpass_query,
    expand_round_bbox,
)


def _elements():
    """合成 Overpass 响应：way100(甲路 primary 1→2→3) 与 way101(甲路 3→5) 共享节点 3=真路口；
    way102(居民路 4→5)；way103(footway) 应被过滤；node6 无引用节点坐标缺失（way104 引用它应被丢）"""
    return [
        {"type": "node", "id": 1, "lat": 31.000, "lon": 118.000},
        {"type": "node", "id": 2, "lat": 31.001, "lon": 118.000},
        {"type": "node", "id": 3, "lat": 31.002, "lon": 118.000},
        {"type": "node", "id": 4, "lat": 31.000, "lon": 118.010},
        {"type": "node", "id": 5, "lat": 31.005, "lon": 118.010},
        {"type": "way", "id": 100, "tags": {"highway": "primary", "name": "甲路", "maxspeed": "60"},
         "nodes": [1, 2, 3]},
        {"type": "way", "id": 101, "tags": {"highway": "trunk_link", "name": "甲路匝道"},
         "nodes": [3, 5]},
        {"type": "way", "id": 102, "tags": {"highway": "residential", "name": "小区路"},
         "nodes": [4, 5]},
        {"type": "way", "id": 103, "tags": {"highway": "footway"}, "nodes": [1, 4]},
        {"type": "way", "id": 104, "tags": {"highway": "primary"}, "nodes": [1, 999]},
    ]


def test_expand_round_bbox_contains_and_grid():
    bbox = expand_round_bbox(118.1234, 31.0567, 118.1300, 31.0600)
    assert bbox[0] <= 118.1234 and bbox[1] <= 31.0567
    assert bbox[2] >= 118.1300 and bbox[3] >= 31.0600
    for v in bbox:  # 全部落在 0.01° 网格上
        assert math.isclose(v / 0.01, round(v / 0.01), abs_tol=1e-9)


def test_build_overpass_query_order():
    q = build_overpass_query((118.0, 31.0, 118.1, 31.1))
    assert "(31.0,118.0,31.1,118.1)" in q      # Overpass 顺序 south,west,north,east
    assert "out body;node(w);out skel;" in q   # 节点引用 + 坐标两段输出


def test_build_graph_filters_and_maps():
    g = build_graph_from_elements(_elements())
    assert len(g.ways) == 3                     # footway 过滤、引用缺失的 way104 丢弃
    assert g.ways[0]["road_cls"] == "primary"
    assert g.ways[1]["road_cls"] == "primary"   # trunk_link → primary（road_cls 取主类）
    assert g.ways[1]["subclass_like"] if False else g.ways[1]["tags"]["highway"] == "trunk_link"
    assert g.ways[2]["road_cls"] == "minor"     # residential → minor
    assert g.ways[0]["tags"]["name"] == "甲路"


def test_build_graph_topology_and_cum():
    g = build_graph_from_elements(_elements())
    assert g.ways[0]["cum"][0] == 0.0
    assert g.ways[0]["cum"][2] == pytest.approx(g.ways[0]["cum"][1] * 2, rel=1e-3)  # 等长两段
    # 共享节点 3：way100 与 way101 都经过 → 真拓扑
    owners = {w for w, _ in g.node_ways[3]}
    assert owners == {0, 1}
    # 空间格网：way100 的顶点所在格含 way0
    cell = (math.floor(118.0 / road_graph.CELL_DEG), math.floor(31.0005 / road_graph.CELL_DEG))
    assert 0 in g.cells.get(cell, [])
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_graph.py -v`
Expected: FAIL（`ModuleNotFoundError: app.services.road_graph`）

- [ ] **Step 3: 实现 road_graph.py**

```python
"""HMM 路网图：Overpass bbox 精确建图（Task 3 加 Redis 缓存）。

拓扑来自 way 的节点引用 id——共享节点=真路口，立交/隧道天然不误连；
way 身份天然存在（无瓦片分块问题）。图按轨迹 bbox 按需构建，处理完释放。
"""
import json
import math

from app.services.road_match import EARTH_R, _overpass_query

GRAPH_BBOX_PAD_M = 200.0    # bbox 外扩：保证轨迹端点处的路口连通性
GRAPH_GRID_DEG = 0.01       # 缓存圆整网格（~1.1km），取包含方向
GRAPH_TTL = 3600 * 24       # 图缓存 TTL
CELL_DEG = 0.02             # 候选查询空间格网边长（~2km），取 3×3 邻域

_CLASS_MAP = {
    "motorway": "motorway", "motorway_link": "motorway",
    "trunk": "trunk", "trunk_link": "trunk",
    "primary": "primary", "primary_link": "primary",
    "secondary": "secondary", "secondary_link": "secondary",
    "tertiary": "tertiary", "tertiary_link": "tertiary",
    "unclassified": "minor", "residential": "minor", "living_street": "minor",
    "service": "service",
}


class Graph:
    def __init__(self) -> None:
        self.nodes: dict[int, tuple[float, float]] = {}        # node_id → (lat, lng)
        self.ways: list[dict] = []                             # {id, refs, coords[(lng,lat)], road_cls, tags, cum}
        self.node_ways: dict[int, list[tuple[int, int]]] = {}  # node_id → [(way_idx, refs 下标)]
        self.cells: dict[tuple[int, int], list[int]] = {}      # 格网 → [way_idx]


def expand_round_bbox(minx: float, miny: float, maxx: float, maxy: float) -> tuple[float, float, float, float]:
    """轨迹 bbox 外扩 ~200m 后按 0.01° 网格取包含方向圆整（min 向下取整、max 向上取整，
    保证缓存图必覆盖轨迹所需）"""
    mlon = 111320.0 * math.cos(math.radians((miny + maxy) / 2))
    pad_x = GRAPH_BBOX_PAD_M / mlon
    pad_y = GRAPH_BBOX_PAD_M / 111320.0
    g = GRAPH_GRID_DEG
    return (math.floor((minx - pad_x) / g) * g,
            math.floor((miny - pad_y) / g) * g,
            math.ceil((maxx + pad_x) / g) * g,
            math.ceil((maxy + pad_y) / g) * g)


def build_overpass_query(bbox: tuple[float, float, float, float]) -> str:
    """out body 给 way 节点引用+全量 tags；node(w); out skel 给引用节点坐标——合成精确拓扑图"""
    minx, miny, maxx, maxy = bbox
    return (f"[out:json][timeout:60];way['highway']({miny},{minx},{maxy},{maxx});"
            "out body;node(w);out skel;")


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = (math.sin((p2 - p1) / 2) ** 2
         + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2)
    return 2 * EARTH_R * math.asin(math.sqrt(a))


def _index_way(g: Graph, widx: int) -> None:
    """登记 way 的双向索引：节点归属 + 空间格网（按 way 外接范围）"""
    way = g.ways[widx]
    for pos, nid in enumerate(way["refs"]):
        g.node_ways.setdefault(nid, []).append((widx, pos))
    lngs = [c[0] for c in way["coords"]]
    lats = [c[1] for c in way["coords"]]
    for cx in range(math.floor(min(lngs) / CELL_DEG), math.floor(max(lngs) / CELL_DEG) + 1):
        for cy in range(math.floor(min(lats) / CELL_DEG), math.floor(max(lats) / CELL_DEG) + 1):
            g.cells.setdefault((cx, cy), []).append(widx)


def _make_way(g: Graph, osm_id: int, refs: list[int], road_cls: str, tags: dict) -> None:
    coords = [g.nodes[r] for r in refs]              # [(lat, lng)]
    cum = [0.0]
    for (la, lo), (lb, ob) in zip(coords, coords[1:]):
        cum.append(cum[-1] + haversine_m(la, lo, lb, ob))
    widx = len(g.ways)
    g.ways.append({"id": osm_id, "refs": refs,
                   "coords": [(lo, la) for la, lo in coords],   # 统一 (lng, lat) 与轨迹一致
                   "road_cls": road_cls, "tags": tags, "cum": cum})
    _index_way(g, widx)


def build_graph_from_elements(elements: list[dict]) -> Graph:
    """Overpass elements → Graph：drivable 词表过滤 + road_cls 映射 + 累计里程 + 双向索引"""
    g = Graph()
    for el in elements:
        if el.get("type") == "node" and el.get("lat") is not None:
            g.nodes[el["id"]] = (el["lat"], el["lon"])
    for el in elements:
        if el.get("type") != "way":
            continue
        tags = el.get("tags") or {}
        road_cls = _CLASS_MAP.get(tags.get("highway"))
        refs = el.get("nodes") or []
        if road_cls is None or len(refs) < 2 or any(r not in g.nodes for r in refs):
            continue
        _make_way(g, el["id"], refs, road_cls, tags)
    return g
```

测试里 `subclass_like` 一行是笔误防护——直接断言 tags；实现以本步代码为准。

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_road_graph.py -v`
Expected: 4 PASS（test_cache 系列在 Task 3 才加）

- [ ] **Step 5: Commit**

```bash
git add app/services/road_graph.py tests/test_road_graph.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: HMM 路网图 Overpass 精确建图（共享节点拓扑+drivable 词表+空间格网）"
```

---

### Task 3: 路网图 Redis 缓存 + get_or_build_graph

**Files:**
- Modify: `app/services/road_graph.py`（追加缓存段）
- Test: `tests/test_road_graph.py`（追加）

**Interfaces:**
- Consumes: Task 2 全部；`road_match._overpass_query`。
- Produces: `graph_to_json(g) -> str`、`graph_from_json(raw) -> Graph`、`graph_cache_key(bbox) -> str`、`async get_or_build_graph(redis, bbox) -> Graph`（redis 可为 None=不缓存；Overpass 全失败抛 `RuntimeError`）。Task 7 依赖 `get_or_build_graph`。

- [ ] **Step 1: 追加失败测试**（tests/test_road_graph.py 末尾）

```python
class FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, k):
        return self.store.get(k)

    async def setex(self, k, ttl, v):
        self.store[k] = v


def test_graph_json_roundtrip():
    g = build_graph_from_elements(_elements())
    g2 = road_graph.graph_from_json(road_graph.graph_to_json(g))
    assert len(g2.ways) == 3
    assert g2.ways[0]["tags"]["name"] == "甲路"
    assert {w for w, _ in g2.node_ways[3]} == {0, 1}      # 索引在反序列化后重建
    assert g2.ways[0]["cum"][1] == pytest.approx(g.ways[0]["cum"][1], rel=1e-6)


def test_cache_hit_and_failure(monkeypatch):
    import asyncio
    calls = {"n": 0}

    async def fake_query(q):
        calls["n"] += 1
        return _elements()

    async def fail_query(q):
        return None

    monkeypatch.setattr(road_graph, "_overpass_query", fake_query)
    r = FakeRedis()
    bbox = (118.0, 31.0, 118.1, 31.1)
    g1 = asyncio.run(road_graph.get_or_build_graph(r, bbox))
    g2 = asyncio.run(road_graph.get_or_build_graph(r, bbox))
    assert calls["n"] == 1                                  # 第二次命中缓存
    assert len(g2.ways) == len(g1.ways) == 3

    monkeypatch.setattr(road_graph, "_overpass_query", fail_query)
    with pytest.raises(RuntimeError):
        asyncio.run(road_graph.get_or_build_graph(None, bbox))  # 查询失败抛错（自愈重试依赖）
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_graph.py -v`
Expected: 新增 2 个 FAIL（`graph_from_json` 未定义），原 4 个 PASS

- [ ] **Step 3: 实现**（road_graph.py 末尾追加）

```python
def graph_to_json(g: Graph) -> str:
    return json.dumps({
        "nodes": [[nid, la, lo] for nid, (la, lo) in g.nodes.items()],
        "ways": [{"id": w["id"], "refs": w["refs"], "road_cls": w["road_cls"],
                  "tags": w["tags"]} for w in g.ways],
    }, ensure_ascii=False, separators=(",", ":"))


def graph_from_json(raw: str) -> Graph:
    """反序列化并重建双向索引/累计里程（cum 不落盘，重算 <1ms 量级）"""
    data = json.loads(raw)
    g = Graph()
    for nid, la, lo in data["nodes"]:
        g.nodes[nid] = (la, lo)
    for w in data["ways"]:
        _make_way(g, w["id"], w["refs"], w["road_cls"], w["tags"])
    return g


def graph_cache_key(bbox: tuple[float, float, float, float]) -> str:
    s, w, n, e = bbox
    return f"road_graph:{s:.2f},{w:.2f},{n:.2f},{e:.2f}"


async def get_or_build_graph(redis, bbox: tuple[float, float, float, float]) -> Graph:
    """Redis 缓存优先（TTL 24h）；miss 时 Overpass 建图并回填。
    Overpass 全端点失败抛 RuntimeError → road_parse 现有 except → road_status=3 自愈重试"""
    key = graph_cache_key(bbox)
    if redis is not None:
        cached = await redis.get(key)
        if cached:
            return graph_from_json(cached)
    elements = await _overpass_query(build_overpass_query(bbox))
    if elements is None:
        raise RuntimeError("road_graph: Overpass 建图查询失败（全部端点）")
    g = build_graph_from_elements(elements)
    if redis is not None and g.ways:
        await redis.setex(key, GRAPH_TTL, graph_to_json(g))
    return g
```

- [ ] **Step 4: 跑测试确认全部通过**

Run: `uv run pytest tests/test_road_graph.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/road_graph.py tests/test_road_graph.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: 路网图 Redis 缓存（bbox 圆整 key，TTL 24h）"
```

---

### Task 4: HMM 几何与概率纯函数

**Files:**
- Create: `app/services/road_match_hmm.py`
- Test: `tests/test_road_match_hmm.py`

**Interfaces:**
- Consumes: `road_graph.haversine_m`。
- Produces: 常量 `SIGMA_M=10.0 / CAND_M=100.0 / CAND_MAX=8 / ROUTE_BOUND_PAD_M=200.0 / LOG_INF=-1e18`；`emission_log(dist) -> float`；`transition_log(route_m, step_m, beta) -> float`；`project_point_on_segment(px, py, ax, ay, bx, by) -> (dist_m, t)`（全 (lng,lat)）。Task 5/6 依赖常量与这些函数。

- [ ] **Step 1: 写失败测试**（tests/test_road_match_hmm.py）

```python
import math

import pytest

from app.services.road_match_hmm import (
    CAND_M,
    SIGMA_M,
    emission_log,
    project_point_on_segment,
    transition_log,
)


def test_emission_log_shape():
    base = -math.log(SIGMA_M * math.sqrt(2 * math.pi))
    assert emission_log(0.0) == pytest.approx(base)          # 距离 0 = 纯归一化项
    assert emission_log(SIGMA_M) == pytest.approx(base - 0.5)
    assert emission_log(CAND_M) < emission_log(SIGMA_M)      # 越远越差


def test_transition_log_shape():
    assert transition_log(50.0, 50.0, 35.0) == pytest.approx(0.0)   # 路径长=位移 → 最优
    assert transition_log(100.0, 50.0, 35.0) < transition_log(60.0, 50.0, 35.0)


def test_project_point_on_segment():
    d, t = project_point_on_segment(118.0, 31.0, 118.0, 31.0, 118.001, 31.0)
    assert d == pytest.approx(0.0, abs=1e-6) and t == pytest.approx(0.0)
    d, t = project_point_on_segment(118.0005, 31.0, 118.0, 31.0, 118.001, 31.0)
    assert t == pytest.approx(0.5)                            # 线段中点上方
    d, t = project_point_on_segment(117.999, 31.0, 118.0, 31.0, 118.001, 31.0)
    assert t == pytest.approx(0.0)                            # 延长线外钳到端点
    assert d > 0
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**（app/services/road_match_hmm.py）

```python
"""HMM 地图匹配：Newson & Krumm (2009) 经典公式，全程 log 域防下溢。

状态=路网图上的候选投影，观测=GPS 点；发射=点到边距离高斯，
转移=|路网路径长−实际位移| 指数——路网绕路（拐进横路再拐回/并行路错换）
在全局序列上被自然拒绝，无需折角/粘滞类启发式。
"""
import math

from app.services.road_graph import haversine_m

SIGMA_M = 10.0             # 发射高斯 σ：实测 GPS 骑线噪声 6~15m 带内（我定的可调）
CAND_M = 100.0             # 候选截断半径；matched_pct=有候选（≤截断）点占比
CAND_MAX = 8               # 每点候选上限：防密集路网爆炸
ROUTE_BOUND_PAD_M = 200.0  # 路由搜索界 = 2×点间位移 + PAD（我定的可调）
LOG_INF = -1e18


def emission_log(dist: float) -> float:
    return -0.5 * (dist / SIGMA_M) ** 2 - math.log(SIGMA_M * math.sqrt(2 * math.pi))


def transition_log(route_m: float, step_m: float, beta: float) -> float:
    return -abs(route_m - step_m) / beta


def project_point_on_segment(px: float, py: float, ax: float, ay: float,
                             bx: float, by: float) -> tuple[float, float]:
    """点 (lng,lat) → 线段投影：→ (dist_m, t∈[0,1])，等距柱面米制近似"""
    m_lat = 111320.0
    m_lng = 111320.0 * math.cos(math.radians((ay + by) / 2))
    axm, aym = ax * m_lng, ay * m_lat
    bxm, bym = bx * m_lng, by * m_lat
    pxm, pym = px * m_lng, py * m_lat
    vx, vy = bxm - axm, bym - aym
    l2 = vx * vx + vy * vy
    t = 0.0 if l2 == 0 else max(0.0, min(1.0, ((pxm - axm) * vx + (pym - aym) * vy) / l2))
    return math.hypot(pxm - (axm + t * vx), pym - (aym + t * vy)), t
```

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 3 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/road_match_hmm.py tests/test_road_match_hmm.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: HMM 几何与概率纯函数（投影/发射/转移，log 域）"
```

---

### Task 5: 候选提取 + 带界 Dijkstra 路由

**Files:**
- Modify: `app/services/road_match_hmm.py`（追加）
- Test: `tests/test_road_match_hmm.py`（追加）

**Interfaces:**
- Consumes: Task 2 `Graph/haversine_m/CELL_DEG`、Task 4 常量与投影。
- Produces: `candidates_of(graph, lng, lat) -> list[dict]`（候选 dict 形如 `{"dist": float, "along": float, "way": int, "seg": int}`，按 dist 升序、每 way 去重、上限 CAND_MAX）；`route_distance(graph, c1, c2, bound) -> float | None`（同 way=里程差；跨 way=带界 Dijkstra；不可达 None）。Task 6/7 依赖两者。

- [ ] **Step 1: 追加失败测试**

```python
# ---- Task 5：候选提取 + 路由 ----

def _graph():
    """way0: 甲路 primary，1(31.000,118.000)→2(31.001,118.000)→3(31.002,118.000)；
    way1: 甲路匝道 trunk_link，3→5(31.005,118.010)（共享节点 3，向东拐出）；
    way2: 辅道 service，与 way0 平行偏东 ~0.0001°（骑线打平场景），1→2 平行点"""
    from app.services.road_graph import build_graph_from_elements
    return build_graph_from_elements([
        {"type": "node", "id": 1, "lat": 31.000, "lon": 118.000},
        {"type": "node", "id": 2, "lat": 31.001, "lon": 118.000},
        {"type": "node", "id": 3, "lat": 31.002, "lon": 118.000},
        {"type": "node", "id": 4, "lat": 31.005, "lon": 118.010},
        {"type": "node", "id": 5, "lat": 31.005, "lon": 118.0001},
        {"type": "node", "id": 6, "lat": 31.000, "lon": 118.0001},
        {"type": "way", "id": 100, "tags": {"highway": "primary", "name": "甲路", "maxspeed": "60"},
         "nodes": [1, 2, 3]},
        {"type": "way", "id": 101, "tags": {"highway": "trunk_link", "name": "甲路匝道"},
         "nodes": [3, 4]},
        {"type": "way", "id": 102, "tags": {"highway": "service"},
         "nodes": [6, 5]},
    ])


def test_candidates_nearest_and_dedupe():
    from app.services.road_match_hmm import candidates_of
    g = _graph()
    # 骑线点：在 way0 与 way2 平行线正中间 → 两 way 各留一条候选（同 way 多段去重）
    cands = candidates_of(g, 118.00005, 31.0005)
    ways = [c["way"] for c in cands]
    assert len(ways) == len(set(ways))                     # 每 way 一条
    assert set(ways) == {0, 2}
    assert cands[0]["dist"] <= cands[1]["dist"]            # 按 dist 升序


def test_candidates_none_far_away():
    from app.services.road_match_hmm import candidates_of
    assert candidates_of(_graph(), 118.5, 31.5) == []      # 远离路网


def test_route_same_and_cross_way():
    from app.services.road_match_hmm import route_distance
    g = _graph()
    c_a = {"dist": 0.0, "along": 55.0, "way": 0, "seg": 0}
    c_b = {"dist": 0.0, "along": 155.0, "way": 0, "seg": 1}
    assert route_distance(g, c_a, c_b, 1000.0) == pytest.approx(100.0)   # 同 way=里程差
    c_c = {"dist": 0.0, "along": 0.0, "way": 1, "seg": 0}
    r = route_distance(g, c_a, c_c, 1000.0)                              # 跨 way 经共享节点 3
    assert r is not None and r > 0
    assert route_distance(g, c_a, c_c, 1.0) is None                      # 界内不可达 → None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 新增 3 FAIL，原 3 PASS

- [ ] **Step 3: 实现**（road_match_hmm.py 追加）

```python
import heapq

from app.services.road_graph import CELL_DEG, Graph


def candidates_of(graph: Graph, lng: float, lat: float) -> list[dict]:
    """3×3 格网邻域内投影 → 候选列表。dist≤CAND_M、每 way 去重（保最近段）、
    按 dist 升序截前 CAND_MAX。候选形如 {"dist", "along", "way", "seg"}"""
    out: list[dict] = []
    cx, cy = math.floor(lng / CELL_DEG), math.floor(lat / CELL_DEG)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for widx in graph.cells.get((cx + dx, cy + dy), []):
                way = graph.ways[widx]
                for i in range(len(way["coords"]) - 1):
                    ax, ay = way["coords"][i]
                    bx, by = way["coords"][i + 1]
                    d, t = project_point_on_segment(lng, lat, ax, ay, bx, by)
                    if d <= CAND_M:
                        along = way["cum"][i] + t * (way["cum"][i + 1] - way["cum"][i])
                        out.append({"dist": d, "along": along, "way": widx, "seg": i})
    out.sort(key=lambda c: c["dist"])
    uniq: list[dict] = []
    seen: set[int] = set()
    for c in out:
        if c["way"] in seen:
            continue
        seen.add(c["way"])
        uniq.append(c)
    return uniq[:CAND_MAX]


def route_distance(graph: Graph, c1: dict, c2: dict, bound: float) -> float | None:
    """候选间路网路径长（米）。同 way=投影里程差；跨 way=带界 Dijkstra（沿 way 走到节点、
    经共享节点跳跃）。界内不可达 → None（转移按 -inf 处理）"""
    if c1["way"] == c2["way"]:
        return abs(c1["along"] - c2["along"])
    w1, w2 = graph.ways[c1["way"]], graph.ways[c2["way"]]
    src = {w1["refs"][c1["seg"]]: c1["along"] - w1["cum"][c1["seg"]],
           w1["refs"][c1["seg"] + 1]: w1["cum"][c1["seg"] + 1] - c1["along"]}
    tgt = {w2["refs"][c2["seg"]]: c2["along"] - w2["cum"][c2["seg"]],
           w2["refs"][c2["seg"] + 1]: w2["cum"][c2["seg"] + 1] - c2["along"]}
    best: dict[int, float] = {}
    heap = sorted((d, nid) for nid, d in src.items())
    best_target: float | None = None
    while heap:
        d, nid = heapq.heappop(heap)
        if d > bound:
            break
        if nid in best:        # 非负权重下首次弹出即最短，其后皆陈旧
            continue
        best[nid] = d
        if nid in tgt:
            total = d + tgt[nid]
            if total <= bound and (best_target is None or total < best_target):
                best_target = total
        for widx, pos in graph.node_ways.get(nid, []):
            refs = graph.ways[widx]["refs"]
            cum = graph.ways[widx]["cum"]
            for np_ in (pos - 1, pos + 1):
                if 0 <= np_ < len(refs):
                    nd = d + abs(cum[np_] - cum[pos])
                    if nd < best.get(refs[np_], float("inf")):
                        heapq.heappush(heap, (nd, refs[np_]))
    return best_target
```

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 6 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/road_match_hmm.py tests/test_road_match_hmm.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: HMM 候选提取（格网+去重+上限）与带界 Dijkstra 路由"
```

---

### Task 6: Viterbi 全局解码（无候选断链）

**Files:**
- Modify: `app/services/road_match_hmm.py`（追加）
- Test: `tests/test_road_match_hmm.py`（追加）

**Interfaces:**
- Consumes: Task 4/5 全部；`statistics.median`。
- Produces: `hmm_decode(graph, cand_lists, steps) -> list[int | None]`（每点归属 way_idx；无候选点=None 断链，两侧子序列独立解码；β=steps 中位数）。Task 7 依赖。

- [ ] **Step 1: 追加失败测试**

```python
# ---- Task 6：Viterbi 解码 ----

def _cands_single(way, dist=0.0):
    return [{"dist": dist, "along": 0.0, "way": way, "seg": 0}]


def test_viterbi_straight_stays():
    from app.services.road_match_hmm import hmm_decode
    g = _graph()
    n = 6
    cand_lists = [_cands_single(0) for _ in range(n)]
    steps = [110.0] * (n - 1)
    assert hmm_decode(g, cand_lists, steps) == [0] * n


def test_viterbi_turn_switches():
    """沿 way0 北行后东拐上 way1：转弯后点的发射/转移都应倒向 way1，Viterbi 找到全局切换点"""
    from app.services.road_match_hmm import candidates_of, hmm_decode
    g = _graph()
    pts = [(118.000, 31.0000), (118.000, 31.0010), (118.000, 31.0020),
           (118.001, 31.0020), (118.002, 31.0021), (118.003, 31.0022)]
    cand_lists = [candidates_of(g, lng, lat) for lng, lat in pts]
    steps = [110.0, 110.0, 95.0, 95.0, 95.0]
    res = hmm_decode(g, cand_lists, steps)
    assert res[0] == 0 and res[1] == 0
    assert res[-1] == 1                          # 末端在匝道上
    assert res[2] in (0, 1)                      # 切换点在路口附近


def test_viterbi_parallel_tie_stays_one_way():
    """凤鸣湖南路型回归：骑线点在主干路(way0)与辅道(way2)正中间、单点距离打平——
    全局转移应让整段落在同一条 way 上（不翻边），而不是逐点噪声选边"""
    from app.services.road_match_hmm import candidates_of, hmm_decode
    g = _graph()
    pts = [(118.00005, 31.0005), (118.00005, 31.0015), (118.00005, 31.0025)]
    cand_lists = [candidates_of(g, lng, lat) for lng, lat in pts]
    steps = [111.0, 111.0]
    res = hmm_decode(g, cand_lists, steps)
    assert len(set(res)) == 1                    # 整段一条路（0 或 2 皆可，关键是不翻）
    assert res[0] in (0, 2)


def test_viterbi_breaks_at_empty():
    from app.services.road_match_hmm import hmm_decode
    g = _graph()
    cand_lists = [_cands_single(0), _cands_single(0), [], _cands_single(1), _cands_single(1)]
    steps = [110.0, 110.0, 110.0, 110.0]
    res = hmm_decode(g, cand_lists, steps)
    assert res == [0, 0, None, 1, 1]             # 空候选点断链，两侧独立解码
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 新增 4 FAIL（hmm_decode 未定义），原 6 PASS

- [ ] **Step 3: 实现**（road_match_hmm.py 追加）

```python
import statistics


def hmm_decode(graph: Graph, cand_lists: list[list[dict]],
               steps: list[float]) -> list[int | None]:
    """Viterbi 全局解码。β=点距中位数（对采样率/车速鲁棒）。
    候选为空的点断链：该点 None，两侧子序列各自独立解码"""
    n = len(cand_lists)
    beta = statistics.median(steps) if steps else 1.0
    res: list[int | None] = [None] * n
    i = 0
    while i < n:
        if not cand_lists[i]:
            i += 1
            continue
        j = i
        while j < n and cand_lists[j]:
            j += 1
        _viterbi_range(graph, cand_lists, steps, beta, i, j, res)
        i = j
    return res


def _viterbi_range(graph: Graph, cand_lists: list[list[dict]], steps: list[float],
                   beta: float, s: int, e: int, res: list[int | None]) -> None:
    cand = cand_lists[s:e]
    m = len(cand)
    dp = [[emission_log(c["dist"]) for c in cand[0]]]
    bp: list[list[int]] = [[0] * len(cand[0])]
    for i in range(1, m):
        step = steps[s + i - 1]
        bound = 2 * step + ROUTE_BOUND_PAD_M
        row: list[float] = []
        brow: list[int] = []
        for cj in cand[i]:
            best_v, best_k = LOG_INF, 0
            for k, ck in enumerate(cand[i - 1]):
                r = route_distance(graph, ck, cj, bound)
                if r is None:
                    continue
                v = dp[i - 1][k] + transition_log(r, step, beta)
                if v > best_v:
                    best_v, best_k = v, k
            row.append(best_v)
            brow.append(best_k)
        dp.append(row)
        bp.append(brow)
    last = max(range(len(dp[-1])), key=lambda j: dp[-1][j])
    path = [last]
    for i in range(m - 1, 0, -1):
        last = bp[i][last]
        path.append(last)
    path.reverse()
    for i, k in enumerate(path):
        res[s + i] = cand[i][k]["way"]
```

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 10 PASS

- [ ] **Step 5: Commit**

```bash
git add app/services/road_match_hmm.py tests/test_road_match_hmm.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: HMM Viterbi 全局解码（无候选点断链子序列独立解码）"
```

---

### Task 7: 契约构建 + match_track_hmm 主入口

**Files:**
- Modify: `app/services/road_match_hmm.py`（追加）
- Test: `tests/test_road_match_hmm.py`（追加）

**Interfaces:**
- Consumes: Task 2 `expand_round_bbox/get_or_build_graph/Graph`、Task 5/6 全部。
- Produces: `build_track_hmm(graph, assignment, points, speeds, dists) -> dict`、`async match_track_hmm(geojson, redis=None, graph=None) -> dict`（graph 参数供测试注入，None 时按 bbox 建图；契约顶层 `{z:15, matched_pct, cls_by_point, segments}`，segment 31 键与瓦片法一致）。Task 8 依赖 `match_track_hmm`。

- [ ] **Step 1: 追加失败测试**

```python
# ---- Task 7：契约构建 + 主入口 ----

_GEOJSON = {"features": [{
    "geometry": {"coordinates": [[118.000, 31.0000], [118.000, 31.0010], [118.000, 31.0020]]},
    "properties": {"meta": {"speed_kmh": [40.0, 41.0, 42.0],
                            "dist_m": [0.0, 110.9, 221.8]}},
}]}

_SEG_KEYS = {"s", "e", "dist_s", "dist_e", "cls", "subclass", "surface", "brunnel",
             "toll", "expressway", "ramp", "oneway", "service", "access", "foot",
             "bicycle", "horse", "layer", "level", "indoor", "mtb_scale", "official",
             "name", "name_zh", "ref", "network", "ref_length", "routes", "maxspeed",
             "osm_tags", "avg_spd"}


def test_match_track_hmm_contract():
    import asyncio
    from app.services.road_match_hmm import match_track_hmm
    out = asyncio.run(match_track_hmm(_GEOJSON, graph=_graph()))
    assert set(out) == {"z", "matched_pct", "cls_by_point", "segments"}
    assert out["z"] == 15                                    # 契约占位（HMM 不用瓦片）
    assert out["matched_pct"] == 100.0
    assert out["cls_by_point"] == ["primary", "primary", "primary"]
    assert len(out["segments"]) == 1
    seg = out["segments"][0]
    assert set(seg) == _SEG_KEYS                             # 31 键与瓦片法对齐
    assert seg["name"] == "甲路" and seg["name_zh"] is None
    assert seg["maxspeed"] == "60" and seg["expressway"] == 0
    assert seg["avg_spd"] == 41.0
    assert (seg["s"], seg["e"]) == (0, 3)


def test_match_track_hmm_zero_candidates_raises():
    import asyncio
    import pytest as _pytest
    from app.services.road_match_hmm import match_track_hmm
    far = {"features": [{"geometry": {"coordinates": [[120.0, 30.0], [120.0, 30.001]]},
                         "properties": {"meta": {}}}]}
    with _pytest.raises(RuntimeError):
        asyncio.run(match_track_hmm(far, graph=_graph()))


def test_build_track_hmm_merges_same_way_across_gap():
    from app.services.road_match_hmm import build_track_hmm
    g = _graph()
    assignment = [0, 0, None, 0, 0]
    speeds = [None] * 5
    dists = [0.0, 100.0, 200.0, 300.0, 400.0]
    out = build_track_hmm(g, assignment, [(118, 31)] * 5, speeds, dists)
    assert len(out["segments"]) == 1                         # 同 way 跨 None gap 合并
    assert out["matched_pct"] == 80.0
    assert out["cls_by_point"][2] is None
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_match_hmm.py -v`
Expected: 新增 3 FAIL，原 10 PASS

- [ ] **Step 3: 实现**（road_match_hmm.py 追加）

```python
from app.services.road_graph import expand_round_bbox, get_or_build_graph


def _flag(v) -> int | None:
    return 1 if v in ("yes", "true", "1") else (0 if v in ("no", "false", "0") else None)


def build_track_hmm(graph: Graph, assignment: list[int | None],
                    points, speeds, dists) -> dict:
    """Viterbi 归属 → 契约。相邻同 way 归并为 run；跨 None gap 的同 way 合并；
    段字段取自 way tags（Overpass 全量）。routes 恒 None（way tags 无 route 关系展开）；
    expressway/ramp 为与 MVT 语义对齐的近似（见计划 Global Constraints）"""
    runs: list[list[int]] = []
    for i, w in enumerate(assignment):
        if w is None:
            continue
        if runs and runs[-1][1] == i and runs[-1][2] == w:
            runs[-1][1] = i + 1
        else:
            runs.append([i, i + 1, w])
    merged: list[list[int]] = []
    for r in runs:
        if merged and merged[-1][2] == r[2]:
            merged[-1][1] = r[1]
        else:
            merged.append(r)
    cls_by_point = [graph.ways[w]["road_cls"] if w is not None else None for w in assignment]
    segs = []
    for s, e, widx in merged:
        way = graph.ways[widx]
        tags = way["tags"]
        ref = tags.get("ref")
        brunnel = ("bridge" if tags.get("bridge") not in (None, "no")
                   else "tunnel" if tags.get("tunnel") not in (None, "no")
                   else "ford" if tags.get("ford") not in (None, "no") else None)
        seg_speeds = [v for v in speeds[s:e] if v is not None]
        segs.append({
            "s": s, "e": e, "dist_s": dists[s], "dist_e": dists[e - 1],
            "cls": way["road_cls"], "subclass": tags.get("highway"),
            "surface": tags.get("surface"), "brunnel": brunnel,
            "toll": _flag(tags.get("toll")),
            "expressway": 1 if way["road_cls"] == "motorway" else 0,
            "ramp": 1 if (tags.get("highway") or "").endswith("_link") else 0,
            "oneway": _flag(tags.get("oneway")),
            "service": tags.get("service"), "access": tags.get("access"),
            "foot": tags.get("foot"), "bicycle": tags.get("bicycle"),
            "horse": tags.get("horse"),
            "layer": int(tags["layer"]) if str(tags.get("layer") or "").lstrip("-").isdigit() else None,
            "level": tags.get("level"), "indoor": _flag(tags.get("indoor")),
            "mtb_scale": tags.get("mtb:scale"), "official": tags.get("official"),
            "name": tags.get("name"),
            "name_zh": tags.get("name:zh-Hans") or tags.get("name:zh"),
            "ref": ref, "network": tags.get("network"),
            "ref_length": len(ref) if ref else None,
            "routes": None,
            "maxspeed": tags.get("maxspeed"),
            "osm_tags": dict(tags),
            "avg_spd": round(sum(seg_speeds) / len(seg_speeds), 1) if seg_speeds else None,
        })
    matched = sum(1 for w in assignment if w is not None)
    return {
        "z": 15,
        "matched_pct": round(matched / len(assignment) * 100, 1) if assignment else 0.0,
        "cls_by_point": cls_by_point,
        "segments": segs,
    }


async def match_track_hmm(geojson: dict, redis=None, graph: Graph | None = None) -> dict:
    """HMM 主入口：TrackGeoJSON → 契约（与瓦片法字段完全一致，z=15 占位）。
    graph 供测试注入；None 时按轨迹 bbox 建图（Redis 缓存优先）"""
    feat = geojson["features"][0]
    coords = feat["geometry"]["coordinates"]
    meta = (feat.get("properties") or {}).get("meta") or {}
    points = [(c[0], c[1]) for c in coords]          # (lng, lat)
    speeds = meta.get("speed_kmh") or [None] * len(points)
    dists = meta.get("dist_m") or [0.0] * len(points)
    if graph is None:
        lats = [p[1] for p in points]
        bbox = expand_round_bbox(min(p[0] for p in points), min(lats),
                                 max(p[0] for p in points), max(lats))
        graph = await get_or_build_graph(redis, bbox)
    cand_lists = [candidates_of(graph, p[0], p[1]) for p in points]
    if all(not c for c in cand_lists):
        raise RuntimeError("road_match_hmm: 轨迹周边 100m 内无可匹配路网")
    steps = [haversine_m(points[i][1], points[i][0],
                         points[i + 1][1], points[i + 1][0])
             for i in range(len(points) - 1)]
    assignment = hmm_decode(graph, cand_lists, steps)
    return build_track_hmm(graph, assignment, points, speeds, dists)
```

- [ ] **Step 4: 跑测试确认通过 + 全量回归**

Run: `uv run pytest tests/test_road_match_hmm.py tests/test_road_graph.py tests/test_road_match.py -v`
Expected: 13 + 6 + 25 全 PASS（瓦片法 25 测不受影响）

- [ ] **Step 5: Commit**

```bash
git add app/services/road_match_hmm.py tests/test_road_match_hmm.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: match_track_hmm 主入口与契约构建（字段与瓦片法对齐）"
```

---

### Task 8: 解析任务按参数切换方法

**Files:**
- Modify: `app/tasks/road_parse.py`
- Test: `tests/test_road_match_hmm.py`（追加 resolve_matcher 单测）

**Interfaces:**
- Consumes: `match_track`（现有）、Task 7 `match_track_hmm`、`app.core.redis.get_redis()`、`app.services.config.ConfigService.get_by_key(redis, key)`。
- Produces: `resolve_matcher(value: str | None) -> str`；`track.road_matcher` 落库写入。

- [ ] **Step 1: 追加失败测试**（tests/test_road_match_hmm.py 末尾）

```python
# ---- Task 8：参数解析 ----

def test_resolve_matcher():
    from app.tasks.road_parse import resolve_matcher
    assert resolve_matcher("hmm") == "hmm"
    assert resolve_matcher("tile") == "tile"
    assert resolve_matcher(None) == "tile"       # 参数缺失回退
    assert resolve_matcher("HMM") == "tile"      # 严格小写，非法回退
    assert resolve_matcher("bogus") == "tile"
```

- [ ] **Step 2: 跑测试确认失败**

Run: `uv run pytest tests/test_road_match_hmm.py::test_resolve_matcher -v`
Expected: FAIL（ImportError: resolve_matcher）

- [ ] **Step 3: 实现**（app/tasks/road_parse.py）

导入区改为：

```python
from loguru import logger
from sqlalchemy import delete, select

from app.core.database import async_session
from app.core.redis import get_redis
from app.models.track import BizTrack, BizTrackRoad
from app.services.config import ConfigService
from app.services.road_match import match_track
from app.services.road_match_hmm import match_track_hmm
from app.tasks.scheduler import register_task

BATCH = 3
ROAD_MATCHER_KEY = "sys.track.roadMatcher"


def resolve_matcher(value: str | None) -> str:
    """参数值 → 解析方法；缺失/非法一律回退 tile（spec §6）"""
    return "hmm" if value == "hmm" else "tile"


async def _current_matcher() -> str:
    return resolve_matcher(await ConfigService.get_by_key(get_redis(), ROAD_MATCHER_KEY))
```

`track_road_parse` 与 `parse_one` 改为：

```python
@register_task("trackRoadParse")
async def track_road_parse():
    matcher = await _current_matcher()
    async with async_session() as db:
        rows = (await db.execute(
            select(BizTrack.track_id)
            .where(BizTrack.del_flag == "0", BizTrack.road_status.in_(("0", "3")))
            .order_by(BizTrack.track_id).limit(BATCH)
        )).all()
    for (track_id,) in rows:
        await parse_one(track_id, matcher)


async def parse_one(track_id: int, matcher: str = "tile") -> None:
    """单条解析：置 1 → 匹配 → 2/3。独立会话，失败不影响其他轨迹"""
    async with async_session() as db:
        track = await db.get(BizTrack, track_id)
        if not track or track.del_flag == "2" or track.road_status == "2":
            return
        track.road_status = "1"
        await db.commit()
        try:
            match_fn = match_track_hmm if matcher == "hmm" else match_track
            result = await match_fn(track.geojson)
            # 路段逐行落库（重解析幂等：先清旧行）
            await db.execute(delete(BizTrackRoad).where(BizTrackRoad.track_id == track_id))
            for seq, seg in enumerate(result["segments"]):
                db.add(BizTrackRoad(track_id=track_id, seq=seq,
                                    idx_s=seg["s"], idx_e=seg["e"],
                                    dist_s=seg["dist_s"], dist_e=seg["dist_e"],
                                    road_cls=seg["cls"],
                                    **{k: seg.get(k) for k in
                                       ("subclass", "surface", "brunnel", "toll", "expressway",
                                        "ramp", "oneway", "service", "access", "foot",
                                        "bicycle", "horse", "layer", "level", "indoor",
                                        "mtb_scale", "official", "name", "name_zh",
                                        "ref", "network", "ref_length", "routes", "maxspeed",
                                        "osm_tags")},
                                    avg_spd=seg.get("avg_spd")))
            track.road_matched_pct = result["matched_pct"]
            track.road_data = {"z": result["z"], "cls_by_point": result["cls_by_point"]}
            track.road_matcher = matcher
            track.road_status = "2"
            track.road_retry = 0
            logger.info(f"trackRoadParse[{matcher}]: 轨迹 {track_id} 解析完成，"
                        f"匹配率 {result['matched_pct']}%，{len(result['segments'])} 段已落库")
        except Exception as e:  # noqa: BLE001
            track.road_status = "3"
            track.road_retry += 1
            logger.warning(f"trackRoadParse[{matcher}]: 轨迹 {track_id} 第 {track.road_retry} 次解析失败，"
                           f"下轮重试: {e}")
        await db.commit()
```

- [ ] **Step 4: 跑测试确认通过**

Run: `uv run pytest tests/test_road_match_hmm.py::test_resolve_matcher tests/test_road_match.py -v`
Expected: 全 PASS（`road_parse.py` 导入 `road_match_hmm` 后瓦片法 25 测不受影响）

- [ ] **Step 5: Commit**

```bash
git add app/tasks/road_parse.py tests/test_road_match_hmm.py
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: 解析任务按 sys.track.roadMatcher 参数切换瓦片/HMM 方法并记录 road_matcher"
```

---

### Task 9: 前端 —— 参数枚举 + 类型 + 看板方法 Chip

**Files:**
- Modify: `D:\Desktop\heroUI\src\api\config.ts`（常量区，BUTTON_STYLE 之后）
- Modify: `D:\Desktop\heroUI\src\pages\system\config\ConfigFormModal.tsx:95-102`（valueOptions 链）
- Modify: `D:\Desktop\heroUI\src\types\track.ts`（TrackRoadsResult）
- Modify: `D:\Desktop\heroUI\src\pages\map\track.tsx:679`（抽屉标题旁 Chip）

**Interfaces:**
- Consumes: Task 1 的 `matcher` 字段。
- Produces: 参数设置「键值」下拉支持 sys.track.roadMatcher；路段分析抽屉标题旁显示方法 Chip。

- [ ] **Step 1: api/config.ts 追加常量**

```ts
// 轨迹路段解析方法：tile 为 OSM 瓦片逐点匹配（现状），hmm 为隐马尔可夫全局匹配
export const ROAD_MATCHER_KEY = 'sys.track.roadMatcher'

export const ROAD_MATCHER_OPTIONS = [
  { key: 'tile', label: '瓦片匹配（现状）' },
  { key: 'hmm', label: 'HMM 匹配' },
] as const
```

- [ ] **Step 2: ConfigFormModal 注册枚举键**

import 区追加 `ROAD_MATCHER_KEY, ROAD_MATCHER_OPTIONS`（与现有枚举常量同一 import 语句）；valueOptions 链追加分支：

```tsx
  const valueOptions =
    form.configKey.trim() === MODAL_BACKDROP_KEY
      ? MODAL_BACKDROP_OPTIONS
      : form.configKey.trim() === BUTTON_STYLE_KEY
        ? BUTTON_STYLE_OPTIONS
        : form.configKey.trim() === ROAD_MATCHER_KEY
          ? ROAD_MATCHER_OPTIONS
          : null
```

- [ ] **Step 3: types/track.ts 的 TrackRoadsResult 加字段**

```ts
export interface TrackRoadsResult {
  segments: TrackRoadRow[]
  matched_pct: number | null
  matcher: string | null
}
```

- [ ] **Step 4: track.tsx 抽屉标题旁加 Chip**（`路段分析` 标题 span 之后，同一 flex 行内）

```tsx
{roadsData?.matcher && (
  <Chip size="sm" variant="soft"
        color={roadsData.matcher === 'hmm' ? 'warning' : 'accent'}>
    {roadsData.matcher === 'hmm' ? 'HMM 匹配' : '瓦片匹配'}
  </Chip>
)}
```

`Chip` 从 `@heroui/react` 导入（该文件若无则补）；matcher 为空（老数据未重解析）不显示。

- [ ] **Step 5: 验证**

Run: `pnpm build`
Expected: tsc 无错误、vite build 成功

- [ ] **Step 6: Commit**

```bash
git add src/api/config.ts src/pages/system/config/ConfigFormModal.tsx src/types/track.ts src/pages/map/track.tsx
GIT_AUTHOR_NAME=ichery GIT_AUTHOR_EMAIL=ichery@local GIT_COMMITTER_NAME=ichery GIT_COMMITTER_EMAIL=ichery@local \
  git commit -m "feat: 参数设置解析方法下拉（sys.track.roadMatcher）+路段看板方法标识 Chip"
```

---

### Task 10: E2E 手动验收（需用户参与）

**Files:** 无代码改动；验证脚本复用 `%TEMP%/reset_road_status.py`（改 track 列表）与轮询脚本。

- [ ] **Step 1: 后端就绪**（用户重启后端；迁移 007 已在 Task 1 执行）

- [ ] **Step 2: 参数切换为 HMM**：参数设置页新增参数 `sys.track.roadMatcher` = `hmm`（系统参数）。

- [ ] **Step 3: 重置并解析 19/20**：运行 `%TEMP%/reset_road_status.py`（track 列表 [19, 20]）→ 轮询至两轨 `road_status=2`。

- [ ] **Step 4: 按验收清单核对**（spec §9）：
  1. 解析落库成功（road_matcher='hmm'）；
  2. 凤鸣湖南路 0.25km minor 段消失；
  3. 段数/名称/里程与瓦片法对照合理；
  4. matched_pct > 90%；
  5. 看板 Chip 显示「HMM 匹配」；
  6. Viterbi 耗时记录（预算 10~30s/条，超预期则定档路由搜索界）。

- [ ] **Step 5: 回归**：参数切回 `tile` → 重置 19/20 → 重新解析 → 结果与当前已落库版本一致、Chip 显示「瓦片匹配」。

- [ ] **Step 6: 定档**：根据实测调整 σ/搜索界/候选上限并注释依据（spec §11），必要时补一轮重解析。

---

## Self-Review 记录

- 规格覆盖：spec §3 架构→Task 7/8；§4.1 建图→Task 2/3；§4.2 匹配→Task 4/5/6/7；§4.3 接入→Task 8；§5 迁移→Task 1；§6 参数/前端→Task 9；§7 性能→Task 10 Step 4-6；§8 错误→Task 3（RuntimeError）/Task 8（现有 except）；§9 测试→各任务 TDD + Task 10；§10 非目标未引入；§11 定档→Task 10 Step 6。
- 占位符扫描：无 TBD/TODO；所有代码块完整。
- 类型一致性：`Graph.ways` 的 way dict 键（id/refs/coords/road_cls/tags/cum）在 Task 2/3/5/6/7 一致；候选 dict 键（dist/along/way/seg）在 Task 5/6/7 一致；`matcher` 字段 Task 1→9 一致；契约偏差（routes=None 等）在 Global Constraints 与 Task 7 双处声明。
- 与 spec 的一处偏差：spec §4.2 说"ref_length/routes 复用 road_match 的行政编号推导"——该推导依赖 MVT 的 route_N 平铺键，Overpass way tags 没有该结构，故 HMM 的 ref_length=len(ref)、routes=None（诚实置空），已写入 Global Constraints。
