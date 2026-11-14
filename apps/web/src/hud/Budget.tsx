import { useEffect, useState } from "react";
import type { Snapshot } from "@lab-rats/shared";
import { sendAction } from "../net/socket";
import { toast, type ClientState } from "../state/store";

const clock = (ticks: number) => {
  const s = Math.max(0, Math.floor(ticks / 10));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

interface ScenarioInfo {
  id: string;
  type: string;
  title: string;
}
interface LeaderboardRow {
  player: string;
  best: number;
  runs: number;
}

const PLAYER_KEY = "labrats.player";
const savedPlayer = () => {
  try {
    return localStorage.getItem(PLAYER_KEY) ?? "";
  } catch {
    return "";
  }
};

async function getJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(url);
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Buttons must not keep focus: Space would click them again instead of gripping. */
const blur = (e: React.MouseEvent<HTMLButtonElement>) => e.currentTarget.blur();

/** Start a new session: scenario, and the player name it is recorded under. */
function NewRun({ current }: { current: string | null }) {
  const [scenarios, setScenarios] = useState<ScenarioInfo[]>([]);
  const [scenario, setScenario] = useState(current ?? "soap_order");
  const [player, setPlayer] = useState(savedPlayer);
  useEffect(() => {
    void getJson<ScenarioInfo[]>("/api/scenarios", []).then(setScenarios);
  }, []);
  const start = async (e: React.MouseEvent<HTMLButtonElement>) => {
    blur(e);
    const name = player.trim();
    try {
      localStorage.setItem(PLAYER_KEY, name);
    } catch {
      /* private mode: the name just is not remembered */
    }
    const body = { scenario: scenario === "none" ? null : scenario, ...(name ? { player: name } : {}) };
    const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) toast(`Could not start: ${((await res.json()) as { reason?: string }).reason ?? res.status}`);
  };
  return (
    <div className="newrun">
      <select value={scenario} onChange={(e) => setScenario(e.target.value)} aria-label="Scenario">
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title}
          </option>
        ))}
        <option value="none">Sandbox (no goal)</option>
      </select>
      <input value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Your name" maxLength={40} aria-label="Player name" />
      <button onClick={start}>Start</button>
    </div>
  );
}

function Leaderboard({ scenario, refreshKey }: { scenario: string; refreshKey: string }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  useEffect(() => {
    void getJson<LeaderboardRow[]>(`/api/leaderboard?scenario=${encodeURIComponent(scenario)}&limit=5`, []).then(setRows);
  }, [scenario, refreshKey]);
  if (!rows.length) return null;
  return (
    <div className="small leaderboard">
      <span className="muted">Best scores</span>
      <ol>
        {rows.map((r) => (
          <li key={r.player}>
            {r.player} <b>{r.best}</b> <span className="muted">({r.runs} {r.runs === 1 ? "run" : "runs"})</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Ends the session: pick the product vessel (order) or enter the answer (research). */
function CommitForm({ snap, research }: { snap: Snapshot; research: boolean }) {
  const vessels = snap.items.filter((i) => i.location.kind !== "waste");
  const fullest = [...vessels].sort((a, b) => b.volume - a.volume)[0];
  const [item, setItem] = useState("");
  const [share, setShare] = useState("");
  const [temp, setTemp] = useState("");
  const chosen = item || fullest?.id || "";
  const commit = (e: React.MouseEvent<HTMLButtonElement>) => {
    blur(e);
    const result = research ? { answer: { add_share: Number(share), temp: Number(temp) } } : { item: chosen };
    if (research && (share === "" || temp === "" || !Number.isInteger(Number(share)) || !Number.isInteger(Number(temp)))) return toast("Enter whole numbers for both");
    if (!window.confirm(research ? `Commit ${share}% at ${temp} °C? This ends the session.` : `Commit ${chosen}? This ends the session.`)) return;
    if (!sendAction({ type: "commit", result })) toast("Not connected");
  };
  return (
    <div className="commit small">
      {research ? (
        <>
          <label>
            lye share <input type="number" min={0} max={100} step={1} value={share} onChange={(e) => setShare(e.target.value)} /> %
          </label>
          <label>
            temperature <input type="number" min={0} max={200} step={1} value={temp} onChange={(e) => setTemp(e.target.value)} /> °C
          </label>
        </>
      ) : (
        <label>
          product vessel{" "}
          <select value={chosen} onChange={(e) => setItem(e.target.value)}>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id} ({v.volume} u)
              </option>
            ))}
          </select>
        </label>
      )}
      <button onClick={commit}>{research ? "Commit answer" : "Commit vessel"}</button>
    </div>
  );
}

/** The scenario (goal, budget left), the commit form, and the result and leaderboard once it is over. */
export function Budget({ state }: { state: ClientState }) {
  const [open, setOpen] = useState(true);
  const { snapshot: snap, lab } = state;
  if (!snap || !lab) return null;
  const sc = lab.scenario;
  const s = snap.session;
  if (!sc || !s) {
    return (
      <div className="panel top-center">
        <div className="budget">
          <span className="muted">sandbox</span>
          <span>
            <span className="muted">time</span> <b>{clock(snap.tick)}</b>
          </span>
          <span>
            <span className="muted">reagents</span> <b>{snap.reagentsUsed} u</b>
          </span>
        </div>
        <NewRun current={null} />
      </div>
    );
  }
  const research = sc.type === "research";
  return (
    <div className="panel top-center">
      <div className="row">
        <strong>{sc.title}</strong>
        <span className="muted">{sc.type === "order" ? `target ≥ ${sc.targetYield}% yield` : "commit your best answer"}</span>
        <button
          className="link"
          onClick={(e) => {
            blur(e);
            setOpen(!open);
          }}
        >
          {open ? "hide" : "brief"}
        </button>
      </div>
      {open && <div className="small brief">{sc.brief}</div>}
      {open && lab.pathway && <div className="small muted brief">{lab.pathway.summary}</div>}
      <div className="budget">
        <span>
          <span className="muted">time left</span> <b className={s.ticksLeft < 600 ? "bad" : ""}>{clock(s.ticksLeft)}</b>
        </span>
        <span>
          <span className="muted">reagents left</span> <b className={s.reagentsLeft < 0 ? "bad" : ""}>{s.reagentsLeft} u</b>
        </span>
        {s.analysesLeft !== null && (
          <span>
            <span className="muted">analyzer runs left</span> <b className={s.analysesLeft === 0 ? "bad" : ""}>{s.analysesLeft}</b>
          </span>
        )}
        <span>
          <span className="muted">waste</span> <b className={snap.waste ? "bad" : ""}>{snap.waste} u</b>
        </span>
      </div>
      {s.status === "running" ? (
        <CommitForm snap={snap} research={research} />
      ) : (
        <div className="result">
          <div>
            {s.status === "timeout"
              ? "Time is up."
              : research && s.answer
                ? `You answered ${s.answer.add_share}% at ${s.answer.temp} °C.`
                : `Committed ${s.committedItem}: true yield ${s.trueYield}%.`}{" "}
            {s.truth && `The best conditions were ${s.truth.add_share}% at ${s.truth.temp} °C. `}
            Score <b>{s.score}/100</b>
          </div>
          <Leaderboard scenario={sc.id} refreshKey={`${s.status}:${s.score}`} />
          <NewRun current={sc.id} />
        </div>
      )}
    </div>
  );
}
