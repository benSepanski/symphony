import type { ApiOrchestratorState } from "./api.js";

export interface PollStatusPill {
  label: string;
  className: string;
  title?: string;
}

type PollStatusInput = Pick<ApiOrchestratorState, "pollingMode" | "polling">;

// The pill sits next to the poll interval and calls out any non-nominal
// polling state. Auto + polling is the healthy default and needs no pill.
// Manual mode is a user choice (amber = intentional, non-error). Auto +
// !polling can only happen while the orchestrator is shutting down or
// before start() — never in normal live-dashboard operation. See BEN-138
// for why the previous rose "paused" label was misleading.
export function pollStatusPill(state: PollStatusInput): PollStatusPill | null {
  if (state.pollingMode === "manual") {
    return { label: "manual", className: "text-amber-300" };
  }
  if (!state.polling) {
    return {
      label: "shutting down",
      className: "text-amber-300",
      title: "The orchestrator is stopping; the live stream will disconnect shortly.",
    };
  }
  return null;
}
