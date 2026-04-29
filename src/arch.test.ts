import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Encodes golden-principle #1 ("Layer direction is forward-only") from
// docs/design-docs/golden-principles.md, using the layer map in
// ARCHITECTURE.md. A file in a later layer may import from any earlier
// layer; earlier layers must not import from later layers.
//
// Tests and eval scripts are excluded — they are the consumers of every
// layer and are not shipped as production code.

const SRC_ROOT = resolve(process.cwd(), "src");

const LAYERS = [
  "Types",
  "Config",
  "Persistence",
  "Service",
  "Runtime",
  "API/Web",
  "Entry",
] as const;
type Layer = (typeof LAYERS)[number];

const SERVICE_DIRS = ["tracker", "agent", "workspace", "usage", "self-update"];

function layerOf(fileAbs: string): Layer {
  const rel = relative(SRC_ROOT, fileAbs).split("\\").join("/");
  if (rel === "cli.ts") return "Entry";
  if (rel.startsWith("api/") || rel.startsWith("web/")) return "API/Web";
  if (
    rel === "orchestrator.ts" ||
    rel === "replay.ts" ||
    rel === "index.ts" ||
    rel.startsWith("eval/")
  ) {
    return "Runtime";
  }
  for (const svc of SERVICE_DIRS) {
    if (rel === `${svc}/types.ts`) return "Types";
    if (rel.startsWith(`${svc}/`)) return "Service";
  }
  if (rel.startsWith("persistence/")) return "Persistence";
  if (rel.startsWith("config/")) return "Config";
  throw new Error(`arch.test: unclassified source file ${rel}`);
}

function rank(layer: Layer): number {
  return LAYERS.indexOf(layer);
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

function isProductionSource(file: string): boolean {
  if (!/\.(ts|tsx)$/.test(file)) return false;
  if (/\.test\.(ts|tsx)$/.test(file)) return false;
  if (/\.eval\.(ts|tsx)$/.test(file)) return false;
  if (/\.d\.ts$/.test(file)) return false;
  return true;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\b[^;]*?["']([^"']+)["']/g;

function extractSpecs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(IMPORT_RE)) out.push(m[1]);
  return out;
}

function resolveSpec(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(fromFile), spec);
  const withoutJs = base.replace(/\.js$/, "");
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${withoutJs}.ts`,
    `${withoutJs}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      // not found — try the next candidate
    }
  }
  return null;
}

describe("architecture: layer direction is forward-only", () => {
  it("no production module imports from a later layer", () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (!isProductionSource(file)) continue;
      const src = readFileSync(file, "utf8");
      const from = layerOf(file);
      for (const spec of extractSpecs(src)) {
        const target = resolveSpec(file, spec);
        if (!target) continue;
        const to = layerOf(target);
        if (rank(to) > rank(from)) {
          const fromRel = relative(SRC_ROOT, file);
          const toRel = relative(SRC_ROOT, target);
          violations.push(`  ${fromRel} (${from}) → ${toRel} (${to})`);
        }
      }
    }
    expect(
      violations,
      violations.length === 0
        ? ""
        : `forbidden cross-layer imports (see ARCHITECTURE.md):\n${violations.join("\n")}`,
    ).toEqual([]);
  });
});
