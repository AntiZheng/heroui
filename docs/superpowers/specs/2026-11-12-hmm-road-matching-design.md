# HMM 路段解析设计（与瓦片法共存，参数切换）

日期：2026-11-12
状态：设计已确认（用户逐节批准），待写实施计划
关联：2026-11-09-track-road-segments.md（现有瓦片解析管线）

## 1. 背景与目标

现有路段解析基于 OSM 矢量瓦片逐点匹配（方向加权 + RoadSticky 滞回 + 45° 折角拒选 + NameCarry 续借 + 同名微碎段吸收），已修复交叉口误挂、0m 碎行等启发式问题。但残留一类结构性缺陷：跨瓦片分块导致 RoadSticky 对象同一性失效（凤鸣湖南路 0.25km 一般道路误标，用户已拍板暂不修复）。

目标：新增 HMM（隐马尔可夫）地图匹配解析方法，与现有瓦片法**共存**；通过参数设置全局切换解析方法；HMM 从结构上消除双层状态机这类启发式（等级/路名是同一 way 的属性、转移项惩罚路网绕路、way 身份天然存在）。

## 2. 决策记录（用户已确认）

| 决策点 | 结论 | 理由 |
|---|---|---|
| 切换语义 | 仅影响新解析 | 参数决定之后的解析用哪种方法；biz_track 加 `road_matcher` 列记录每条轨迹实际方法；切换不重算历史，想重算单条就重置其解析状态 |
| 建图数据源 | Overpass 精确建图 | way/node id 拓扑精确（真路口、立交不误连）；way 身份天然存在（分块失效根因彻底消失）；路名/等级/maxspeed 全量 tags 直接在边上，名字线图层+方案④补名对 HMM 路径可退役 |
| 匹配器实现 | 自研 Viterbi | Newson & Krumm 经典公式 ~300 行纯函数；参数可解释可定档；与现有 road_match 同风格、单测好写、零新依赖 |

## 3. 架构总览

```
road_parse.parse_one（现有异步任务，结构不动）
  └─ 读参数 sys.track.roadMatcher（'tile'|'hmm'，默认 'tile'）
      ├─ 'tile' → road_match.match_track()          （现有管线，一行不动）
      └─ 'hmm'  → road_match_hmm.match_track_hmm()  （新增）
  → 两者输出同一契约 dict：{z, matched_pct, cls_by_point, segments}
  → 落库 biz_track_road + biz_track.road_data + biz_track.road_matcher（实际方法）
```

契约一致 ⇒ 落库逻辑、`GET /track/{id}/roads`、RoadsPanel 均不改结构；仅 roads 接口响应增加 `matcher` 字段，看板标题旁小 Chip 显示方法。

## 4. 组件设计

### 4.1 app/services/road_graph.py —— Overpass 建图

**查询**（bbox 先外扩 200m 保证轨迹端点处的路口连通性，再按 0.01° 网格**取包含方向圆整**——min 向下取整、max 向上取整，保证缓存图必覆盖轨迹所需）：

```
[out:json][timeout:60];
way[highway]({s},{w},{n},{e});
out body;
node(w);
out skel;
```

- `out body` 给 way 的节点引用 id + 全量 tags；`node(w); out skel` 给引用节点的坐标。二者合起来构成精确拓扑图（共享节点 id = 真路口）。
- 端点/重试/UA 头复用 road_match.py 现有 Overpass 逻辑（maps.mail.ru 镜像首位 + 两轮重试）：**不抽新文件**，road_graph.py 直接导入其请求辅助函数（必要时将该函数从私有改名公开）。

**过滤与词表**（drivable 集合，与瓦片法 class 词表对齐）：

| highway 原值 | road_cls（对齐 OpenMapTiles class） | subclass |
|---|---|---|
| motorway(_link) | motorway | 原值 |
| trunk(_link) | trunk | 原值 |
| primary(_link) | primary | 原值 |
| secondary(_link) | secondary | 原值 |
| tertiary(_link) | tertiary | 原值 |
| unclassified / residential / living_street | minor | 原值 |
| service | service | 原值 |

其余（footway/path/steps/pedestrian/track/cycleway/bridleway/construction/proposed 等）不入图。立交不误连由拓扑天然保证（无共享节点即不通），`layer/bridge/tunnel` 仅作为边上属性保留。

**图数据结构**（内存构建 <1s，处理完即释放）：

```python
Graph:
  nodes: dict[node_id, (lat, lng)]
  ways:  list[Way]      # Way: id, node_refs[], highway, tags{}
  adj:   dict[node_id, list[(way_idx, pos)]]   # 节点 → 经过该节点的 way 及位置，供路由
```

**Redis 缓存**：按圆整 bbox 缓存**解析后的图 JSON**（`{nodes, ways}`），key = `road_graph:{s},{w},{n},{e}`（0.01° 网格），TTL 24h。相邻轨迹同区域直接命中，省 Overpass 查询。JSON 文本存取（UTF-8 str，符合 decode_responses 约束）。

### 4.2 app/services/road_match_hmm.py —— HMM 匹配

Newson & Krumm (2009) 经典公式，全程 log 域防下溢：

- **发射**：`ln(e_i(s)) = -0.5 * (d_i(s)/σ)² - ln(σ·√(2π))`，d=点到边最近投影距离。**σ=10m**（依据：实测 GPS 骑线噪声 6~15m 带内；我定的可调）。
- **候选**：每点取 ≤100m 内最近 **k≤8** 条边（k 上限防密集路网爆炸）。
- **转移**：`ln(t_ij) = -|route(c_i,c_j) − dist(z_i,z_{i+1})| / β`，route=路网路径长（Dijkstra），dist=两点大圆距离。**β = 该轨迹点距中位数**（对采样率鲁棒；实测点距 20~60m 量级）。路由不可达（超出搜索界）→ -inf。
- **路由**：同一条 way 内 = 投影间沿 way 累计长度；跨 way = 共享节点间的带界 Dijkstra，搜索界 = `2×dist(z_i,z_{i+1}) + 200m`（我定的可调），早停剪枝。
- **Viterbi**：全序列最优；初始概率均匀。
- **无候选点**（100m 内无边）：断链处理——按无候选点切分子序列，各自独立 Viterbi，该点 `cls_by_point=None`（与瓦片法 None 语义一致）。
- **全轨迹零候选**：返回空契约（`matched_pct=0`、`segments=[]`，成功落库 status=2），与瓦片法「无路可匹配=空结果」降级语义一致；仅基础设施故障（Overpass 全端点失败 RuntimeError）走 road_status=3 重试。

**segments 构建**：Viterbi 输出每点归属 way → 相邻同 way 归并为 run → 跨 gap 的同 way 合并 → 每段字段取自 way tags：`name / name_zh(=tags["name:zh-Hans"] 优先) / ref / network / maxspeed / osm_tags(=tags 整包剔除已拆字段)`；`ref_length / routes` 复用 road_match.py 的行政编号推导逻辑（导入或抽小函数）；`avg_spd` 按现逻辑段内均速；`dist_s/dist_e` 沿轨迹里程（与瓦片法同口径）。

**matched_pct** = 分配边距离 ≤100m 的点占比。

**契约占位**：HMM 不用瓦片，但契约仍返回 `z=15`（与瓦片法同值占位，road_data JSON 结构保持一致）。

### 4.3 接入与策略选择

- `road_parse.parse_one` 开头读参数（`ConfigService.get_by_key(redis, "sys.track.roadMatcher")`，任务侧 redis 用 app 现有 get_redis 模式）；值缺失/非 `hmm` 一律走 tile。
- 解析成功后 `track.road_matcher = "tile" | "hmm"`（写实际使用的）。

## 5. 数据模型（迁移 007）

- `biz_track` 加列 `road_matcher varchar(10) NULL`，迁移内 `UPDATE biz_track SET road_matcher='tile'`（部署前所有解析均为瓦片法）。
- `GET /track/{id}/roads` 响应加 `"matcher": track.road_matcher`。

## 6. 参数与前端

- 参数键 `sys.track.roadMatcher`，枚举 `tile`（瓦片匹配，默认）/ `hmm`（HMM 匹配）。参数库无记录 → 回退 tile。
- 前端 `ConfigFormModal` 枚举型参数键下拉注册此键（现成模式，与 sys.modal.backdrop 同款）。
- `types/track.ts` 的 `TrackRoadsResult` 加 `matcher?: string | null`；RoadsPanel 标题旁 Chip：`瓦片匹配`（accent-soft 语义）/ `HMM 匹配`（warning-soft 或 accent-soft，实现时按现有 Chip 语义映射定）/ matcher 为空不显示。

## 7. 性能预算（每条轨迹）

| 环节 | 预算 | 依据 |
|---|---|---|
| Overpass bbox 查询 | 2~5s | mail.ru 镜像实测经验；同区域第二轨迹起缓存命中 |
| 图构建 | <1s | 几千 way、节点数万级 |
| Viterbi+路由 | 10~30s | 3000 点 × k≤8 ≈ 2 万次带界 Dijkstra，每次 <1ms（局部小图） |
| 内存 | <100MB/条 | 图 + 概率矩阵，处理完释放 |

解析任务 BATCH=3、`max_instances=1` 已有：单条变慢只会顺延，不堆积。

## 8. 错误处理

- Overpass 查询失败 → 抛异常 → 现有 `except` → `road_status=3` 自动重试（自愈任务天然兼容，无新机制）。
- Overpass timeout 60s/次 × 两轮重试，与瓦片法的重试语义对齐。
- Viterbi 数值全 -inf（极端断链）→ 按失败抛异常重试，不落半成品。

## 9. 测试计划

**单测**（Overpass 用录制响应 fixture，不真网）：

- `tests/test_road_graph.py`：查询构造（bbox 圆整/外扩）、响应解析（way+node 合成图）、drivable 过滤与 class 词表映射、跨 way 连通（共享节点）与不连通（无共享节点）、Redis 缓存命中/写入。
- `tests/test_road_match_hmm.py`：
  - 发射/转移纯函数边界（距离 0、超截断、-inf 不可达）；
  - Viterbi 小例×3：直路序列、转弯序列、**平行路打平序列（转移项应选主干路——凤鸣湖南路型回归用例）**；
  - 无候选点断链（子序列独立 + None）；
  - segments 契约字段与瓦片法完全对齐（同一组键，name_zh 优先级）。

**E2E 验收**（手动，真网）：

1. 参数切 `hmm` → 重置 19/20 road_status → 解析落库成功；
2. 凤鸣湖南路 0.25km minor 段消失（前后主干预期连为整段）；
3. 段数/名称/里程与瓦片法结果对照合理（允许 OSM 源差异导致的少量出入）；
4. matched_pct 不显著低于瓦片法（>90%）；
5. 参数切回 `tile` → 重置 → 结果与当前已落库版本一致（回归）；
6. 看板 Chip 显示方法正确。

## 10. 非目标（YAGNI）

- 轨迹级方法选择 UI（参数 + 重置 road_status 已足够对比）；
- 退役瓦片管线任何代码；
- 流式/在线匹配（异步批解析足够）；
- 第三方匹配库（Valhalla/leuvenmapmatching）；
- HMM 管线的名字线图层/方案④补名（way tags 自带，无需）。

## 11. 实现期待定档项

- σ（初值 10m）、路由搜索界（初值 2×位移+200m）、k≤8、截断 100m：E2E 后按实测定档，均为常量并注释依据；
- β 用轨迹点距中位数（动态，无常量）；
- Chip 配色按现有语义软色映射定。

## 12. 11-17 匹配误差修复（track36 红框五行，已实施）

E2E 发现 track36 前段五行错误段，根因与修复（仅 road_match_hmm.py，瓦片法不动）：

| # | 根因 | 修复 | 常量（我定的可调） |
|---|---|---|---|
| ① | 无路外状态 + CAND_M=100m 候选半径把街区内部点强挂远边（凭空造「未命名道路·tertiary」假段） | 解码后发射诚实降级：归属边原始投影距离 >阈值的点置 None（无候选断链的语义延伸；用原始投影距离，航向罚是匹配质量信号非几何诚实度） | MATCH_MAX_M=40（图内正确段实测最大发射 27m×1.5 裕量） |
| ② | 补名投票份额分母=可投票点数，路口收敛区 2~3 点即冠名整段（313m 无名 run 被冠名华山路） | 双门槛：票数 ≥3 且份额 ≥60%×run 全点数（分母改 run 点数） | BACKFILL_MIN_VOTES=3 |
| ③ | 路口穿越碎段（尖山路 7 点 23m）超 2 点阻断同名吸收，主干被切碎成 3 段 | 碎段双闸（≤8 点且 ≤50m）取代 ≤2 点单闸：同名碎行并入同名邻段 + 异名碎段两侧同 (cls,name) 时整段吞并（主干 reunite）；无名碎段不吞（诚实降级不变） | FRAG_ABSORB_PTS=8、FRAG_ABSORB_M=50 |

track36 修复前后（内存试算对照，未落库）：行1 消失（0~66 点降级 None）；行2 缩短为未命名·service（补名不再冠名）；行3+4+5 合并为 [107,377) 华山路·secondary ≈1.9km；尾部 34 点漂离嘉陵江路 41→90m 由强挂改诚实降级；matched_pct 100→96.9。

已知取舍（② 的保守侧）：霍里山大道中段 193 点所在 OSM 车道本身 name=None 且距命名车道 >60m，旧版靠路口散票（2~4 票/run）+ 夹心补名桥接 0 票中段拼出整条路名；新版散票不达标、夹心链断裂，中段 ~2.5km 显示「未命名道路·primary」（数据上确为无名车道，诚实但可读性降）。如需恢复需引入单侧续名/链式夹心传播（新机制，待定）。

## 13. 11-18 P-A 链式续名 + P-B 残段成行（已实施）

§12 收尾后 track36 重解析暴露两类残留问题，探针实证根因后实施两项机制（仅 road_match_hmm.py + road_parse.py 落库映射 + 前端 RoadsPanel）：

| # | 问题 | 根因（探针实证） | 机制 | 常量（我定的可调） |
|---|---|---|---|---|
| P-A | 行6「未命名道路·主干路·桥 2.54km」——霍里山大道中段无名 | 非双车道对（并行 <50m 无候选），是**纵向命名断档**：霍里山大道→5 条无名 way 依次共享端点节点（或端点距 9~12m）→霍里山大道，每跳轴差 3~24°、全 primary，OSM 制图者漏打 name | 图级链式续名 `_inherit_chain_names`：无名 way 端点相接（共享端点节点或端点距 <CHAIN_END_M）+ 轴差 <NAME_CROSS_DEG（锐叉断开传播）+ 同 road_cls 连通成链；链上各段端点接到的命名 way（同双闸）名字**一致**才整链继承该名；两端异名/无 seed 保持未命名。端点-端点邻接天然排除 T 形路口接入的横路。继承名存 `graph.inherited` 独立层（不写回 tags：缓存序列化与 osm_tags 契约不污染；不参与序列化，每次建图重算） | CHAIN_END_M=30（实测链端点距 9~12m，容数字化偏差） |
| P-B | 表首/表尾未匹配点消失不见（园区内部路 OSM 未画，无路可匹配） | 尾段 34 点漂离嘉陵江路 41→90m 进入园区，OSM 无路 → 诚实降级后残段无行，看板"到嘉陵江路就结束" | 未匹配残段成行：None 空档未被跨 gap 合并吸收（不在任何最终段跨度内）且 ≥3 点、≥50m → 独立成行 cls=None；road_parse 落库 `road_cls=seg["cls"] or ""`（列 NOT NULL）；前端 RoadsPanel 明细表道路列「未匹配路段」灰斜体、等级列 —，逐路段均速图灰柱，等级分布图灰条「未匹配路段」 | RESIDUAL_MIN_PTS=3、RESIDUAL_MIN_M=50（对齐 FRAG_ABSORB_M） |

误报窗口（正面承认）：P-A 双端同名才继承——一条真无名路与两条同名路端点相接且同轴同 class 时会被误冠名（罕见：需要恰好同名首尾+漏名中段）；锐叉（≥45°）断链防路名跨岔口渗透。P-B 双闸防路口解码瞬态（1~2 点）与短促漂移（<50m）碎行；被跨 gap 同 (cls,name) 合并吸收的空档不成行（该语义下视为走过匹配路）。

track36 实施后段表（内存试算）：行1 未匹配路段 0.21km（新显形）、行2 未命名·service 0.17km、行3 华山路 1.95km、行4 九华北路 21.34km、行5 采石河路 6.50km、行6 **霍里山大道 5.72km 单行**（原未命名 2.54km 桥段整链继承回归正名）、行7 金溪路 0.22km、行8 软件路 0.25km、行9 嘉陵江路 0.11km、行10 未匹配路段 0.09km（园区内部路新显形）；matched_pct 96.9 不变。测试：test_road_match_hmm.py 新增 8 测（链式继承/异名冲突守卫/锐叉阻断/class 闸/残段成行/小 gap 守卫/落库空串映射），40/40 绿，全量 77 passed + 7 预存 aiosqlite errors（基线不变）。

## 14. 11-18 track41 无名碎段同名牌吸收 + ref 显示兜底（已实施）

§13 后 track41（18 行）仍见两类未命名行，探针实证后实施：

| # | 问题 | 根因（探针实证） | 机制 | 常量 |
|---|---|---|---|---|
| ③ | 行8 未命名·minor 55m、行12 未命名·minor 1 点 0m，夹在两侧凤鸣湖南路同行之间（OSM 路口过渡 way 漏打 name） | Viterbi 归属正确但 way 无名 → 碎行；§12 ③ 版仅「无名碎段不吞」 | 碎段吸收新增无名分支：两侧 run **同名** → 并入同 class 侧（两侧同名且同 class 时三段合一，凤鸣湖南路碎行型）；两侧异名或无同 class 侧不吞（诚实降级）。同名异 cls 夹心（行10 tertiary 0.03km @1.2 路口横穿）不吞——类变更是真实 OSM 属性，保留独立行 | FRAG_ABSORB_M **50→60**（实测样本 track36 碎段 23m、track41 行8 55m，我定的可调） |
| ①′ | 行4 未命名道路·G205·快速路·桥 1.15km（OSM 桥段 genuinely 无 name、ref=G205、链两端弋江北路/九华北路异名 → 继承闸正确拒绝） | 数据真实无名，不该硬造名 | 曾提 ref 显示兜底（name 空且有 ref 显 ref 灰斜体），**用户否决**：无名一律显「未命名道路」，不用 ref 代替 | — |

误报窗口（正面承认）：③ 无名碎段两侧同名但 cls 不同（如 primary/minor 交界）时并入 minor 侧——归属 way 确实是 minor，里程归入哪侧只影响分段统计粒度；两侧同名同 class 才三段合一。行17（ genuinely 无名 residential 尽头路）与行18（P-B 残段）不受影响。

track41 实施后段表（内存试算，18→15 行）：行7+8+9 三合一 → 凤鸣湖南路 primary 2.44km；行12 吸收进 minor 侧 → 凤鸣湖南路 minor 0.76km（行11 primary 2.02km 不动）；行4 保持「未命名道路」（ref 兜底已否决）；行17/行18 原样；matched_pct 98.0。测试：test_road_match_hmm.py 新增 4 测（三段合一/同 class 侧吸收/两侧异名守卫/长度闸守卫）+ 旧测试翻写（无名碎段两侧同名时不再保留独立行），44/44 绿，全量 81 passed + 7 预存 aiosqlite errors（基线不变）。
