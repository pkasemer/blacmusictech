"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import type { Playback } from "@/lib/types";

/** A link to play any song. An older server only plays public ones. */
async function songUrl(trackId: string): Promise<string> {
  let answer: Playback;
  try {
    answer = await api<Playback>(`/tracks/${trackId}/playback`);
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "not_available") throw e;
    try {
      answer = await api<Playback>(`/api/playback/${trackId}`);
    } catch (e2) {
      if (e2 instanceof ApiError && e2.status === 404) throw new ApiError(404, "not_playable", "This song is not public, and the server cannot play drafts here yet.");
      throw e2;
    }
  }
  const url = answer.playback?.mode === "url" ? answer.playback.url : undefined;
  if (!url) throw new ApiError(0, "no_url", "This song cannot be played here.");
  return url;
}

/** The timing tool's own audio element: it needs the exact position, speed control and "play just this part". */
export function useSongAudio(trackId: string) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const stopAt = useRef<number | null>(null);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; error: string }>({ status: "loading", error: "" });
  const [playing, setPlaying] = useState(false);
  const [now, setNow] = useState(0);
  const [length, setLength] = useState(0);
  const [rate, setRateState] = useState(1);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const a = new Audio();
    a.preload = "auto";
    audio.current = a;
    let live = true;
    let retried = false;
    let resumeAt = 0;
    const load = () =>
      songUrl(trackId)
        .then((url) => {
          if (live) a.src = url;
        })
        .catch((e: unknown) => {
          if (live) setState({ status: "error", error: e instanceof ApiError ? e.message : "The song could not be loaded." });
        });
    const on = {
      loadedmetadata: () => {
        setLength(Number.isFinite(a.duration) ? a.duration * 1000 : 0);
        if (resumeAt) a.currentTime = resumeAt;
        setState({ status: "ready", error: "" });
      },
      play: () => setPlaying(true),
      pause: () => setPlaying(false),
      ended: () => setPlaying(false),
      timeupdate: () => setNow(a.currentTime * 1000),
      // the link is short lived: ask for a fresh one once and carry on from the same place
      error: () => {
        if (!a.getAttribute("src")) return;
        setPlaying(false);
        if (retried) return setState({ status: "error", error: "The audio could not be loaded." });
        retried = true;
        resumeAt = a.currentTime;
        void load();
      },
      playing: () => {
        retried = false;
      },
    };
    for (const [name, f] of Object.entries(on)) a.addEventListener(name, f);
    void load();
    return () => {
      live = false;
      for (const [name, f] of Object.entries(on)) a.removeEventListener(name, f);
      a.pause();
      a.removeAttribute("src");
      audio.current = null;
    };
  }, [trackId, attempt]);

  // smooth position while playing, and the stop for "play just this line"
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const a = audio.current;
      if (a) {
        const ms = a.currentTime * 1000;
        setNow(ms);
        if (stopAt.current !== null && ms >= stopAt.current) {
          stopAt.current = null;
          a.pause();
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const play = useCallback(() => {
    stopAt.current = null;
    void audio.current?.play().catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a) return;
    stopAt.current = null;
    if (a.paused) void a.play().catch(() => {});
    else a.pause();
  }, []);
  const seek = useCallback((ms: number) => {
    const a = audio.current;
    if (!a) return;
    stopAt.current = null;
    a.currentTime = Math.max(0, ms / 1000);
    setNow(a.currentTime * 1000);
  }, []);
  const playPart = useCallback(
    (from: number, to: number) => {
      seek(from);
      stopAt.current = to > from ? to : null;
      void audio.current?.play().catch(() => {});
    },
    [seek],
  );
  const setRate = useCallback((r: number) => {
    if (audio.current) {
      audio.current.defaultPlaybackRate = r;
      audio.current.playbackRate = r;
    }
    setRateState(r);
  }, []);
  /** the exact position, in seconds */
  const position = useCallback(() => audio.current?.currentTime ?? 0, []);
  const reload = useCallback(() => {
    setState({ status: "loading", error: "" });
    setRateState(1);
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, playing, now, length, rate, play, toggle, seek, playPart, setRate, position, reload };
}

export type SongAudio = ReturnType<typeof useSongAudio>;
