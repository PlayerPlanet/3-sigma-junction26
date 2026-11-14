import { KEY_HELP } from "../controllers/keyboard/keymap";
import { setUi } from "../state/store";

export function Help() {
  return (
    <div className="help-backdrop" onClick={() => setUi({ showHelp: false })}>
      <div className="panel help">
        <h2>Controls</h2>
        <table>
          <tbody>
            {KEY_HELP.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <kbd>{k}</kbd>
                </td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small">
          To work at a station: park there, raise the hand to the station's work level, extend to its reach (Shift+R) until the hand
          shows "on spot", then grip, release or press. Pour from one level higher. Retract hands before moving.
        </p>
      </div>
    </div>
  );
}
