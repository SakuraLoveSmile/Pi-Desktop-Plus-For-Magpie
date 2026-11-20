// Gateway middleware (moejs, inside magpie). Pi-Desktop-Plus asks for the alias
// "piplus-selected"; the request goes on as the model picked for Pi Desktop Plus
// For Magpie on magpie's Agents page. selected.js is rewritten by lib/bridge.mjs
// when the pick changes, and magpie reloads this module when a file of it
// changes.
import { selected } from "./selected.js"

const ALIAS = "piplus-selected"
// Asking for this model costs nothing: it is refused with the current pick and
// the agent the gateway takes the request for, which is how the setup is
// checked (see README).
const PROBE = "piplus-probe"

export function onRequest(body, ctx) {
  if (!body || typeof body.model !== "string") return
  if (body.model === PROBE) {
    return ctx.reject(418, "piplus selected=" + (selected || "(none)") + " agent=" + (ctx.agent || "(unknown)"))
  }
  if (body.model !== ALIAS) return
  if (!selected) {
    return ctx.reject(409, "还没有给 Pi Desktop Plus For Magpie 选模型：在 Magpie 的 Agent 页给它选一个。 No model is picked for Pi Desktop Plus For Magpie on magpie's Agents page.")
  }
  body.model = selected
  return body
}