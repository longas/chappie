// WebSocket constants between Bun server and browser UI.
// Single source of truth — used by both server.ts and store.ts.

// Channel
export const WS_CHANNEL = "main" as const;

// Server → Browser
export const WS_AGENTS = "agents" as const;
export const WS_HISTORY = "history" as const;
export const WS_HUMAN_REQUESTS = "human_requests" as const;
export const WS_RESPONSE = "response" as const;
export const WS_STATUS = "status" as const;
export const WS_INTER_AGENT = "inter-agent" as const;
export const WS_TURN_START = "turn_start" as const;
export const WS_THINKING = "thinking" as const;
export const WS_TOOL_USE = "tool_use" as const;
export const WS_TOOL_RESULT = "tool_result" as const;
export const WS_HUMAN_REQUEST = "human_request" as const;

// Browser → Server
export const WS_SEND = "send" as const;
export const WS_RESOLVE_HUMAN_REQUEST = "resolve_human_request" as const;
