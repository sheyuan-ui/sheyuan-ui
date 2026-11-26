import { useCallback, useEffect, useRef, useState } from "react";

export interface UseRequestOptions {
  /** 为 false 时不发请求，例如缺少必填参数 */
  enabled?: boolean;
  /** 请求参数指纹：变化即重新请求；多个参数请拼成稳定字符串 */
  key?: string | number;
}

export interface UseRequestResult<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  reload: () => void;
}

interface RequestResult<T> {
  key: string;
  data: T | null;
  error: unknown;
}

/**
 * 页面统一取数：加载态、错误态、请求竞态与卸载都在这里收口。
 * fetcher 可接收 AbortSignal 传给 request；不接收也可以。
 */
export function useRequest<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UseRequestOptions = {},
): UseRequestResult<T> {
  const { enabled = true, key = "" } = options;
  const [result, setResult] = useState<RequestResult<T> | null>(null);
  const [nonce, setNonce] = useState(0);
  const requestKey = `${enabled ? "on" : "off"}:${key}:${nonce}`;

  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  /** 当前有效的请求键；晚到的旧响应直接丢弃 */
  const latestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      latestKeyRef.current = null;
      return;
    }

    latestKeyRef.current = requestKey;
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((data) => {
        if (latestKeyRef.current !== requestKey) return;
        setResult({ key: requestKey, data, error: null });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (latestKeyRef.current !== requestKey) return;
        setResult({ key: requestKey, data: null, error: err });
      });

    return () => {
      controller.abort();
      if (latestKeyRef.current === requestKey) latestKeyRef.current = null;
    };
  }, [enabled, requestKey]);

  const reload = useCallback(() => {
    setNonce((value) => value + 1);
  }, []);

  // 请求键变了但结果还没回来，就是加载中
  const loading = enabled && result?.key !== requestKey;
  const settled = enabled && !loading;

  return {
    data: settled ? (result?.data ?? null) : null,
    error: settled ? (result?.error ?? null) : null,
    loading,
    reload,
  };
}