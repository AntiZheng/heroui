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
  Typography,
} from '@heroui/react'
import { getCaptcha, login, getInfo } from '../../api/auth'
import { useAuthStore } from '../../stores/auth'
import GlassTilt from '../../components/GlassTilt'
import glassBg from '../../assets/hero-glass-bg.webp'

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
    <div className="relative flex h-screen items-center justify-center overflow-hidden">
      <img src={glassBg} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />
      <div aria-hidden className="absolute inset-0 bg-black/0 dark:bg-black/40" />
      <GlassTilt className="w-full max-w-sm rounded-[20px]">
        <Card
          variant="transparent"
          className="rounded-[20px] border border-white/60 bg-background/70 [box-shadow:0_210px_218px_0_rgba(0,0,0,0.07),0_26px_27px_0_rgba(0,0,0,0.04)] backdrop-blur-xl"
        >
          <CardContent className="flex flex-col gap-4 p-8">
            <Typography.Heading level={3} className="text-center">欢迎回来</Typography.Heading>
            <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <TextField value={username} onChange={setUsername} name="username" isRequired>
                <Label>账号</Label>
                <Input placeholder="请输入账号" autoComplete="username" className="bg-white/40! backdrop-blur-sm" />
                <FieldError />
              </TextField>
              <TextField value={password} onChange={setPassword} name="password" isRequired>
                <Label>密码</Label>
                <Input type="password" placeholder="请输入密码" autoComplete="current-password" className="bg-white/40! backdrop-blur-sm" />
                <FieldError />
              </TextField>
              <div className="flex items-end gap-2">
                <TextField value={code} onChange={setCode} name="code" isRequired className="flex-1">
                  <Label>验证码</Label>
                  <Input placeholder="请输入验证码" autoComplete="off" className="bg-white/40! backdrop-blur-sm" />
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
              <Button type="submit" variant="primary" size="sm" isPending={submitting}>
                登 录
              </Button>
            </Form>
          </CardContent>
        </Card>
      </GlassTilt>
    </div>
  )
}
