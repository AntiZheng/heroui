import request from './request'
import type { PageResult } from '../types/api'
import type { TrackDetail, TrackPayload, TrackRoadsResult, TrackRow, TrackUpdatePayload } from '../types/track'

export interface TrackListQuery {
  pageNum: number
  pageSize: number
  trackName?: string
}

export const getTrackList = (params: TrackListQuery) =>
  request.get<never, PageResult<TrackRow>>('/track/list', { params })

export const getTrackDetail = (trackId: number) =>
  request.get<never, TrackDetail>(`/track/${trackId}`)

export const getTrackRoads = (trackId: number) =>
  request.get<never, TrackRoadsResult>(`/track/${trackId}/roads`)

export const addTrack = (data: TrackPayload) =>
  request.post<never, null>('/track', data)

export const editTrack = (data: TrackUpdatePayload) =>
  request.put<never, null>('/track', data)

export const deleteTracks = (trackIds: number[]) =>
  request.delete<never, null>(`/track/${trackIds.join(',')}`)
