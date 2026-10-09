import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardBody, Input, addToast } from '@heroui/react'
import { getCaptcha, login, getInfo } from '../../api/auth'
import { useAuthStore } from '../../stores/auth'

export default function LoginPage() {
  const navigate = useNavigate()
  const setTokens = useAuthStore((s) => s.setTokens)
  const setUserInfo = useAuthStore((s) => s.setUserInfo)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [captcha, setCaptcha] = useState<{ uuid: string; img: string }>({ uuid: '', img: '' })
  const [submitting, setSubmitting] = useState(false)

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptcha()
      setCaptcha({ uuid: res.uuid, img: res.img })
    } catch {
      // 验证码失败时用户可点击重试
    }
  }
  // 首次加载拉取验证码（StrictMode 下会调两次，可接受）
  useEffect(() => {
    refreshCaptcha()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password || !code) {
      addToast({ title: '提示', description: '请填写完整登录信息', color: 'warning' })
      return
    }
    setSubmitting(true)
    try {
      const token = await login({ username, password, code, uuid: captcha.uuid })
      setTokens(token.access_token, token.refresh_token)
      const info = await getInfo()
      setUserInfo(info.user, info.roles, info.permissions)
      navigate('/', { replace: true })
    } catch {
      await refreshCaptcha()
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex h-screen">
      <div className="hidden flex-1 flex-col items-center justify-center bg-primary lg:flex">
        <h1 className="text-4xl font-bold text-primary-foreground">Admin 管理平台</h1>
        <p className="mt-4 text-primary-foreground/80">HeroUI × FastAPI 最小验证版</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardBody className="gap-4 p-8">
            <h2 className="text-xl font-semibold">欢迎回来</h2>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <Input
                label="账号"
                value={username}
                onValueChange={setUsername}
                isRequired
                placeholder="请输入账号"
              />
              <Input
                label="密码"
                type="password"
                value={password}
                onValueChange={setPassword}
                isRequired
                placeholder="请输入密码"
              />
              <div className="flex items-end gap-2">
                <Input
                  label="验证码"
                  value={code}
                  onValueChange={setCode}
                  isRequired
                  className="flex-1"
                />
                {captcha.img ? (
                  <img
                    src={captcha.img}
                    alt="验证码"
                    className="h-10 cursor-pointer rounded-medium"
                    onClick={refreshCaptcha}
                  />
                ) : (
                  <Button variant="flat" onPress={refreshCaptcha}>
                    获取
                  </Button>
                )}
              </div>
              <Button type="submit" color="primary" isLoading={submitting}>
                登 录
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
