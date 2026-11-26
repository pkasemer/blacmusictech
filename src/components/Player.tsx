"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { fmtDuration } from "@/lib/format";
import type { Playback } from "@/lib/types";
import { IClose, IMusic, IMute, IPause, IPlay, IVolume } from "./icons";
import { IconButton } from "./ui";

export interface PlayTrack {
  id: string;
  title: string;
  artist?: string;
}

interface PlayerApi {
  current: PlayTrack | null;
  playing: boolean;
  loading: boolean;
  now: number;
  total: number;
  volume: number;
  muted: boolean;
  play: (t: PlayTrack) => void;
  toggle: () => void;
  seek: (seconds: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  close: () => void;
}

const noop = () => {};
const Ctx = createContext<PlayerApi>({
  current: null, playing: false, loading: false, now: 0, total: 0, volume: 1, muted: false,
  play: noop, toggle: noop, seek: noop, setVolume: noop, toggleMute: noop, close: noop,
});
export const usePlayer = () => useContext(Ctx);

const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** One shared audio element for the whole admin: pressing play on another track replaces the current one. */
export function PlayerProvider({ children, onError }: { children: ReactNode; onError: (message: string) => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState<PlayTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState({ now: 0, total: 0 });
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const token = useRef(0);

  const play = useCallback(
    (t: PlayTrack) => {
      const a = audio.current;
      if (!a) return;
      const mine = ++token.current;
      setCurrent(t);
      setLoading(true);
      setPlaying(false);
      setTime({ now: 0, total: 0 });
      a.pause();
      api<Playback>(`/api/playback/${t.id}`)
        .then((p) => {
          if (mine !== token.current) return;
          const url = p.playback?.mode === "url" ? p.playback.url : undefined;
          if (!url) throw new ApiError(0, "no_url", "This track cannot be played here.");
          a.src = url;
          return a.play();
        })
        .catch((e: unknown) => {
          if (mine !== token.current) return;
          setCurrent(null);
          const msg =
            e instanceof ApiError
              ? e.status === 404 || e.status === 403
                ? "This track is not public, so it cannot be played here."
                : e.message
              : "The track could not be played.";
          onError(msg);
        })
        .finally(() => {
          if (mine === token.current) setLoading(false);
        });
    },
    [onError],
  );

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !a.src) return;
    if (a.paused) void a.play();
    else a.pause();
  }, []);

  const close = useCallback(() => {
    token.current++;
    const a = audio.current;
    if (a) {
      a.pause();
      a.removeAttribute("src");
    }
    setCurrent(null);
    setPlaying(false);
    setLoading(false);
  }, []);

  const seek = useCallback((s: number) => {
    if (audio.current) audio.current.currentTime = s;
  }, []);
  const setVolume = useCallback((v: number) => {
    if (audio.current) audio.current.volume = v;
    setVolumeState(v);
    if (v > 0) setMuted(false);
  }, []);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      if (audio.current) audio.current.muted = !m;
      return !m;
    });
  }, []);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setTime({ now: a.currentTime, total: Number.isFinite(a.duration) ? a.duration : 0 });
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onErr = () => {
      if (a.getAttribute("src")) onError("The audio could not be loaded.");
      setPlaying(false);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
      a.removeEventListener("error", onErr);
    };
  }, [onError]);

  // Space plays or pauses (unless the person is typing or pressing a button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (typing(e.target) || (e.target instanceof HTMLElement && ["BUTTON", "A", "SUMMARY"].includes(e.target.tagName))) return;
      if (!audio.current?.src) return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toggle]);

  const value = useMemo(
    () => ({ current, playing, loading, now: time.now, total: time.total, volume, muted, play, toggle, seek, setVolume, toggleMute, close }),
    [current, playing, loading, time, volume, muted, play, toggle, seek, setVolume, toggleMute, close],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <audio ref={audio} preload="none" />
    </Ctx.Provider>
  );
}

/** The transport bar docked at the bottom of the workspace. Shows nothing until a track is chosen. */
export function PlayerBar() {
  const p = usePlayer();
  if (!p.current) return null;
  const max = Math.max(1, Math.floor(p.total));
  const pos = Math.min(Math.floor(p.now), max);
  return (
    <div role="region" aria-label="Player" className="flex h-14 shrink-0 items-center gap-3 border-t border-line bg-panel px-4">
      <IconButton label={p.playing ? "Pause (Space)" : "Play (Space)"} variant="primary" onClick={p.toggle} disabled={p.loading}>
        {p.loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : p.playing ? <IPause size={15} /> : <IPlay size={15} />}
      </IconButton>
      <div className="flex min-w-0 basis-56 items-center gap-2.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-creative/10 text-creative-ink">
          <IMusic size={15} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium leading-tight">{p.current.title}</div>
          <div className="truncate text-[11px] text-muted">{p.current.artist || "Preview"}</div>
        </div>
      </div>
      <span className="hidden w-9 text-right text-[11px] tabular-nums text-muted sm:block">{fmtDuration(p.now * 1000)}</span>
      <input
        type="range"
        aria-label="Seek"
        className="hidden h-1 flex-1 cursor-pointer accent-primary sm:block"
        min={0}
        max={max}
        value={pos}
        onChange={(e) => p.seek(Number(e.target.value))}
      />
      <span className="hidden w-9 text-[11px] tabular-nums text-muted sm:block">{fmtDuration(p.total * 1000)}</span>
      <div className="hidden items-center gap-1 md:flex">
        <IconButton small label={p.muted || p.volume === 0 ? "Unmute" : "Mute"} onClick={p.toggleMute}>
          {p.muted || p.volume === 0 ? <IMute size={15} /> : <IVolume size={15} />}
        </IconButton>
        <input type="range" aria-label="Volume" className="h-1 w-20 cursor-pointer accent-primary" min={0} max={1} step={0.05} value={p.muted ? 0 : p.volume} onChange={(e) => p.setVolume(Number(e.target.value))} />
      </div>
      <IconButton small label="Close player" onClick={p.close}>
        <IClose size={15} />
      </IconButton>
    </div>
  );
}

/** A small play/pause button for a track row. */
export function PlayButton({ track, disabled, title }: { track: PlayTrack; disabled?: boolean; title?: string }) {
  const p = usePlayer();
  const active = p.current?.id === track.id;
  const label = `${active && p.playing ? "Pause" : "Play"} ${track.title}`;
  return (
    <IconButton small label={disabled ? (title ?? "Not public: cannot be played here") : label} disabled={disabled} className={active ? "text-primary" : undefined} onClick={() => (active ? p.toggle() : p.play(track))}>
      {active && p.loading ? <span className="size-3 animate-spin rounded-full border-2 border-primary/30 border-t-primary" /> : active && p.playing ? <IPause size={14} /> : <IPlay size={14} />}
    </IconButton>
  );
}
