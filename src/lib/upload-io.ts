"use client";

import { api, ApiError, getCsrf } from "./api";
import type { UploadItem, UploadParts, UploadStart } from "./types";
import type { UploadIO } from "./upload";

/** The real network calls, all through this site's own server. */
export const uploadIO: UploadIO = {
  create: (meta, file) =>
    api<UploadStart>("/api/uploads", {
      method: "POST",
      body: { ...meta, filename: file.name, sizeBytes: file.size, rightsConfirmed: true },
    }),

  parts: (id, size) => api<UploadParts>(`/api/uploads/${id}/parts?size=${size}`),

  putPart: (token, data, onBytes, signal) =>
    new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/uploads/part?token=${encodeURIComponent(token)}`);
      xhr.setRequestHeader("X-CSRF-Token", getCsrf());
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onBytes(e.loaded);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let msg = `The upload failed (${xhr.status}).`;
        let code = "error";
        try {
          const j = JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } };
          msg = j.error?.message ?? msg;
          code = j.error?.code ?? code;
        } catch {
          /* not JSON */
        }
        reject(new ApiError(xhr.status, code, msg));
      };
      xhr.onerror = () => reject(new ApiError(0, "network", "The connection dropped during the upload."));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      signal?.addEventListener("abort", () => xhr.abort(), { once: true });
      xhr.send(data);
    }),

  complete: async (id) => {
    await api(`/uploads/${id}/complete`, { method: "POST" });
  },
};

export const uploadStatus = (id: string) => api<UploadItem>(`/uploads/${id}`);
export const cancelUpload = (id: string) => api(`/uploads/${id}`, { method: "DELETE" });
