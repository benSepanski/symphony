import { useEffect, useState } from "react";
import type { ApiOrchestratorSettings, ApiPollingMode, ApiWorkflowSummary } from "./api.js";
import { patchSettings } from "./api.js";
import {
  countDirtyFields,
  formatSettingsSnapshot,
  settingsPanelInitialOpen,
  validateDraft,
  type SettingsDraft,
  type SettingsField,
} from "./settingsPanelUtils.js";

const RESET_CONFIRM_MS = 3000;

interface Props {
  settings: ApiOrchestratorSettings | null;
  workflow: ApiWorkflowSummary | null;
  onSettingsChanged?: (next: ApiOrchestratorSettings) => void;
}

type SaveState =
  | { tag: "idle" }
  | { tag: "saving" }
  | { tag: "saved" }
  | { tag: "error"; field?: SettingsField; message: string };

const FIELD_ERROR_ID: Record<SettingsField, string> = {
  pollIntervalMs: "settings-pollIntervalMs-err",
  maxConcurrentAgents: "settings-maxConcurrentAgents-err",
  maxTurns: "settings-maxTurns-err",
  maxTurnsState: "settings-maxTurnsState-err",
};

const INPUT_BASE =
  "w-full rounded border bg-slate-950/60 px-2 py-1 font-mono text-sm text-slate-100 focus:outline-none focus-visible:ring-2";
const INPUT_OK = "border-slate-700 focus:border-cyan-500 focus-visible:ring-cyan-500";
const INPUT_ERR =
  "border-rose-500 ring-1 ring-rose-500/40 focus:border-rose-500 focus-visible:ring-rose-500";

function inputClass(hasError: boolean): string {
  return `${INPUT_BASE} ${hasError ? INPUT_ERR : INPUT_OK}`;
}

export function SettingsPanel({ settings, workflow, onSettingsChanged }: Props) {
  const [draft, setDraft] = useState<SettingsDraft | null>(() =>
    settings ? toDraft(settings) : null,
  );
  const [saveState, setSaveState] = useState<SaveState>({ tag: "idle" });
  const [resetConfirm, setResetConfirm] = useState<boolean>(false);
  const [open, setOpen] = useState<boolean>(() =>
    settings && draft ? settingsPanelInitialOpen(isDirty(draft, settings), "idle") : false,
  );

  useEffect(() => {
    if (settings) setDraft(toDraft(settings));
  }, [
    settings?.pollIntervalMs,
    settings?.maxConcurrentAgents,
    settings?.maxTurns,
    settings?.maxTurnsState,
    settings?.pollingMode,
  ]);

  const dirtyForEffect = settings && draft ? isDirty(draft, settings) : false;
  const errored = saveState.tag === "error";
  useEffect(() => {
    if (dirtyForEffect || errored) setOpen(true);
  }, [dirtyForEffect, errored]);

  useEffect(() => {
    if (!dirtyForEffect) setResetConfirm(false);
  }, [dirtyForEffect]);

  useEffect(() => {
    if (!resetConfirm) return;
    const timer = window.setTimeout(() => setResetConfirm(false), RESET_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [resetConfirm]);

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
  const dirtyFieldCount = countDirtyFields(currentDraft, settings);
  const snapshot = formatSettingsSnapshot(settings);
  const fieldError = (field: SettingsField): string | undefined =>
    saveState.tag === "error" && saveState.field === field ? saveState.message : undefined;
  const nonFieldError =
    saveState.tag === "error" && saveState.field === undefined ? saveState.message : undefined;

  function clearFieldError(field: SettingsField) {
    setSaveState((s) => (s.tag === "error" && s.field === field ? { tag: "idle" } : s));
  }

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
    const result = validateDraft(currentDraft);
    if (!result.ok) {
      setSaveState({ tag: "error", field: result.field, message: result.message });
      return;
    }
    void apply(result.values);
  }

  const pollErr = fieldError("pollIntervalMs");
  const concurrencyErr = fieldError("maxConcurrentAgents");
  const turnsErr = fieldError("maxTurns");
  const turnsStateErr = fieldError("maxTurnsState");

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900/40">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className="group">
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-2 gap-y-1 rounded-lg p-4 text-sm text-slate-300 hover:bg-slate-900/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500">
          <span
            aria-hidden="true"
            className="text-slate-500 transition-transform group-open:rotate-90"
          >
            ▸
          </span>
          <h2 className="font-medium text-slate-200">Workflow settings</h2>
          <span className="text-slate-500">·</span>
          <span className="text-xs text-slate-400">{snapshot}</span>
          {dirty && (
            <span className="ml-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-300">
              unsaved
            </span>
          )}
          {saveState.tag === "error" && (
            <span className="ml-1 rounded bg-rose-500/10 px-1.5 py-0.5 text-[11px] font-medium text-rose-300">
              error
            </span>
          )}
        </summary>
        <div className="px-4 pb-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <p className="text-xs text-slate-500 max-w-prose">
              Runtime-editable overrides of the values parsed from <code>WORKFLOW.md</code>. Changes
              apply immediately and do not persist across restarts.
            </p>
            <ModeToggle
              mode={settings.pollingMode}
              disabled={saveState.tag === "saving"}
              onChange={(mode) => void apply({ pollingMode: mode })}
            />
          </div>

          <form onSubmit={save} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field
              label="Poll interval (ms)"
              hint="Minimum 1000. Timer restarts on save."
              error={pollErr}
              errorId={FIELD_ERROR_ID.pollIntervalMs}
            >
              <input
                type="number"
                min={1000}
                step={500}
                value={currentDraft.pollIntervalMs}
                onChange={(e) => {
                  setDraft({ ...currentDraft, pollIntervalMs: e.target.value });
                  clearFieldError("pollIntervalMs");
                }}
                aria-invalid={pollErr ? true : undefined}
                aria-describedby={pollErr ? FIELD_ERROR_ID.pollIntervalMs : undefined}
                className={inputClass(Boolean(pollErr))}
              />
            </Field>
            <Field
              label="Max concurrent agents"
              error={concurrencyErr}
              errorId={FIELD_ERROR_ID.maxConcurrentAgents}
            >
              <input
                type="number"
                min={1}
                step={1}
                value={currentDraft.maxConcurrentAgents}
                onChange={(e) => {
                  setDraft({ ...currentDraft, maxConcurrentAgents: e.target.value });
                  clearFieldError("maxConcurrentAgents");
                }}
                aria-invalid={concurrencyErr ? true : undefined}
                aria-describedby={concurrencyErr ? FIELD_ERROR_ID.maxConcurrentAgents : undefined}
                className={inputClass(Boolean(concurrencyErr))}
              />
            </Field>
            <Field label="Max turns" error={turnsErr} errorId={FIELD_ERROR_ID.maxTurns}>
              <input
                type="number"
                min={1}
                step={1}
                value={currentDraft.maxTurns}
                onChange={(e) => {
                  setDraft({ ...currentDraft, maxTurns: e.target.value });
                  clearFieldError("maxTurns");
                }}
                aria-invalid={turnsErr ? true : undefined}
                aria-describedby={turnsErr ? FIELD_ERROR_ID.maxTurns : undefined}
                className={inputClass(Boolean(turnsErr))}
              />
            </Field>
            <Field
              label="Max turns state"
              hint="Tracker state applied when an agent hits max_turns."
              error={turnsStateErr}
              errorId={FIELD_ERROR_ID.maxTurnsState}
            >
              <input
                type="text"
                value={currentDraft.maxTurnsState}
                onChange={(e) => {
                  setDraft({ ...currentDraft, maxTurnsState: e.target.value });
                  clearFieldError("maxTurnsState");
                }}
                aria-invalid={turnsStateErr ? true : undefined}
                aria-describedby={turnsStateErr ? FIELD_ERROR_ID.maxTurnsState : undefined}
                className={inputClass(Boolean(turnsStateErr))}
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
                onClick={() => {
                  if (!resetConfirm) {
                    setResetConfirm(true);
                    return;
                  }
                  setDraft(toDraft(settings));
                  setSaveState((s) => (s.tag === "error" ? { tag: "idle" } : s));
                  setResetConfirm(false);
                }}
                aria-live="polite"
                className={`rounded text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-40 ${
                  resetConfirm && dirty
                    ? "bg-amber-500/15 px-2 py-1 font-medium text-amber-200 hover:bg-amber-500/25"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {resetConfirm && dirty
                  ? `Click again to discard ${dirtyFieldCount} unsaved field${dirtyFieldCount === 1 ? "" : "s"}`
                  : "Reset"}
              </button>
              {saveState.tag === "saved" && (
                <span className="text-xs text-emerald-300">Saved.</span>
              )}
              {nonFieldError && <span className="text-xs text-rose-300">{nonFieldError}</span>}
            </div>
          </form>

          {workflow && <WorkflowReadOnly workflow={workflow} />}
        </div>
      </details>
    </section>
  );
}

function Field({
  label,
  hint,
  error,
  errorId,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-300">
      <span className="font-medium text-slate-300">{label}</span>
      {children}
      {error ? (
        <span id={errorId} role="alert" className="text-[11px] text-rose-300">
          {error}
        </span>
      ) : (
        hint && <span className="text-[11px] text-slate-500">{hint}</span>
      )}
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

function toDraft(s: ApiOrchestratorSettings): SettingsDraft {
  return {
    pollIntervalMs: String(s.pollIntervalMs),
    maxConcurrentAgents: String(s.maxConcurrentAgents),
    maxTurns: String(s.maxTurns),
    maxTurnsState: s.maxTurnsState,
  };
}

function isDirty(draft: SettingsDraft, current: ApiOrchestratorSettings): boolean {
  return (
    Number(draft.pollIntervalMs) !== current.pollIntervalMs ||
    Number(draft.maxConcurrentAgents) !== current.maxConcurrentAgents ||
    Number(draft.maxTurns) !== current.maxTurns ||
    draft.maxTurnsState !== current.maxTurnsState
  );
}
