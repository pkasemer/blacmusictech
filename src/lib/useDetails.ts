"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./api";
import type { FinishedPage } from "./importQueue";
import type { ImportJob } from "./imports";

/** The single-job answers for a few jobs, fetched together. `version` re-fetches; old answers stay while loading. */
export function useDetails(ids: string[], version: unknown): ReadonlyMap<string, ImportJob> {
  const [map, setMap] = useState<ReadonlyMap<string, ImportJob>>(() => new Map());
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    const ctrl = new AbortController();
    const wanted = key.split(",");
    Promise.all(wanted.map((id) => api<ImportJob>(`/imports/${id}`, { signal: ctrl.signal }).catch(() => null))).then((answers) => {
      if (ctrl.signal.aborted) return;
      // a job that could not be read is left out: the page then shows it without song names
      setMap(new Map(answers.filter((a): a is ImportJob => !!a).map((a) => [a.jobId, a])));
    });
    return () => ctrl.abort();
  }, [key, version]);
  return map;
}

const PAGE = 100;

/** The finished imports, newest first: the first `want` of them, in pages. `version` re-fetches. */
export function useFinished(want: number, version: unknown): { data: FinishedPage | undefined; error: ApiError | undefined; retry: () => void } {
  const [data, setData] = useState<FinishedPage>();
  const [error, setError] = useState<ApiError>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    const load = async () => {
      const rows = new Map<string, ImportJob>(); // an import finishing between two pages would otherwise appear twice
      let total: number | undefined;
      for (let offset = 0; offset < want; offset += PAGE) {
        const page = await api<FinishedPage>(`/imports?state=finished&limit=${PAGE}&offset=${offset}`, { signal: ctrl.signal });
        for (const j of page.imports) rows.set(j.jobId, j);
        total = page.total;
        if (total === undefined || offset + PAGE >= total) break;
      }
      return { imports: [...rows.values()], total };
    };
    load().then(
      (answer) => {
        if (ctrl.signal.aborted) return;
        setData(answer);
        setError(undefined);
      },
      (e: unknown) => {
        if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e : new ApiError(0, "error", "Could not read the finished imports."));
      },
    );
    return () => ctrl.abort();
  }, [want, version, tick]);
  const retry = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, retry };
}
