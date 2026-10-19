import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Button,
  Card,
  CardContent,
  FieldError,
  Form,
  Input,
  Label,
  Link,
  TextField,
  Typography,
  toast,
} from '@heroui/react'
import { getCaptcha, register } from '../../api/auth'
import { getConfigByKey, REGISTER_USER_KEY } from '../../api/config'
import GlassTilt from '../../components/GlassTilt'
import glassBg from '../../assets/hero-glass-bg.webp'

export default function RegisterPage() {
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [captcha, setCaptcha] = useState<{ uuid: string; img: string; enabled: boolean | null }>({
    uuid: '',
    img: '',
    enabled: null,
  })
  const [submitting, setSubmitting] = useState(false)

  const {
    data: registerEnabled,
    isPending: checking,
    isError,
  } = useQuery({
    queryKey: ['config-key', REGISTER_USER_KEY],
    queryFn: () => getConfigByKey(REGISTER_USER_KEY, true),
    staleTime: Infinity,
    retry: false,
  })

  const refreshCaptcha = async () => {
    try {
      const res = await getCaptcha()
      setCaptcha({ uuid: res.uuid, img: res.img, enabled: res.captchaEnabled })
    } catch {
      // 验证码失败时用户可点击重试
    }
  }
  useEffect(() => {
    refreshCaptcha()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirmPassword) {
      toast('提示', { description: '两次输入的密码不一致', variant: 'warning' })
      return
    }
    setSubmitting(true)
    try {
      await register({
        username: username.trim(),
        password,
        confirm_password: confirmPassword,
        code,
        uuid: captcha.uuid,
      })
      toast('成功', { description: '注册成功，请登录', variant: 'success' })
      navigate('/login', { replace: true, state: { username: username.trim() } })
    } catch {
      if (captcha.enabled !== false) await refreshCaptcha()
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const disabled = !checking && !isError && registerEnabled !== 'true'

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
            <Typography.Heading level={3} className="text-center">创建账号</Typography.Heading>
            {checking ? (
              <p className="py-8 text-center text-[13px] text-muted">正在检查注册状态…</p>
            ) : disabled ? (
              <div className="flex flex-col gap-4 pb-2">
                <p className="text-center text-[13px] text-muted">系统暂未开放用户注册，请联系管理员。</p>
                <Button variant="secondary" size="sm" onPress={() => navigate('/login')}>
                  返回登录
                </Button>
              </div>
            ) : (
              <Form className="flex flex-col gap-4" onSubmit={handleSubmit}>
                <TextField value={username} onChange={setUsername} name="username" isRequired>
                  <Label>账号</Label>
                  <Input placeholder="请输入账号" autoComplete="username" className="bg-white/40! backdrop-blur-sm" />
                  <FieldError />
                </TextField>
                <TextField value={password} onChange={setPassword} name="password" isRequired>
                  <Label>密码</Label>
                  <Input
                    type="password"
                    placeholder="请输入密码"
                    autoComplete="new-password"
                    className="bg-white/40! backdrop-blur-sm"
                  />
                  <FieldError />
                </TextField>
                <TextField value={confirmPassword} onChange={setConfirmPassword} name="confirmPassword" isRequired>
                  <Label>确认密码</Label>
                  <Input
                    type="password"
                    placeholder="请再次输入密码"
                    autoComplete="new-password"
                    className="bg-white/40! backdrop-blur-sm"
                  />
                  <FieldError />
                </TextField>
                {captcha.enabled !== false && (
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
                )}
                <Button type="submit" variant="primary" size="sm" isPending={submitting}>
                  注 册
                </Button>
                <div className="flex items-center justify-center gap-1 text-[12px] text-muted">
                  <span>已有账号？</span>
                  <Link onPress={() => navigate('/login')} className="text-[12px]">
                    返回登录
                  </Link>
                </div>
              </Form>
            )}
          </CardContent>
        </Card>
      </GlassTilt>
    </div>
  )
}
