/// <reference types="@amap/amap-jsapi-types" />

interface Window {
  _AMapSecurityConfig?: {
    serviceHost?: string
    securityJsCode?: string
  }
}

interface ImportMetaEnv {
  readonly VITE_AMAP_KEY?: string
}
