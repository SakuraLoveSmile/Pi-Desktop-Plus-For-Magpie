// PI-Desktop keeps its model providers in a database only its own host process
// writes. What it does read from disk is a plugin folder: the manifest.json of a
// registered plugin is read again every time PI-Desktop starts. So the file
// magpie keeps for this row is such a manifest. It declares magpie's gateway as
// a provider, with every model magpie offers.
//
// The first model in it is named "Magpie". Its id is an alias,
// "piapp-selected": the package's gateway middleware sends a request for it as
// the model picked in this row, so the pick takes effect in PI-Desktop at once,
// without a restart. magpie's models follow it under their own names.
//
// This file runs in magpie's moejs sandbox: no imports from outside the
// package, no Node APIs, no timers.

export const PLUGIN_ID = "local.magpie-piapp"
export const PLUGIN_VERSION = "0.1.0"
export const ALIAS = "piapp-selected"
export const ALIAS_NAME = "Magpie"
// PI-Desktop refuses a plugin provider that declares more models than this.
export const MAX_MODELS = 64
// PI-Desktop's thinking levels. magpie's "none" is its "off"; magpie's "ultra"
// has no PI-Desktop level.
export const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

export const agent = {
  // "pi" and "pi-desktop" are ids magpie keeps for itself.
  id: "pidesktopformagpie",
  name: "Pi Desktop For Magpie",
  // PI-Desktop's own app icon, 96px.
  icon: "data:image/png;base64,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",
  // The folder that lists the row. PI-Desktop's data can be moved anywhere
  // (its Settings > System > Storage), so no folder of its own says it is
  // installed; this one is made by lib/bridge.mjs when the package loads.
  dir: "~/.config/magpie-piapp",
  config: "~/.config/magpie-piapp/plugin/manifest.json",
  format: "json",
  // A top-level key PI-Desktop ignores; lib/bridge.mjs reads it for the alias.
  model: "magpieModel",
  // An Effort field on the row. The gateway applies it to the requests it
  // knows as this agent's (see agentUrl); with none set, the thinking level
  // picked in the PI-Desktop chat goes through as it is.
  effort: true,
  wsl: false,
  library: {
    // PI-Desktop appends this file to its system prompt. magpie's built-in Pi
    // row writes AGENTS.md / CLAUDE.md in the same folder, so the two rows do
    // not share a file.
    instructions: "~/.pi/agent/APPEND_SYSTEM.md",
    // PI-Desktop does not read this file. lib/bridge.mjs turns it into the
    // one-file-per-server form PI-Desktop reads from ~/.agents/servers.
    mcp: "~/.config/magpie-piapp/mcp.json",
    mcpFormat: "claude",
    skills: "~/.agents/skills",
  },
  notice:
    "已生效，PI-Desktop 不用重启：在它里面选「Magpie」就是这里选的模型。",
}

// The level a chat starts on: "high" when the model has it, else the nearest
// level above, else the nearest below.
export function defaultLevel(levels) {
  const at = LEVELS.indexOf("high")
  for (let i = at; i < LEVELS.length; i++) if (levels.indexOf(LEVELS[i]) >= 0) return LEVELS[i]
  for (let i = at - 1; i >= 0; i--) if (levels.indexOf(LEVELS[i]) >= 0) return LEVELS[i]
  return undefined
}

// One of magpie's models as a PI-Desktop manifest declares it.
export function modelEntry(model) {
  const entry = { id: model.id, name: model.name || model.id }
  if (model.context > 0) entry.contextWindow = model.context
  if (model.output > 0) entry.maxTokens = model.context > 0 ? Math.min(model.output, model.context) : model.output
  if (model.images === true) entry.supportsImages = true
  const efforts = Array.isArray(model.efforts) ? model.efforts : []
  const levels = []
  for (let i = 0; i < LEVELS.length; i++) {
    if (efforts.indexOf(LEVELS[i] === "off" ? "none" : LEVELS[i]) >= 0) levels.push(LEVELS[i])
  }
  if (levels.length > 0) {
    entry.thinkingLevels = levels
    entry.defaultThinkingLevel = defaultLevel(levels)
  }
  return entry
}

// magpie names a model "GLM-5.3-Flash · 70$": the part before " · " is the
// model's own name.
export function shortName(name) {
  const at = String(name).indexOf(" · ")
  return at > 0 ? String(name).slice(0, at) : String(name)
}

export function declaredModels(models) {
  const seen = {}
  const out = []
  for (const model of models || []) {
    if (!model || typeof model.id !== "string" || !model.id || model.id === ALIAS || seen[model.id]) continue
    seen[model.id] = true
    out.push(modelEntry(model))
  }
  return out
}

// PI-Desktop sends no key, and its User-Agent, "pi/…", is the one magpie's
// built-in Pi row has. Under this address the gateway takes a request as this
// agent's whatever it carries, so Usage lists it as Pi Desktop For Magpie and the row's
// effort applies. (Measured on magpie 0.1.4173.)
export function agentUrl(gateway) {
  let url = String(gateway.url)
  while (url.charAt(url.length - 1) === "/") url = url.slice(0, url.length - 1)
  return url + "/agent/" + agent.id + "/v1"
}

// The provider cards: "magpie" first, then "magpie-2", … of at most 64 models.
export function providers(baseUrl, entries) {
  const out = []
  for (let i = 0; i === 0 || i * MAX_MODELS < entries.length; i++) {
    out.push({
      id: i ? "magpie-" + (i + 1) : "magpie",
      name: i ? "Magpie " + (i + 1) : "Magpie",
      baseUrl,
      apiStyle: "chat_completions",
      // The gateway on this computer serves requests without a key, so nothing
      // has to be typed into PI-Desktop.
      authKind: "none",
      models: entries.slice(i * MAX_MODELS, (i + 1) * MAX_MODELS),
    })
  }
  return out
}

// Every top-level key of the manifest. Objects and arrays are returned whole.
// Switching the row off takes all of them out again.
export function connect({ gateway, model, models }) {
  const entries = declaredModels(models)
  if (model && typeof model.id === "string" && model.id) {
    let picked = null
    for (const entry of entries) if (entry.id === model.id) picked = entry
    if (!picked) picked = modelEntry(model)
    // First comes the alias, named "Magpie": whatever this row is on. It
    // carries the picked model's limits, which PI-Desktop reads when it
    // starts; the model behind it changes at once. After it come magpie's
    // models by name, for a chat that should stay on one of them whatever the
    // row says. Picking one in PI-Desktop does not change the row.
    entries.unshift(Object.assign({}, picked, { id: ALIAS, name: ALIAS_NAME }))
  }
  const manifest = restingManifest()
  manifest.description =
    "本机 Magpie 网关提供的模型，由 Magpie 的 Pi Desktop For Magpie 一行维护。 Models from the Magpie gateway on this computer, kept by magpie's Pi Desktop For Magpie row."
  manifest.contributes = { providers: providers(agentUrl(gateway), entries) }
  manifest.magpie = { url: gateway.url, v1: agentUrl(gateway), alias: ALIAS }
  return manifest
}

// The manifest while the row is off: a valid plugin that declares no provider,
// so PI-Desktop drops the Magpie cards the next time it starts. lib/bridge.mjs
// puts it in place before the first connect. Switching the row off, or
// removing this package from magpie, makes magpie put every key back as it
// found it, which is then this, with no code of this package running.
export function restingManifest() {
  return {
    schemaVersion: 1,
    id: PLUGIN_ID,
    name: "Magpie",
    version: PLUGIN_VERSION,
    description:
      "已在 Magpie 里断开，现在不提供模型；不再使用时可以在这里卸载。 Disconnected in magpie: it provides no models now, and can be uninstalled here when it is no longer wanted.",
    author: "pi-desktop-for-magpie",
    // PI-Desktop wants an entry file. A JSON file loads as a module with no
    // hooks, so the folder needs no second file and runs no code.
    main: "manifest.json",
    contributes: { providers: [] },
    permissions: ["provider.register"],
    engines: { piDesktop: ">=0.22.0" },
  }
}
