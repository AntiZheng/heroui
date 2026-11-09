// 轨迹原始文件上传：走现有上传会话体系直传 MinIO，返回 file_id
import {
  completeUploadSession, getUploadPartUrls, initUploadSession,
} from '../../api/file'

// 预签名 PUT 直传，返回 ETag（需要 MinIO CORS ExposeHeaders=ETag）
async function putObject(
  url: string,
  blob: Blob,
  headers?: Record<string, string>,
): Promise<string> {
  const res = await fetch(url, { method: 'PUT', headers, body: blob })
  if (!res.ok) throw new Error(`MinIO 返回 ${res.status}`)
  return res.headers.get('ETag') ?? ''
}

// 轨迹文件默认存放的文件目录（不存在时后端逐级自动创建）
const TRACK_FOLDER_PATH = '轨迹数据'

// 上传轨迹源文件到 MinIO（私有桶），返回 file_id；onProgress 回调 0-100
export async function uploadTrackSource(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<number> {
  onProgress?.(2)
  const init = await initUploadSession({
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type || undefined,
    visibility: 'private',
    folderPath: TRACK_FOLDER_PATH,
  })

  if (init.mode === 'single') {
    await putObject(init.upload_url!, file, init.headers)
    onProgress?.(95)
    const result = await completeUploadSession(init.session_id)
    onProgress?.(100)
    return result.file_id
  }

  // 分片模式：光标领取 + 并发 3
  const partSize = init.part_size
  const partCount = init.part_count
  const parts: { partNumber: number; etag: string }[] = []
  let cursor = 0
  let done = 0
  const worker = async () => {
    for (;;) {
      const n = ++cursor
      if (n > partCount) return
      const urls = await getUploadPartUrls(init.session_id, [n])
      const url = urls[0]?.url
      if (!url) throw new Error('获取分片链接失败')
      const start = (n - 1) * partSize
      const blob = file.slice(start, Math.min(start + partSize, file.size))
      const etag = await putObject(url, blob)
      parts.push({ partNumber: n, etag })
      done++
      onProgress?.(Math.min(95, Math.round((done / partCount) * 95)))
    }
  }
  await Promise.all([worker(), worker(), worker()])
  parts.sort((a, b) => a.partNumber - b.partNumber)
  const result = await completeUploadSession(init.session_id, parts)
  onProgress?.(100)
  return result.file_id
}
