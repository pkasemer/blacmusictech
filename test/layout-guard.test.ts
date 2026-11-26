// Guards against a layout bug that happened: focusing a hidden file input slid the whole app window up, hiding the
// toolbar and leaving blank space below. Hidden (screen-reader only) elements are absolutely positioned; without a
// positioned ancestor inside the scrolling page they stretch the window frame, and a box with overflow-hidden can
// still be scrolled by focus. (The behaviour itself needs a real browser; these checks keep the fix in place.)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

describe("app window layout", () => {
  const shell = src("components/Shell.tsx");

  it("clips the window frame so it can never be scrolled", () => {
    const frame = shell.split("\n").find((l) => l.includes("md:rounded-window"));
    expect(frame).toContain("overflow-clip");
    expect(frame).not.toContain("overflow-hidden");
  });

  it("makes the scrolling page the containing block for hidden elements, in both layouts", () => {
    const main = shell.split("\n").find((l) => l.includes("className={bleed ?"));
    const variants = main!.match(/"[^"]*"/g)!;
    expect(variants).toHaveLength(2);
    for (const v of variants) expect(v).toMatch(/\brelative\b/);
  });

  it("keeps hidden file inputs inside a positioned wrapper", () => {
    expect(src("components/TrackUploader.tsx")).toContain('cx("relative flex cursor-pointer');
    expect(src("components/CoverUpload.tsx").match(/relative flex flex-wrap/g)).toHaveLength(2);
  });

  it("lets the workspace panels contain their own hidden elements", () => {
    const ws = src("components/Workspace.tsx");
    expect(ws).toMatch(/aria-label="Canvas" className="[^"]*\brelative\b/);
    expect(ws).toMatch(/scroll-thin relative order-3/);
  });
});
