import { useQuery } from '@tanstack/react-query'
import {
  getConfigByKey,
  MODAL_BACKDROP_KEY,
  MODAL_BACKDROP_OPTIONS,
  type ModalBackdropVariant,
} from '../api/config'

export function useModalBackdropVariant(): ModalBackdropVariant {
  const { data } = useQuery({
    queryKey: ['config-key', MODAL_BACKDROP_KEY],
    queryFn: () => getConfigByKey(MODAL_BACKDROP_KEY),
    staleTime: Infinity,
    retry: false,
  })

  return MODAL_BACKDROP_OPTIONS.some((o) => o.key === data)
    ? (data as ModalBackdropVariant)
    : 'opaque'
}
