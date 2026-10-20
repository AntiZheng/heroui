import { lazy, Suspense, type ReactElement } from 'react'
import HomePage from '../pages/home'
import UserPage from '../pages/system/user'
import RolePage from '../pages/system/role'
import DeptPage from '../pages/system/dept'
import PostPage from '../pages/system/post'
import DictPage from '../pages/system/dict'
import DictDataPage from '../pages/system/dict/data'
import ConfigPage from '../pages/system/config'
import NoticePage from '../pages/system/notice'
import NoticeEditorPage from '../pages/system/notice/NoticeEditorPage'
import JobPage from '../pages/system/job'
import OperLogPage from '../pages/system/operlog'
import LoginLogPage from '../pages/system/logininfor'

const MenuPage = lazy(() => import('../pages/system/menu'))
const MapPage = lazy(() => import('../pages/map'))
const EditorPage = lazy(() => import('../pages/editor'))

export interface MenuExtraRoute {
  path: string
  element: ReactElement
  crumbLabel?: string
}

export interface MenuPageDef {
  element: ReactElement
  extras?: MenuExtraRoute[]
}

export const menuPageRegistry: Record<string, MenuPageDef> = {
  index: { element: <HomePage /> },
  'system/user': { element: <UserPage /> },
  'system/role': { element: <RolePage /> },
  'system/dept': { element: <DeptPage /> },
  'system/post': { element: <PostPage /> },
  'system/menu': { element: <Suspense><MenuPage /></Suspense> },
  'system/dict': {
    element: <DictPage />,
    extras: [{ path: 'data/:dictType', element: <DictDataPage /> }],
  },
  'system/config': { element: <ConfigPage /> },
  'system/notice': {
    element: <NoticePage />,
    extras: [
      { path: 'new', element: <NoticeEditorPage />, crumbLabel: '新增公告' },
      { path: 'edit/:noticeId', element: <NoticeEditorPage />, crumbLabel: '编辑公告' },
    ],
  },
  'system/job': { element: <JobPage /> },
  'monitor/operlog': { element: <OperLogPage /> },
  'monitor/logininfor': { element: <LoginLogPage /> },
  editor: { element: <Suspense><EditorPage /></Suspense> },
  map: { element: <Suspense><MapPage /></Suspense> },
}
