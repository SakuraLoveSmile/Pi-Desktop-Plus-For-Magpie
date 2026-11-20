// Pi-Desktop-Plus keeps its model providers in a database only its own host
// process writes. What it does read from disk is a plugin folder: the
// manifest.json of a registered plugin is read again every time Pi-Desktop-Plus
// starts. So the file magpie keeps for this row is such a manifest. It declares
// magpie's gateway as a provider, with every model magpie offers.
//
// The first model in it is named "Magpie". Its id is an alias,
// "piplus-selected": the package's gateway middleware sends a request for it as
// the model picked in this row, so the pick takes effect in Pi-Desktop-Plus at
// once, without a restart. magpie's models follow it under their own names.
//
// This file runs in magpie's moejs sandbox: no imports from outside the
// package, no Node APIs, no timers.

export const PLUGIN_ID = "local.magpie-piplus"
export const PLUGIN_VERSION = "0.1.0"
export const ALIAS = "piplus-selected"
export const ALIAS_NAME = "Magpie"
// Pi-Desktop-Plus refuses a plugin provider that declares more models than this.
export const MAX_MODELS = 64
// …and a plugin that declares more provider cards than this, so at most
// MAX_PROVIDERS * MAX_MODELS models reach it; the alias is always on the first
// card, so the picked model survives the cut.
export const MAX_PROVIDERS = 8
// Pi-Desktop-Plus's thinking levels. magpie's "none" is its "off"; magpie's
// "ultra" has no Pi-Desktop-Plus level.
export const LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"]

export const agent = {
  // "pi" and "pi-desktop" are ids magpie keeps for itself.
  id: "pidesktopplusformagpie",
  name: "Pi Desktop Plus For Magpie",
  // Pi-Desktop-Plus's own app icon, 96px.
  icon: "data:image/png;base64,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",
  // The folder that lists the row. Pi-Desktop-Plus's data can be moved anywhere
  // (its Settings > System > Storage), so no folder of its own says it is
  // installed; this one is made by lib/bridge.mjs when the package loads. It is
  // not the PI-Desktop plugin's folder: both rows can be installed at once.
  dir: "~/.config/magpie-piplus",
  config: "~/.config/magpie-piplus/plugin/manifest.json",
  format: "json",
  // A top-level key Pi-Desktop-Plus ignores; lib/bridge.mjs reads it for the alias.
  model: "magpieModel",
  // An Effort field on the row. The gateway applies it to the requests it
  // knows as this agent's (see agentUrl); with none set, the thinking level
  // picked in the Pi-Desktop-Plus chat goes through as it is.
  effort: true,
  wsl: false,
  library: {
    // Pi-Desktop-Plus appends this file to its system prompt. magpie's built-in
    // Pi row writes AGENTS.md / CLAUDE.md in the same folder, so the two rows do
    // not share a file. The PI-Desktop plugin's row points here too: both apps
    // read ~/.pi/agent, so only one of the two rows should carry instructions.
    instructions: "~/.pi/agent/APPEND_SYSTEM.md",
    // Pi-Desktop-Plus does not read this file. lib/bridge.mjs turns it into the
    // one-file-per-server form Pi-Desktop-Plus reads from ~/.agents/servers.
    mcp: "~/.config/magpie-piplus/mcp.json",
    mcpFormat: "claude",
    skills: "~/.agents/skills",
  },
  notice:
    "已生效，Pi-Desktop-Plus 不用重启：在它里面选「Magpie」就是这里选的模型。",
}

// The level a chat starts on: "high" when the model has it, else the nearest
// level above, else the nearest below.
export function defaultLevel(levels) {
  const at = LEVELS.indexOf("high")
  for (let i = at; i < LEVELS.length; i++) if (levels.indexOf(LEVELS[i]) >= 0) return LEVELS[i]
  for (let i = at - 1; i >= 0; i--) if (levels.indexOf(LEVELS[i]) >= 0) return LEVELS[i]
  return undefined
}

// One of magpie's models as a Pi-Desktop-Plus manifest declares it.
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

// Pi-Desktop-Plus sends no key. Under this address the gateway takes a request
// as this agent's whatever it carries, so Usage lists it as Pi Desktop Plus For
// Magpie and the row's effort applies. (Measured on magpie 0.1.4173.)
export function agentUrl(gateway) {
  let url = String(gateway.url)
  while (url.charAt(url.length - 1) === "/") url = url.slice(0, url.length - 1)
  return url + "/agent/" + agent.id + "/v1"
}

// The provider cards: "magpie" first, then "magpie-2", … of at most 64 models
// each, and at most MAX_PROVIDERS cards: Pi-Desktop-Plus refuses the whole
// manifest above that. Models past the cut are left out; the alias is entry 0,
// so the picked model is never the one dropped.
export function providers(baseUrl, entries) {
  const out = []
  for (let i = 0; i < MAX_PROVIDERS && (i === 0 || i * MAX_MODELS < entries.length); i++) {
    out.push({
      id: i ? "magpie-" + (i + 1) : "magpie",
      name: i ? "Magpie " + (i + 1) : "Magpie",
      baseUrl,
      apiStyle: "chat_completions",
      // The gateway on this computer serves requests without a key, so nothing
      // has to be typed into Pi-Desktop-Plus.
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
    // carries the picked model's limits, which Pi-Desktop-Plus reads when it
    // starts; the model behind it changes at once. After it come magpie's
    // models by name, for a chat that should stay on one of them whatever the
    // row says. Picking one in Pi-Desktop-Plus does not change the row.
    entries.unshift(Object.assign({}, picked, { id: ALIAS, name: ALIAS_NAME }))
  }
  const manifest = restingManifest()
  manifest.description =
    "本机 Magpie 网关提供的模型，由 Magpie 的 Pi Desktop Plus For Magpie 一行维护。 Models from the Magpie gateway on this computer, kept by magpie's Pi Desktop Plus For Magpie row."
  manifest.contributes = { providers: providers(agentUrl(gateway), entries) }
  manifest.magpie = { url: gateway.url, v1: agentUrl(gateway), alias: ALIAS }
  return manifest
}

// The manifest while the row is off: a valid plugin that declares no provider,
// so Pi-Desktop-Plus drops the Magpie cards the next time it starts.
// lib/bridge.mjs puts it in place before the first connect. Switching the row
// off, or removing this package from magpie, makes magpie put every key back as
// it found it, which is then this, with no code of this package running.
export function restingManifest() {
  return {
    schemaVersion: 1,
    id: PLUGIN_ID,
    name: "Magpie",
    version: PLUGIN_VERSION,
    description:
      "已在 Magpie 里断开，现在不提供模型；不再使用时可以在这里卸载。 Disconnected in magpie: it provides no models now, and can be uninstalled here when it is no longer wanted.",
    author: "pi-desktop-plus-for-magpie",
    // Pi-Desktop-Plus wants an entry file. A JSON file loads as a module with no
    // hooks, so the folder needs no second file and runs no code.
    main: "manifest.json",
    contributes: { providers: [] },
    permissions: ["provider.register"],
    // Pi-Desktop-Plus does not read engines; the SDK type carries it, so it
    // states the version line this manifest is written against.
    engines: { piDesktop: ">=0.15.0" },
  }
}
