"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtDate } from "@/lib/format";
import { ACTIVITY, DISCOVERY, GROUPS, layout, neighbours, reasons, short, stated, strength, type PrefGraph, type PrefNode, type PrefType } from "@/lib/preferenceGraph";
import { useApi } from "@/lib/useApi";
import { Button, Card, cx, ErrorBox, Loading, Table, Td, Th } from "./ui";

const describe = (n: PrefNode) => [n.label, n.type, ...reasons(n), ...ACTIVITY.filter(([k]) => n.activity[k] > 0).map(([k, label]) => `${label}: ${n.activity[k]}`)].join(", ");

export function PreferenceCard({ userId, name }: { userId: string; name: string }) {
  const q = useApi<PrefGraph>(`/users/${userId}/preference-graph`);
  const unavailable = q.error?.code === "not_available" || q.error?.status === 405;
  return (
    <Card title="Preferences">
      {unavailable ? (
        <p className="text-sm text-muted">The server cannot show preferences yet. They appear here once it has been updated.</p>
      ) : q.error ? (
        <ErrorBox error={q.error} onRetry={q.reload} />
      ) : !q.data ? (
        <Loading />
      ) : (
        <Preferences graph={q.data} name={name} />
      )}
    </Card>
  );
}

function Preferences({ graph, name }: { graph: PrefGraph; name: string }) {
  const [view, setView] = useState<"graph" | "list">("graph");
  const [hidden, setHidden] = useState<ReadonlySet<PrefType>>(() => new Set());
  const [pinned, setPinned] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const o = graph.onboarding;
  const setup = o.completed ? `Finished setting up the app${DISCOVERY[o.discoveryMode] ? ` · Discovery: ${DISCOVERY[o.discoveryMode]}` : ""}` : "Has not finished setting up the app";

  if (graph.nodes.length === 0)
    return (
      <p className="text-sm text-muted">
        {setup}. Nothing chosen, followed or listened to yet.
      </p>
    );

  const present = GROUPS.filter((g) => graph.nodes.some((n) => n.type === g.type));
  const shown = graph.nodes.filter((n) => !hidden.has(n.type));
  const focusId = hovered ?? pinned;
  const focus = shown.find((n) => n.id === focusId);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {setup}
        {o.updatedAt ? ` (choices saved ${fmtDate(o.updatedAt)})` : ""}. Listening numbers cover the last {graph.windowDays} days.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Kinds shown" className="flex flex-wrap gap-1.5">
          {present.map((g) => (
            <button
              key={g.type}
              type="button"
              aria-pressed={!hidden.has(g.type)}
              onClick={() =>
                setHidden((old) => {
                  const next = new Set(old);
                  if (!next.delete(g.type)) next.add(g.type);
                  return next;
                })
              }
              className={cx("inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-3 text-sm font-medium", hidden.has(g.type) ? "text-faint line-through" : "bg-panel text-ink hover:bg-sunken")}
            >
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: g.color }} />
              {g.label}
              <span className="tabular-nums text-xs text-muted">{graph.nodes.filter((n) => n.type === g.type).length}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          <Button small aria-pressed={view === "graph"} variant={view === "graph" ? "primary" : undefined} onClick={() => setView("graph")}>
            Graph
          </Button>
          <Button small aria-pressed={view === "list"} variant={view === "list" ? "primary" : undefined} onClick={() => setView("list")}>
            List
          </Button>
        </div>
      </div>

      {view === "list" ? (
        <PreferenceTable nodes={shown} />
      ) : (
        <>
          <Graph graph={graph} name={name} hidden={hidden} focusId={focus?.id ?? null} onHover={setHovered} onPick={(id) => setPinned((old) => (old === id ? null : id))} />
          <p className="text-xs text-muted">
            Filled dot: the user chose or follows it. Ring: seen only in their listening. A bigger dot means more plays, likes and saves. Curved lines join artists to the genres of the songs. Languages and regions are only what the user chose.
          </p>
          <div aria-live="polite" className="min-h-20 rounded-control border border-line bg-sunken/40 px-3 py-2.5 text-sm">
            {focus ? <Detail graph={graph} node={focus} /> : <p className="text-muted">Point at a dot, or select it, to see why it is here and what it connects to.</p>}
          </div>
        </>
      )}
    </div>
  );
}

function Graph({ graph, name, hidden, focusId, onHover, onPick }: { graph: PrefGraph; name: string; hidden: ReadonlySet<PrefType>; focusId: string | null; onHover: (id: string | null) => void; onPick: (id: string) => void }) {
  const { box, hubs, nodes } = layout(graph, hidden);
  const byId = new Map(nodes.map((n) => [n.node.id, n]));
  const bright = focusId ? neighbours(graph, focusId) : null;
  const dim = (id: string) => (bright && !bright.has(id) ? 0.2 : 1);
  const hubOf = (type: PrefType) => hubs.find((h) => h.type === type)!;

  return (
    <div className="overflow-x-auto">
      <svg viewBox={box.join(" ")} role="group" aria-label={`Preference graph of ${name}`} className="mx-auto block h-auto w-full min-w-160" style={{ maxWidth: box[2] }}>
        <g fill="none" className="stroke-line" strokeWidth={1.5}>
          {hubs.map((h) => (
            <line key={h.type} x1={0} y1={0} x2={h.x} y2={h.y} strokeWidth={2.5} />
          ))}
          {nodes.map((n) => (
            <line key={n.node.id} x1={hubOf(n.node.type).x} y1={hubOf(n.node.type).y} x2={n.x} y2={n.y} opacity={dim(n.node.id)} />
          ))}
        </g>
        <g fill="none">
          {graph.links.map((l) => {
            const a = byId.get(l.source);
            const b = byId.get(l.target);
            if (!a || !b) return null;
            const on = focusId === l.source || focusId === l.target;
            return (
              <path
                key={`${l.source}>${l.target}`}
                d={`M${a.x},${a.y} Q${(a.x + b.x) * 0.3},${(a.y + b.y) * 0.3} ${b.x},${b.y}`}
                stroke={a.color}
                strokeWidth={Math.min(1 + l.weight / 2, 4)}
                opacity={on ? 0.9 : focusId ? 0.08 : 0.35}
              />
            );
          })}
        </g>
        <circle r={34} className="fill-ink" />
        <text textAnchor="middle" y={5} className="fill-panel text-[14px] font-semibold">
          {short(name.split(" ")[0] ?? name, 8)}
        </text>
        {hubs.map((h) => (
          <g key={h.type}>
            <rect x={h.x - 44} y={h.y - 12} width={88} height={24} rx={12} className="fill-panel" stroke={h.color} strokeWidth={2} />
            <text x={h.x} y={h.y + 4} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
              {h.label}
            </text>
          </g>
        ))}
        {nodes.map((n) => (
          <g
            key={n.node.id}
            role="button"
            tabIndex={0}
            aria-label={describe(n.node)}
            className="cursor-pointer outline-none focus-visible:[&>circle]:stroke-ink"
            opacity={dim(n.node.id)}
            onMouseEnter={() => onHover(n.node.id)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(n.node.id)}
            onBlur={() => onHover(null)}
            onClick={() => onPick(n.node.id)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onPick(n.node.id);
            }}
          >
            <circle cx={n.x} cy={n.y} r={Math.max(n.r, 14)} fill="transparent" stroke="none" />
            <circle cx={n.x} cy={n.y} r={n.r} fill={stated(n.node) ? n.color : "#ffffff"} stroke={stated(n.node) ? "#ffffff" : n.color} strokeWidth={stated(n.node) ? 2 : 3} />
            <text x={n.labelX} y={n.labelY} textAnchor={n.anchor} className={cx("fill-ink text-[13px]", focusId === n.node.id && "font-semibold")} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
              {short(n.node.label)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Detail({ graph, node }: { graph: PrefGraph; node: PrefNode }) {
  const near = neighbours(graph, node.id);
  const linked = graph.nodes.filter((n) => n.id !== node.id && near.has(n.id));
  const numbers = ACTIVITY.filter(([k]) => node.activity[k] > 0);
  return (
    <div className="space-y-1">
      <p>
        <strong>{node.label}</strong> <span className="text-muted">· {node.type}</span>
        {node.type === "artist" && (
          <Link href={`/artists/${node.id.replace(/^artist:/, "")}`} className="ml-2 text-primary hover:underline">
            Open artist
          </Link>
        )}
      </p>
      <p className="text-muted">{reasons(node).join(" · ") || "No activity in this period"}</p>
      {numbers.length > 0 && <p className="tabular-nums">{numbers.map(([k, label]) => `${label} ${node.activity[k]}`).join(" · ")}</p>}
      {linked.length > 0 && <p className="text-muted">Connected to {linked.map((n) => n.label).join(", ")}</p>}
    </div>
  );
}

function PreferenceTable({ nodes }: { nodes: PrefNode[] }) {
  const rows = GROUPS.flatMap((g) => nodes.filter((n) => n.type === g.type).sort((a, b) => strength(b.activity) - strength(a.activity)));
  return (
    <div className="overflow-x-auto">
      <Table>
        <thead>
          <tr>
            <Th>Preference</Th>
            <Th>Why it is here</Th>
            {ACTIVITY.map(([k, label]) => (
              <Th key={k}>{label}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((n) => (
            <tr key={n.id}>
              <Td>
                <div className="font-medium">{n.label}</div>
                <div className="text-xs text-muted">{n.type}</div>
              </Td>
              <Td className="text-sm text-muted">{reasons(n).join(" · ") || "–"}</Td>
              {ACTIVITY.map(([k]) => (
                <Td key={k} className="tabular-nums">
                  {n.activity[k] || "–"}
                </Td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
