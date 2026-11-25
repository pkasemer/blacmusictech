"use client";

import { useState } from "react";
import { Badge, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { actionLabel, fmtDateTime } from "@/lib/format";
import type { AuditList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 50;

function tone(action: string): "red" | "green" | "amber" | "blue" | "gray" {
  if (/delete|ban$|takedown|reject|revoke|login_failed/.test(action)) return "red";
  if (/unban|restore|verify|publish$/.test(action) && !/unpublish/.test(action)) return "green";
  if (/update|grant|items|create/.test(action)) return "blue";
  return "gray";
}

export default function AuditLogPage() {
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const actorTerm = useDebounced(actor);
  const list = useApi<AuditList>(`/audit-log${qs({ actor: actorTerm, action, targetType, from, to, limit: LIMIT, offset })}`);
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setOffset(0);
  };

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every sign-in, ban, deletion, verification and edit made by an administrator. Read only." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input aria-label="Administrator" className="max-w-[14rem]" placeholder="Administrator email" value={actor} onChange={(e) => reset(setActor)(e.target.value)} />
        <Select aria-label="Action" value={action} onChange={(e) => reset(setAction)(e.target.value)}>
          <option value="">Any action</option>
          {["login", "login_failed", "user", "artist", "release", "track", "playlist"].map((a) => (
            <option key={a} value={a}>
              {a === "login" || a === "login_failed" ? a.replace("_", " ") : `${a} actions`}
            </option>
          ))}
        </Select>
        <Select aria-label="Target" value={targetType} onChange={(e) => reset(setTargetType)(e.target.value)}>
          <option value="">Any target</option>
          {["user", "artist", "release", "track", "playlist"].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Input aria-label="From date" type="date" className="w-auto" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        <Input aria-label="To date" type="date" className="w-auto" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.entries.length === 0 && <Empty>No entries match.</Empty>}
      {list.data && list.data.entries.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Administrator</Th>
                <Th>Action</Th>
                <Th>Target</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.entries.map((e) => (
                <tr key={e.id}>
                  <Td className="whitespace-nowrap text-muted">{fmtDateTime(e.at)}</Td>
                  <Td>
                    {e.actor.email}
                    {e.ip && <div className="text-xs text-muted">{e.ip}</div>}
                  </Td>
                  <Td>
                    <Badge tone={tone(e.action)}>{actionLabel(e.action)}</Badge>
                  </Td>
                  <Td>
                    <div className="max-w-[16rem] truncate">{e.targetLabel || e.targetId}</div>
                    <div className="text-xs text-muted">
                      {e.targetType} · {e.targetId}
                    </div>
                  </Td>
                  <Td className="max-w-xs break-words text-muted">{e.reason || "–"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination total={list.data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}
