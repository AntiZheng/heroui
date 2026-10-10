import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  CardContent,
  FieldError,
  Form,
  Input,
  Label,
  TextField,
} from '@heroui/react'
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

  // Form 默认 native 校验：必填未填时拦截提交，onSubmit 只在校验通过后触发
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
      <div className="relative hidden flex-1 flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-accent via-accent/90 to-accent/70 lg:flex">
        <div className="absolute -left-24 -top-24 size-96 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" aria-hidden />
        <h1 className="relative text-4xl font-bold text-accent-foreground">Admin 管理平台</h1>
        <p className="relative mt-4 text-accent-foreground/80">HeroUI × FastAPI 最小验证版</p>
      </div>
      <div className="flex flex-1 items-center justify-center">
        <Card className="w-full max-w-sm">
          <CardContent className="flex flex-col gap-4 p-8">
            <h2 className="text-2xl font-semibold">欢迎回来</h2>
            <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <TextField value={username} onChange={setUsername} name="username" isRequired>
                <Label>账号</Label>
                <Input placeholder="请输入账号" autoComplete="username" />
                <FieldError />
              </TextField>
              <TextField value={password} onChange={setPassword} name="password" isRequired>
                <Label>密码</Label>
                <Input type="password" placeholder="请输入密码" autoComplete="current-password" />
                <FieldError />
              </TextField>
              <div className="flex items-end gap-2">
                <TextField value={code} onChange={setCode} name="code" isRequired className="flex-1">
                  <Label>验证码</Label>
                  <Input placeholder="请输入验证码" autoComplete="off" />
                  <FieldError />
                </TextField>
                {captcha.img ? (
                  <img
                    src={captcha.img}
                    alt="验证码，点击刷新"
                    title="点击刷新"
                    className="h-10 cursor-pointer rounded-lg"
                    onClick={refreshCaptcha}
                  />
                ) : (
                  <Button variant="secondary" type="button" onPress={refreshCaptcha}>
                    获取
                  </Button>
                )}
              </div>
              <Button type="submit" variant="primary" isPending={submitting}>
                登 录
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
