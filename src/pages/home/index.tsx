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
    queryFn: () => request.get<never, ServerInfo>('/system/server', { silent: true }),
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
