import request from './request'
import type { PageResult } from '../types/api'
import type { PostListQuery, PostPayload, SysPostRow } from '../types/post'

export const getPostList = (params: PostListQuery) =>
  request.get<never, PageResult<SysPostRow>>('/system/post/list', { params })

export const addPost = (data: PostPayload) => request.post<never, null>('/system/post', data)

export const editPost = (data: PostPayload) => request.put<never, null>('/system/post', data)

export const deletePosts = (postIds: number[]) =>
  request.delete<never, null>(`/system/post/${postIds.join(',')}`)
