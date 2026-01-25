export type AgentLogPayload = {
  sessionId: string;
  runId: string;
  hypothesisId: string;
  location: string;
  message: string;
  data?: Record<string, unknown>;
  timestamp: number;
};

const AGENT_LOG_URL = process.env.NEXT_PUBLIC_AGENT_LOG_URL;

export function sendAgentLog(payload: AgentLogPayload) {
  if (!AGENT_LOG_URL) {
    return;
  }

  fetch(AGENT_LOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch(() => {});
}
