export interface SysDictTypeRow {
  dict_id: number
  dict_name: string
  dict_type: string
  status: string
  remark?: string | null
  create_time?: string | null
}

export interface DictTypePayload {
  dictId?: number
  dictName: string
  dictType: string
  status: string
  remark?: string
}

export interface SysDictDataRow {
  dict_code: number
  dict_sort: number
  dict_label: string
  dict_value: string
  dict_type: string
  css_class?: string | null
  list_class?: string | null
  is_default?: string
  status: string
  remark?: string | null
  create_time?: string | null
}

export interface DictDataPayload {
  dictCode?: number
  dictSort: number
  dictLabel: string
  dictValue: string
  dictType: string
  listClass?: string
  isDefault?: string
  status?: string
  remark?: string
}
