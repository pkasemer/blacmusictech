"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";

export interface Query<T> {
  data: T | undefined;
  error: ApiError | undefined;
  loading: boolean;
  reload: () => void;
}

interface Result {
  key: string;
  error?: ApiError;
}

/** GET a path (null = do not fetch). Reloads when the path changes; keeps the old data while reloading. */
export function useApi<T>(path: string | null): Query<T> {
  const [data, setData] = useState<T>();
  const [result, setResult] = useState<Result>();
  const [tick, setTick] = useState(0);
  const key = path === null ? null : `${path}#${tick}`;

  useEffect(() => {
    if (path === null) return;
    const mine = `${path}#${tick}`;
    const ctrl = new AbortController();
    api<T>(path, { signal: ctrl.signal })
      .then((d) => {
        if (ctrl.signal.aborted) return;
        setData(d);
        setResult({ key: mine });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || (e as Error).name === "AbortError") return;
        setResult({ key: mine, error: e instanceof ApiError ? e : new ApiError(0, "error", String(e)) });
      });
    return () => ctrl.abort();
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = key !== null && result?.key === key;
  return { data, error: current ? result?.error : undefined, loading: key !== null && !current, reload };
}

/** Calls `reload` every `ms` while `active`, but only when the tab is visible. */
export function usePoll(active: boolean, reload: () => void, ms = 15_000): void {
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") reload();
    }, ms);
    return () => clearInterval(t);
  }, [active, reload, ms]);
}

/** Debounces a fast-changing value (a search box). */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
