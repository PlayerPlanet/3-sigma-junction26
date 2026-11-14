import type { ClientState } from "../state/store";

/** The robot you are driving: where it is, what it is doing, hand states, and what this station needs. */
export function ActivePanel({ state }: { state: ClientState }) {
  const { lab, snapshot, ui } = state;
  const pose = snapshot?.robots.find((r) => r.id === ui.activeRobot);
  if (!lab || !pose) return null;
  const label = lab.layout.robots.find((r) => r.id === pose.id)?.label ?? pose.id;
  const place = pose.station ? lab.places.find((p) => p.station === pose.station) : undefined;
  const station = lab.layout.stations.find((s) => s.id === pose.station);
  const control = place?.controls[ui.controlIdx % Math.max(1, place.controls.length)];
  const last = pose.last;
  const items = new Map(snapshot!.items.map((i) => [i.id, i]));
  const vessel = (id: string | null) => {
    const it = id ? items.get(id) : undefined;
    if (!it) return null;
    const mix = Object.entries(it.contents).map(([k, v]) => `${k} ${v}`).join(", ");
    return `${it.volume}/${it.capacity} u${mix ? ` (${mix})` : ""}, ${it.temp} °C`;
  };
  const eq = place ? snapshot!.equipment.find((e) => e.id === place.id) : undefined;
  const onPlace = place ? snapshot!.items.filter((i) => i.location.kind === "place" && i.location.place === place.id) : [];
  return (
    <div className="panel bottom-left">
      <div className="row">
        <strong>{label}</strong>
        <span className="muted">
          {pose.controller} · {pose.busy ?? "idle"}
          {pose.queued > 1 ? ` (+${pose.queued - 1} queued)` : ""} @ {station?.label ?? pose.node ?? "on the rail"}
        </span>
      </div>
      {last && last.status !== "ok" && (
        <div className="bad small">
          {last.type} {last.status}
          {last.reason ? `: ${last.reason}` : ""}
        </div>
      )}
      <table className="hands">
        <tbody>
          {pose.hands.map((h) => (
            <tr key={h.id} className={h.id === ui.hand ? "active" : ""}>
              <td>
                <kbd>{h.id === "a" ? "Q" : "E"}</kbd> hand {h.id.toUpperCase()}
              </td>
              <td>level {h.level}</td>
              <td>{Math.round(h.extend * 100)}%</td>
              <td>
                {h.holding ?? (h.gripping ? "closed" : "open")}
                {h.holding && <span className="muted"> {vessel(h.holding)}</span>}
              </td>
              <td className={h.spot ? "ok" : "muted"}>{h.spot === "work" ? "on spot" : h.spot === "pour" ? "pour spot" : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {place ? (
        <div className="small">
          <div>
            {place.name}: work level <b>{place.workLevel}</b> (pour {place.workLevel + 1}), reach <b>{place.reach}%</b>
            {place.capacity > 0 ? ` · holds ${place.capacity}` : ""}
          </div>
          {eq && Object.keys(eq.settings).length > 0 && (
            <div className="muted">
              {Object.entries(eq.settings)
                .map(([k, v]) => (k === "reagent" ? `reagent: ${lab.reagents[Number(v)] ?? v}` : `${k}: ${v}`))
                .join(" · ")}
              {eq.busyUntil !== null ? " · busy" : ""}
            </div>
          )}
          {onPlace.length > 0 && <div className="muted">here: {onPlace.map((i) => `${i.id} ${vessel(i.id)}`).join("; ")}</div>}
          {place.controls.length > 0 && (
            <div>
              controls:{" "}
              {place.controls.map((c) => (
                <span key={c} className={c === control ? "chip on" : "chip"}>
                  {c}
                </span>
              ))}{" "}
              <span className="muted">
                <kbd>C</kbd> cycle <kbd>X</kbd> press
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="muted small">Not at a station. Arrow keys drive along the rail; click a station label to go there.</div>
      )}
    </div>
  );
}
