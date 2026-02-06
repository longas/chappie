// Worker postMessage constants between orchestrator and agent workers.
// Single source of truth — used by both orchestrator.ts and worker.ts.

// Orchestrator → Worker
export const W_INIT = "init" as const;
export const W_PROCESS = "process" as const;
export const W_RESOLVE_HUMAN_REQUEST = "resolve_human_request" as const;

// Worker → Orchestrator
export const W_SEND = "send" as const;
export const W_TURN_START = "turn_start" as const;
export const W_DONE = "done" as const;
export const W_THINKING = "thinking" as const;
export const W_TOOL_USE = "tool_use" as const;
export const W_TOOL_RESULT = "tool_result" as const;
export const W_CRON_FIRE = "cron_fire" as const;
export const W_HUMAN_REQUEST = "human_request" as const;
