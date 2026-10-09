import request from './request'
import type { CurrentUserInfo, CaptchaResult, TokenResponse } from '../types/user'

export const getCaptcha = () => request.get<never, CaptchaResult>('/captchaImage')

export const login = (data: { username: string; password: string; code: string; uuid: string }) =>
  request.post<never, TokenResponse>('/login', new URLSearchParams(data))

export const getInfo = () =>
  request.get<never, { user: CurrentUserInfo; roles: string[]; permissions: string[] }>('/getInfo')

export const logout = () => request.post<never, null>('/logout')
