import { useEffect } from "react";
import { sendAction } from "../../net/socket";
import { cameraForward } from "../../state/interpolate";
import { getState, setUi, toast } from "../../state/store";
import { handleKey } from "./keymap";

const intents = new Map<string, { level: number; extend: number }>();

/** Wires keyboard teleoperation to the socket. All rules stay in the sim; this only sends actions. */
export function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const { lab, snapshot, ui } = getState();
      if (!lab || !snapshot) return;
      const res = handleKey({ code: e.code, shift: e.shiftKey }, { lab, snapshot, ui, forward: cameraForward, intents });
      if (res.action || res.ui || res.toast) e.preventDefault();
      if (res.ui) setUi(res.ui);
      if (res.intent) intents.set(res.intent.key, { level: res.intent.level, extend: res.intent.extend });
      if (res.action && !sendAction(res.action)) toast("Not connected");
      else if (res.toast) toast(res.toast);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
