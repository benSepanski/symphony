import { useEffect, useState } from "react";
import type { ApiOrchestratorSettings, ApiPollingMode, ApiWorkflowSummary } from "./api.js";
import { patchSettings } from "./api.js";

interface Props {
  settings: ApiOrchestratorSettings | null;
  workflow: ApiWorkflowSummary | null;
  onSettingsChanged?: (next: ApiOrchestratorSettings) => void;
}

type SaveState =
  | { tag: "idle" }
  | { tag: "saving" }
  | { tag: "saved" }
  | { tag: "error"; message: string };

export function SettingsPanel({ settings, workflow, onSettingsChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(() => (settings ? toDraft(settings) : null));
  const [saveState, setSaveState] = useState<SaveState>({ tag: "idle" });

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [
    settings?.pollIntervalMs,
    settings?.maxConcurrentAgents,
    settings?.maxTurns,
    settings?.maxTurnsState,
    settings?.pollingMode,
  ]);

  if (!settings || !draft) {
    return (
      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <h2 className="text-sm font-medium text-slate-200 mb-2">Workflow settings</h2>
        <p className="text-xs text-slate-500">
          Settings editing is not available in this mode (e.g. replay).
        </p>
      </section>
    );
  }

  const currentDraft = draft;
  const dirty = isDirty(currentDraft, settings);

  async function apply(patch: Partial<ApiOrchestratorSettings>) {
    setSaveState({ tag: "saving" });
    try {
      const next = await patchSettings(patch);
      setSaveState({ tag: "saved" });
      onSettingsChanged?.(next);
      setTimeout(() => {
        setSaveState((s) => (s.tag === "saved" ? { tag: "idle" } : s));
      }, 1500);
    } catch (err) {
      setSaveState({ tag: "error", message: (err as Error).message });
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const parsedInterval = Number(currentDraft.pollIntervalMs);
    const parsedConcurrency = Number(currentDraft.maxConcurrentAgents);
    const parsedTurns = Number(currentDraft.maxTurns);
    if (!Number.isFinite(parsedInterval) || parsedInterval < 1000) {
      setSaveState({ tag: "error", message: "poll interval must be ≥ 1000 ms" });
      return;
    }
    if (!Number.isInteger(parsedConcurrency) || parsedConcurrency < 1) {
      setSaveState({ tag: "error", message: "max concurrent agents must be ≥ 1" });
      return;
    }
    if (!Number.isInteger(parsedTurns) || parsedTurns < 1) {
      setSaveState({ tag: "error", message: "max turns must be ≥ 1" });
      return;
    }
    if (currentDraft.maxTurnsState.trim().length === 0) {
      setSaveState({ tag: "error", message: "max turns state must not be empty" });
      return;
    }
    void apply({
      pollIntervalMs: Math.floor(parsedInterval),
      maxConcurrentAgents: parsedConcurrency,
      maxTurns: parsedTurns,
      maxTurnsState: currentDraft.maxTurnsState.trim(),
    });
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <header className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-medium text-slate-200">Workflow settings</h2>
          <p className="text-xs text-slate-500">
            Runtime-editable overrides of the values parsed from <code>WORKFLOW.md</code>. Changes
            apply immediately and do not persist across restarts.
          </p>
        </div>
        <ModeToggle
          mode={settings.pollingMode}
          disabled={saveState.tag === "saving"}
          onChange={(mode) => void apply({ pollingMode: mode })}
        />
      </header>

      <form onSubmit={save} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Poll interval (ms)" hint="Minimum 1000. Timer restarts on save.">
          <input
            type="number"
            min={1000}
            step={500}
            value={currentDraft.pollIntervalMs}
            onChange={(e) => setDraft({ ...currentDraft, pollIntervalMs: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </Field>
        <Field label="Max concurrent agents">
          <input
            type="number"
            min={1}
            step={1}
            value={currentDraft.maxConcurrentAgents}
            onChange={(e) => setDraft({ ...currentDraft, maxConcurrentAgents: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </Field>
        <Field label="Max turns">
          <input
            type="number"
            min={1}
            step={1}
            value={currentDraft.maxTurns}
            onChange={(e) => setDraft({ ...currentDraft, maxTurns: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </Field>
        <Field label="Max turns state" hint="Tracker state applied when an agent hits max_turns.">
          <input
            type="text"
            value={currentDraft.maxTurnsState}
            onChange={(e) => setDraft({ ...currentDraft, maxTurnsState: e.target.value })}
            className="w-full rounded border border-slate-700 bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:border-cyan-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          />
        </Field>

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || saveState.tag === "saving"}
            className="rounded bg-cyan-500/20 px-3 py-1 text-xs font-medium text-cyan-200 hover:bg-cyan-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saveState.tag === "saving" ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            disabled={!dirty || saveState.tag === "saving"}
            onClick={() => setDraft(toDraft(settings))}
            className="rounded text-xs text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset
          </button>
          {saveState.tag === "saved" && <span className="text-xs text-emerald-300">Saved.</span>}
          {saveState.tag === "error" && (
            <span className="text-xs text-rose-300">{saveState.message}</span>
          )}
        </div>
      </form>

      {workflow && <WorkflowReadOnly workflow={workflow} />}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-300">
      <span className="font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

function ModeToggle({
  mode,
  disabled,
  onChange,
}: {
  mode: ApiPollingMode;
  disabled: boolean;
  onChange: (mode: ApiPollingMode) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded border border-slate-700 p-0.5 text-xs">
      {(["auto", "manual"] as ApiPollingMode[]).map((m) => (
        <button
          key={m}
          type="button"
          disabled={disabled || mode === m}
          onClick={() => onChange(m)}
          className={`rounded px-2 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
            mode === m ? "bg-cyan-500/20 text-cyan-200" : "text-slate-400 hover:text-slate-200"
          } disabled:cursor-not-allowed`}
        >
          {m === "auto" ? "auto refresh" : "manual refresh"}
        </button>
      ))}
    </div>
  );
}

function WorkflowReadOnly({ workflow }: { workflow: ApiWorkflowSummary }) {
  return (
    <details className="mt-4 rounded border border-slate-800 bg-slate-950/40 p-3 text-xs text-slate-300">
      <summary className="cursor-pointer rounded text-slate-400 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
        Other workflow fields (read-only)
      </summary>
      <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
        <Row label="tracker.kind" value={workflow.tracker.kind} />
        <Row label="tracker.project_slug" value={workflow.tracker.projectSlug} mono />
        <Row label="tracker.active_states" value={workflow.tracker.activeStates.join(", ")} />
        <Row label="tracker.terminal_states" value={workflow.tracker.terminalStates.join(", ")} />
        <Row label="workspace.root" value={workflow.workspaceRoot} mono />
        <Row label="agent.kind" value={workflow.agentKind} />
        {workflow.claudeCode && (
          <>
            <Row label="claude_code.command" value={workflow.claudeCode.command ?? "—"} mono />
            <Row label="claude_code.model" value={workflow.claudeCode.model ?? "—"} mono />
            <Row
              label="claude_code.permission_mode"
              value={workflow.claudeCode.permissionMode ?? "—"}
              mono
            />
          </>
        )}
        {workflow.mock && (
          <>
            <Row label="mock.scenarios_dir" value={workflow.mock.scenariosDir} mono />
            <Row label="mock.assignment" value={workflow.mock.assignment} />
            <Row label="mock.default_scenario" value={workflow.mock.defaultScenario ?? "—"} mono />
          </>
        )}
        <Row label="prompt.source" value={workflow.promptSource} mono />
        <Row label="prompt.version" value={workflow.promptVersion} mono />
        <Row
          label="hooks"
          value={`after_create=${workflow.hooks.afterCreate ? "yes" : "no"}, before_remove=${workflow.hooks.beforeRemove ? "yes" : "no"}`}
        />
      </dl>
    </details>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <dt className="w-48 shrink-0 text-slate-500">{label}</dt>
      <dd className={`text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

interface Draft {
  pollIntervalMs: string;
  maxConcurrentAgents: string;
  maxTurns: string;
  maxTurnsState: string;
}

function toDraft(s: ApiOrchestratorSettings): Draft {
  return {
    pollIntervalMs: String(s.pollIntervalMs),
    maxConcurrentAgents: String(s.maxConcurrentAgents),
    maxTurns: String(s.maxTurns),
    maxTurnsState: s.maxTurnsState,
  };
}

function isDirty(draft: Draft, current: ApiOrchestratorSettings): boolean {
  return (
    Number(draft.pollIntervalMs) !== current.pollIntervalMs ||
    Number(draft.maxConcurrentAgents) !== current.maxConcurrentAgents ||
    Number(draft.maxTurns) !== current.maxTurns ||
    draft.maxTurnsState !== current.maxTurnsState
  );
}
