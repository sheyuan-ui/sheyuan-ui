interface ImportMetaEnv {
  /** "false" 时关闭本地 mock，直连管理服务；默认开启 */
  readonly VITE_USE_MOCK?: string;
  /** 管理服务地址，如 http://127.0.0.1:8080；留空走同源（开发时由 Vite 代理 /api） */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}