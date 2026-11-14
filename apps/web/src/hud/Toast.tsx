import { useEffect, useState } from "react";
import type { ClientState } from "../state/store";

const SHOW_MS = 3500;

export function Toast({ state }: { state: ClientState }) {
  const t = state.ui.toast;
  const [, force] = useState(0);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => force((n) => n + 1), SHOW_MS);
    return () => clearTimeout(id);
  }, [t]);
  if (!t || performance.now() - t.at > SHOW_MS) return null;
  return <div className="toast">{t.text}</div>;
}
