// 上传任务队列：XHR 直传 + 分片 + 暂停/续传（框架无关，F4 以 React Hook 包装消费）
import {
  abortUploadSession, completeUploadSession, getActiveUploadSessions,
  getUploadPartUrls, getUploadSession, initUploadSession,
} from '../api/file'
import type { FileVisibility, UploadSessionStatus } from '../types/file'

export type UploadStatus =
  | 'queued' | 'uploading' | 'paused' | 'completing' | 'done' | 'error' | 'canceled'

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

export interface UploadQueueSnapshot {
  tasks: UploadTask[]
  recoverSessions: UploadSessionStatus[]
  hasActive: boolean
}

// taskId → 在途请求（含任务级 AbortController），pause/cancel 时统一 abort
const controllers = new Map<string, AbortController[]>()

// 分片 PUT / 取链接失败时的自动重试参数（AbortError 不重试）
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 1000

function fmtBytes(n: number) {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`
  if (n >= 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${n} B`
}

// 预签名 PUT 直传（XHR 以拿到 upload.onprogress 与 ETag 响应头）
function putWithProgress(url: string, data: Blob, headers: Record<string, string>,
  onProgress: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded)
    const onAbort = () => xhr.abort()
    signal.addEventListener('abort', onAbort)
    const settle = (fn: () => void) => {
      signal.removeEventListener('abort', onAbort)
      fn()
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        settle(() => resolve(xhr.getResponseHeader('ETag') ?? ''))
      } else {
        settle(() => reject(new Error(`MinIO 返回 ${xhr.status}`)))
      }
    }
    xhr.onerror = () => settle(() => reject(new Error('网络错误')))
    xhr.onabort = () => settle(() => reject(new DOMException('已暂停', 'AbortError')))
    xhr.send(data)
  })
}

const isAbort = (e: unknown) => (e as DOMException)?.name === 'AbortError'

export class UploadQueue {
  private tasks: UploadTask[] = []
  private recoverSessions: UploadSessionStatus[] = []
  private listeners = new Set<(snap: UploadQueueSnapshot) => void>()
  private pumping = false
  private onAllDone?: () => void

  constructor(onAllDone?: () => void) {
    this.onAllDone = onAllDone
  }

  // ---- 订阅（F4 Hook 据此 setState）----
  subscribe(fn: (snap: UploadQueueSnapshot) => void): () => void {
    this.listeners.add(fn)
    fn(this.snapshot())
    return () => { this.listeners.delete(fn) }
  }

  getSnapshot(): UploadQueueSnapshot {
    return this.snapshot()
  }

  private snapshot(): UploadQueueSnapshot {
    return {
      tasks: this.tasks.map((t) => ({ ...t, uploaded: new Map(t.uploaded) })),
      recoverSessions: [...this.recoverSessions],
      hasActive: this.tasks.some((t) =>
        t.status === 'uploading' || t.status === 'queued' || t.status === 'completing'),
    }
  }

  private emit() {
    const snap = this.snapshot()
    this.listeners.forEach((fn) => fn(snap))
  }

  // ---- 内部状态更新 ----
  private setTask(id: string, patch: Partial<UploadTask> | ((t: UploadTask) => Partial<UploadTask>)) {
    this.tasks = this.tasks.map((t) => {
      if (t.id !== id) return t
      const p = typeof patch === 'function' ? patch(t) : patch
      return { ...t, ...p }
    })
    this.emit()
  }

  // ---- 可恢复会话 ----
  async refreshRecover(): Promise<UploadSessionStatus[]> {
    try {
      const sessions = await getActiveUploadSessions()
      // 排除当前队列里已在跑的会话
      const tracked = new Set(this.tasks.map((t) => t.sessionId).filter(Boolean))
      this.recoverSessions = sessions
        .filter((s) => s.status === 'pending' || s.status === 'uploading')
        .filter((s) => !tracked.has(s.session_id))
      this.emit()
      return this.recoverSessions
    } catch {
      // 未配置存储等场景静默
      return []
    }
  }

  // ---- 调度泵：把 queued 任务喂给 runTask，直到并发占满或无任务 ----
  private pump = async (): Promise<void> => {
    if (this.pumping) return
    this.pumping = true
    try {
      for (;;) {
        const uploading = this.tasks.filter((t) => t.status === 'uploading').length
        const next = this.tasks.find((t) => t.status === 'queued')
        if (!next || uploading >= (next.concurrency || 3)) break
        void this.runTask(next.id)
        // 让 runTask 先把状态推进（queued → uploading/error），避免同一任务被重复派发
        await new Promise((r) => setTimeout(r, 0))
      }
    } finally {
      this.pumping = false
    }
  }

  // ---- 单任务执行 ----
  private runTask = async (id: string): Promise<void> => {
    const task = this.tasks.find((t) => t.id === id)
    if (!task) return
    if (!task.file) {
      // 无本地文件（如刷新后恢复）无法直传，置 error 终止，防止 pump 死循环
      this.setTask(id, { status: 'error', error: '本地文件缺失，请重新选择文件上传' })
      return
    }
    const file = task.file
    // 立即同步标记 uploading：pump 在 setTimeout(0) 后按 status 复查并发，
    // 若仍为 queued 会对同一任务重复派发（恢复/续传路径尤需注意）
    this.setTask(id, { status: 'uploading', error: undefined })
    const acList: AbortController[] = []
    const taskAc = new AbortController()
    acList.push(taskAc) // 任务级信号：pause/cancel 时随列表一起 abort
    controllers.set(id, acList)
    try {
      let sessionId = task.sessionId
      let partSize = task.partSize || 0
      let partCount = task.partCount || 1
      let concurrency = task.concurrency || 3
      // 合并已知已传分片：本地 task.uploaded（断点续传）+ 服务端 status.uploaded_parts
      const known = new Map<number, string>()
      task.uploaded.forEach((v, n) => known.set(n, v.etag))

      if (!sessionId) {
        const init = await initUploadSession({
          fileName: task.fileName, fileSize: task.fileSize, mimeType: file.type || undefined,
          folderId: task.folderId, visibility: task.visibility,
        })
        sessionId = init.session_id
        partSize = init.part_size
        partCount = init.part_count
        concurrency = init.concurrency || 3
        this.setTask(id, { sessionId, mode: init.mode, partSize, partCount, concurrency })
        // ⚠️ 修正：init 等待期间可能已被 pause/cancel abort，此时不得再发起 PUT/分片上传；
        // pause 依赖 AbortError 走 catch 落 paused，这里补齐同样处理避免状态卡在 uploading
        if (taskAc.signal.aborted) {
          const cur = this.tasks.find((t) => t.id === id)
          if (cur && cur.status !== 'canceled') this.setTask(id, { status: 'paused' })
          return
        }
        if (init.mode === 'single') {
          const t0 = Date.now()
          const ac = new AbortController()
          acList.push(ac)
          await putWithProgress(init.upload_url!, file, init.headers ?? {}, (loaded) => {
            this.setTask(id, {
              progress: Math.round((loaded / task.fileSize) * 100),
              uploadedBytes: loaded,
              speed: loaded / Math.max(1, (Date.now() - t0) / 1000),
            })
          }, ac.signal)
          this.setTask(id, { status: 'completing' })
          await completeUploadSession(sessionId)
          this.setTask(id, { status: 'done', progress: 100, uploadedBytes: task.fileSize, speed: 0 })
          this.onAllDone?.()
          return
        }
      } else if (task.mode === 'single') {
        // ⚠️ 修正 6：single 无法续传——客户端绝不代为 complete（避免把不完整对象固化成文件）。
        // 服务端已 completed 则幂等标记完成；其余状态一律报错走重新上传；
        // 中断产生的孤儿对象由后端过期会话定时清理，不做客户端 abort
        const status = await getUploadSession(sessionId)
        if (status.status === 'completed') {
          this.setTask(id, { status: 'done', progress: 100, speed: 0 })
          this.onAllDone?.()
          return
        }
        throw new Error('单文件上传不支持续传，请重新上传')
      } else {
        // multipart 恢复：拉取服务端已传分片并入 known
        const status = await getUploadSession(sessionId)
        status.uploaded_parts.forEach((p) => known.set(p.part_number, p.etag))
        partSize = status.part_size
        partCount = status.part_count
        this.setTask(id, {
          mode: status.mode, partSize, partCount,
          uploaded: new Map([...known.entries()].map(([n, etag]) => [n, { etag }])),
          uploadedBytes: Math.min(task.fileSize, known.size * partSize),
        })
      }

      // ⚠️ 修正 1：缺失分片从「合并后的已传集合 known」推导
      const missing: number[] = []
      for (let n = 1; n <= partCount; n++) if (!known.has(n)) missing.push(n)
      const inflight = Math.max(1, Math.min(concurrency, missing.length || 1))
      const t0 = Date.now()
      let cursor = 0

      const worker = async () => {
        for (;;) {
          if (taskAc.signal.aborted) return
          const n = missing[cursor++]
          if (n === undefined) return
          if (known.has(n)) continue // 已传（含本任务内其他 worker 刚完成）
          let url = ''
          let etag = ''
          // 自动重试 + 退避（取链接失败则换新链接重传整片）
          for (let attempt = 0; ; attempt++) {
            if (taskAc.signal.aborted) return
            try {
              if (!url) {
                const urls = await getUploadPartUrls(sessionId, [n])
                url = urls[0]?.url ?? ''
                if (!url) throw new Error('获取分片链接失败')
              }
              const start = (n - 1) * partSize
              const blob = file.slice(start, Math.min(start + partSize, file.size))
              const ac = new AbortController()
              acList.push(ac)
              etag = await putWithProgress(url, blob, {}, (loaded) => {
                // ⚠️ 修正 3：进度以 known.size 为准：已完成分片按 partSize 计 + 当前片 loaded
                this.setTask(id, () => {
                  const totalDone = Math.min(file.size, known.size * partSize + (known.has(n) ? 0 : loaded))
                  const progress = Math.min(99, Math.round((totalDone / file.size) * 100))
                  const speed = totalDone / Math.max(1, (Date.now() - t0) / 1000)
                  return { progress, speed, uploadedBytes: totalDone }
                })
              }, ac.signal)
              break
            } catch (e) {
              if (isAbort(e) || attempt >= MAX_RETRIES) throw e
              url = '' // 下次重试重新取预签名链接（旧链接可能已过期）
              const delay = RETRY_BACKOFF_MS * 2 ** attempt
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, delay)
                taskAc.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('已暂停', 'AbortError')) }, { once: true })
              })
            }
          }
          if (!etag) throw new Error('未取到 ETag：请检查 MinIO CORS 是否 ExposeHeaders=ETag')
          known.set(n, etag)
          this.setTask(id, (t) => {
            const uploaded = new Map(t.uploaded)
            uploaded.set(n, { etag })
            return { uploaded }
          })
        }
      }

      await Promise.all(Array.from({ length: inflight }, worker))
      if (taskAc.signal.aborted) return // 已暂停/取消，完成的分片保留在 task.uploaded
      this.setTask(id, { status: 'completing' })
      // ⚠️ 修正 2：complete 的 parts 直接由 known 生成（已含服务端已知分片，天然去重）
      const parts = [...known.entries()]
        .map(([partNumber, etag]) => ({ partNumber, etag }))
        .sort((a, b) => a.partNumber - b.partNumber)
      await completeUploadSession(sessionId, parts)
      this.setTask(id, { status: 'done', progress: 100, uploadedBytes: file.size, speed: 0 })
      this.onAllDone?.()
    } catch (e) {
      if (isAbort(e)) {
        // pause 触发；cancel 场景由 cancel() 落 canceled，这里不覆盖
        const cur = this.tasks.find((t) => t.id === id)
        if (cur && cur.status !== 'canceled') this.setTask(id, { status: 'paused' })
      } else {
        // cancel 已落 canceled，非 abort 错误不覆盖其状态
        const cur = this.tasks.find((t) => t.id === id)
        if (cur && cur.status !== 'canceled') this.setTask(id, { status: 'error', error: (e as Error).message })
      }
    } finally {
      controllers.delete(id)
      void this.pump()
    }
  }

  // ---- 队列操作 ----
  addFiles(files: File[], folderId: number, visibility: FileVisibility) {
    const next: UploadTask[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}-${f.name}`,
      file: f, fileName: f.name, fileSize: f.size,
      folderId, visibility,
      partSize: 0, partCount: 1, concurrency: 3,
      uploaded: new Map(), uploadedBytes: 0, progress: 0, speed: 0,
      status: 'queued',
    }))
    this.tasks = [...this.tasks, ...next]
    this.emit()
    void this.pump()
  }

  pause(id: string) {
    this.setTask(id, { aborting: true })
    controllers.get(id)?.forEach((ac) => ac.abort())
  }

  resume(id: string) {
    const t = this.tasks.find((x) => x.id === id)
    if (!t || !t.file || t.status !== 'paused') return
    this.setTask(id, { status: 'queued', aborting: false })
    void this.pump()
  }

  async cancel(id: string) {
    controllers.get(id)?.forEach((ac) => ac.abort())
    const t = this.tasks.find((x) => x.id === id)
    if (t?.sessionId) {
      try { await abortUploadSession(t.sessionId) } catch { /* 会话可能已过期 */ }
    }
    this.setTask(id, { status: 'canceled', aborting: false })
  }

  retry(id: string) {
    this.setTask(id, { status: 'queued', error: undefined, aborting: false })
    void this.pump()
  }

  pauseAll() {
    // single 模式无法续传（F2 裁决）：跳过不暂停，避免恢复时必然报错
    this.tasks
      .filter((t) => t.status === 'uploading' || t.status === 'queued')
      .forEach((t) => {
        if (t.mode === 'single') return
        if (t.status === 'uploading') this.pause(t.id)
        else this.setTask(t.id, { status: 'paused' })
      })
  }

  resumeAll() {
    this.tasks.filter((t) => t.status === 'paused').forEach((t) => this.resume(t.id))
  }

  // 移除任务（仅用于已结束任务；仍在传输时先 abort 保底）
  remove(id: string) {
    controllers.get(id)?.forEach((ac) => ac.abort())
    controllers.delete(id)
    this.tasks = this.tasks.filter((t) => t.id !== id)
    this.emit()
  }

  // 清空已结束（完成/取消/失败）任务
  clearDone() {
    this.tasks = this.tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'canceled' && t.status !== 'error',
    )
    this.emit()
  }

  // 恢复历史会话：file 必须由用户重新选择后传入
  recover(file: File, session: UploadSessionStatus) {
    const task: UploadTask = {
      id: `recover-${session.session_id}`,
      file, fileName: session.file_name, fileSize: session.file_size,
      folderId: session.folder_id, visibility: session.visibility,
      sessionId: session.session_id, mode: session.mode,
      partSize: session.part_size, partCount: session.part_count, concurrency: 3,
      uploaded: new Map(), uploadedBytes: 0, progress: 0, speed: 0, status: 'queued',
    }
    // single 无法续传：runTask 走修正 6 分支（completed 则幂等标记完成，否则提示重新上传）；
    // Drawer 层只对 multipart 提供「继续」，single 提示重新上传
    this.tasks = [task, ...this.tasks.filter((t) => t.id !== task.id)]
    this.recoverSessions = this.recoverSessions.filter((s) => s.session_id !== session.session_id)
    this.emit()
    void this.pump()
  }
}

export { fmtBytes }
