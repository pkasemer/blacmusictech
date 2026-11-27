"use client";

// Keeps a person from losing unsaved edits: asks before the tab closes, a link is followed, or a keyboard jump.

import { useEffect } from "react";

let dirty = false;

/** True when it is fine to leave: nothing unsaved, or the person chose to discard it. */
export function confirmLeave(): boolean {
  if (!dirty) return true;
  const leave = window.confirm("You have unsaved changes. Leave without saving them?");
  if (leave) dirty = false;
  return leave;
}

export function useUnsavedGuard(unsaved: boolean): void {
  useEffect(() => {
    dirty = unsaved;
    if (!unsaved) return;
    const beforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    // captured before the router sees it
    const click = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      if (!confirmLeave()) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      dirty = false;
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [unsaved]);
}
