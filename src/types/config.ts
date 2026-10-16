export interface SysConfigRow {
  config_id: number
  config_name: string
  config_key: string
  config_value: string
  config_type: string
  remark?: string | null
  create_time?: string | null
}

export interface ConfigPayload {
  configId?: number
  configName: string
  configKey: string
  configValue: string
  configType: string
  remark?: string
}
