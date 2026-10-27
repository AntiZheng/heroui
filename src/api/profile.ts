import request from './request'

// 当前用户头像上传（走 /system/user/profile）
export const uploadMyAvatar = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<never, { avatar: string; file_id: number }>('/system/user/profile/avatar', fd)
}

// 管理员为他人上传头像（走 /system/file/avatar）
export const uploadAdminAvatar = (file: File) => {
  const fd = new FormData()
  fd.append('file', file)
  return request.post<never, { avatar: string; file_id: number }>('/system/file/avatar', fd)
}

export const updateProfileInfo = (data: { nickName?: string; email?: string; phonenumber?: string; avatar?: string }) =>
  request.put<never, null>('/system/user/profile/info', data)
