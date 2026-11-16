// The package's module in magpie's Bun plugin host. It serves no provider; it
// only keeps lib/bridge.mjs's loop running beside the agent row.
import { startBridge } from "./lib/bridge.mjs"

const instance = Symbol.for("magpie.piapp.bridge.v1")

export default async function PiApp(input) {
  if (process.env.MAGPIE_PIAPP_SKIP_BRIDGE === "1") return {}
  if (!globalThis[instance]) {
    const log = (message) => {
      try {
        void input?.client?.app?.log?.({ body: { service: "piapp", level: "info", message } })?.catch?.(() => {})
      } catch {
        // logging is best effort
      }
    }
    // The host is shared with other plugins: no signal handlers, no exit.
    globalThis[instance] = startBridge({ log })
  }
  return {}
}
