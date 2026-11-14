import { ServerMessage, type Action, type ClientMessage } from "@lab-rats/shared";

export type ConnectionStatus = "connecting" | "open" | "closed";

let current: WebSocket | null = null;

/** Sends an action to the server (always as the human actor). Returns false if not connected. */
export function sendAction(action: Action, requestId?: string): boolean {
  if (!current || current.readyState !== WebSocket.OPEN) return false;
  const msg: ClientMessage = { type: "action", action, ...(requestId ? { requestId } : {}) };
  current.send(JSON.stringify(msg));
  return true;
}

/** Connects to the server WebSocket and reconnects on drop. Returns a disconnect function. */
export function connect(
  onMessage: (msg: ServerMessage) => void,
  onStatus: (status: ConnectionStatus) => void,
): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    ws = new WebSocket(`${proto}://${location.host}/ws`);
    const self = ws;
    ws.onopen = () => {
      current = self;
      onStatus("open");
    };
    ws.onmessage = (ev) => {
      const parsed = ServerMessage.safeParse(JSON.parse(String(ev.data)));
      if (parsed.success) onMessage(parsed.data);
      else console.warn("unknown server message", ev.data);
    };
    ws.onclose = () => {
      if (current === self) current = null;
      onStatus("closed");
      if (!stopped) retry = setTimeout(open, 1000);
    };
  };
  open();

  return () => {
    stopped = true;
    clearTimeout(retry);
    if (!ws) return;
    ws.onclose = null;
    ws.onmessage = null;
    // Closing a socket that is still connecting logs a browser warning; close it once it opens instead.
    if (ws.readyState === WebSocket.CONNECTING) ws.onopen = () => ws?.close();
    else ws.close();
  };
}
