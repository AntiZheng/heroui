import { useQuery } from '@tanstack/react-query'
import {
  Card,
  CardContent,
  ProgressBar,
  ProgressBarFill,
  ProgressBarTrack,
  Typography,
} from '@heroui/react'
import { getUserList } from '../../api/user'
import request from '../../api/request'
import { useAuthStore } from '../../stores/auth'
import GlassTilt from '../../components/GlassTilt'
import glassBg from '../../assets/hero-glass-bg.webp'
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
    queryFn: () => request.get<never, ServerInfo>('/system/server', { silent: true }),
    retry: false,
  })

  return (
    <div className="space-y-6">
      <GlassTilt className="rounded-2xl border border-white/60 [box-shadow:0_210px_218px_0_rgba(0,0,0,0.07),0_26px_27px_0_rgba(0,0,0,0.04)]">
        <div className="relative flex flex-col gap-1 overflow-hidden rounded-2xl p-8">
          <img src={glassBg} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-r from-black/35 via-black/15 to-transparent dark:from-black/55 dark:via-black/30"
          />
          <Typography.Heading level={3} className="relative text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.25)]">
            {greeting()}，{nickName ?? '管理员'}
          </Typography.Heading>
          <Typography.Paragraph size="sm" className="relative text-white/85">
            欢迎使用 Admin 管理平台
          </Typography.Paragraph>
        </div>
      </GlassTilt>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <Typography.Paragraph size="sm" color="muted">用户总数</Typography.Paragraph>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{userTotal ?? '—'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <Typography.Paragraph size="sm" color="muted">内存使用</Typography.Paragraph>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{server ? `${server.memory.usage}%` : '—'}</p>
            {server && (
              <ProgressBar aria-label="内存使用率" value={server.memory.usage}>
                {({ percentage }) => (
                  <ProgressBarTrack>
                    <ProgressBarFill color={usageColor(server.memory.usage)} style={{ width: `${percentage}%` }} />
                  </ProgressBarTrack>
                )}
              </ProgressBar>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <Typography.Paragraph size="sm" color="muted">磁盘使用</Typography.Paragraph>
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{server ? `${server.disk.usage}%` : '—'}</p>
            {server && (
              <ProgressBar aria-label="磁盘使用率" value={server.disk.usage}>
                {({ percentage }) => (
                  <ProgressBarTrack>
                    <ProgressBarFill color={usageColor(server.disk.usage)} style={{ width: `${percentage}%` }} />
                  </ProgressBarTrack>
                )}
              </ProgressBar>
            )}
          </CardContent>
        </Card>
      </div>

      {server && (
        <Card>
          <CardContent className="flex flex-row flex-wrap gap-6">
            <div>
              <Typography.Paragraph size="sm" color="muted">CPU 核心 / 使用率</Typography.Paragraph>
              <Typography.Paragraph size="base" weight="medium">
                {server.cpu.cpuNum} 核 · {server.cpu.cpuUsed}%
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Paragraph size="sm" color="muted">内存</Typography.Paragraph>
              <Typography.Paragraph size="base" weight="medium">
                {server.memory.used}G / {server.memory.total}G
              </Typography.Paragraph>
            </div>
            <div>
              <Typography.Paragraph size="sm" color="muted">Python 版本</Typography.Paragraph>
              <Typography.Paragraph size="base" weight="medium">{server.python.version}</Typography.Paragraph>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
