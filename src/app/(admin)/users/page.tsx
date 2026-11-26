"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Badge, Empty, ErrorBox, Input, Loading, PageHeader, Pagination, Select, Table, Td, Th } from "@/components/ui";
import { qs } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import type { UserList } from "@/lib/types";
import { useApi, useDebounced } from "@/lib/useApi";

const LIMIT = 25;

export default function UsersPage() {
  const [q, setQ] = useState("");
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [role, setRole] = useState("");
  const [offset, setOffset] = useState(0);
  const term = useDebounced(q);
  const list = useApi<UserList>(`/users${qs({ q: term, status, role, limit: LIMIT, offset })}`);

  return (
    <>
      <PageHeader title="Users" subtitle="Everyone with an account" />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="Search users"
          className="max-w-xs"
          placeholder="Search by email or name"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
        <Select aria-label="Status" value={status} onChange={(e) => (setStatus(e.target.value), setOffset(0))}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="banned">Banned</option>
          <option value="unverified">Email not verified</option>
        </Select>
        <Select aria-label="Role" value={role} onChange={(e) => (setRole(e.target.value), setOffset(0))}>
          <option value="">Any role</option>
          <option value="user">Users</option>
          <option value="admin">Admins</option>
        </Select>
      </div>
      {list.error && <ErrorBox error={list.error} onRetry={list.reload} />}
      {!list.data && !list.error && <Loading />}
      {list.data && list.data.users.length === 0 && <Empty>No users match.</Empty>}
      {list.data && list.data.users.length > 0 && (
        <>
          <Table>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
              </tr>
            </thead>
            <tbody>
              {list.data.users.map((u) => (
                <tr key={u.id} className="hover:bg-canvas/50">
                  <Td>
                    <Link href={`/users/${u.id}`} className="font-medium hover:underline">
                      {u.displayName}
                    </Link>
                    <div className="text-xs text-muted">{u.email}</div>
                  </Td>
                  <Td>{u.role === "admin" ? <Badge tone="purple">Admin</Badge> : <span className="text-muted">User</span>}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.banned ? <Badge tone="red">Banned</Badge> : <Badge tone="green">Active</Badge>}
                      {!u.emailVerified && <Badge tone="amber">Email unverified</Badge>}
                      {u.hasArtist && <Badge tone="blue">Artist</Badge>}
                    </div>
                  </Td>
                  <Td className="text-muted">{fmtDate(u.createdAt)}</Td>
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
