// Runs in magpie's Bun plugin host (and under Node, for the tests). magpie's
// agent module can only keep one file current; this module does the things
// around it that need a file system:
//
//  1. selected.js — the model picked in the row, for the gateway middleware.
//  2. the resting manifest — what the manifest holds while the row is off, put
//     there before the first connect so that magpie itself restores it when
//     the row is switched off or this package is removed.
//  3. Pi-Desktop-Plus's plugin registry — one row that makes Pi-Desktop-Plus
//     read the manifest magpie keeps. Pi-Desktop-Plus holds the registry in
//     memory and writes its copy back, so the row is only changed while it is
//     not running.
//  4. ~/.agents/servers — magpie's Library MCP servers for this agent, one JSON
//     file per server, which is the form Pi-Desktop-Plus reads.
//
// Pi-Desktop-Plus's database is never opened.
import fs from "node:fs"
import { execFileSync, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { homedir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { PLUGIN_ID, restingManifest } from "../piplus.agent.js"

export { PLUGIN_ID }
// Marks a server file as written by this package, so only those are replaced
// or removed. The PI-Desktop plugin writes the same folder with its own mark
// and a "magpie-" prefix; neither package touches the other's files.
export const MCP_MARK = "[magpie-piplus]"
const MCP_PREFIX = "magpie-plus-"

// Electron's userData folder of the installed Pi-Desktop-Plus.
export function userDataDir(env = process.env, home = homedir(), platform = process.platform) {
  if (platform === "win32") return join((env.APPDATA || "").trim() || join(home, "AppData", "Roaming"), "Pi-Desktop-Plus")
  if (platform === "darwin") return join(home, "Library", "Application Support", "Pi-Desktop-Plus")
  return join((env.XDG_CONFIG_HOME || "").trim() || join(home, ".config"), "Pi-Desktop-Plus")
}

// Where Pi-Desktop-Plus keeps its data: PI_DESKTOP_DATA_DIR when set, else the
// folder its Settings > System > Storage moved the data to (which it records
// in storage-location.json in its userData folder), else ~/.pi-desktop-plus.
export function dataDir(env = process.env, home = homedir(), platform = process.platform) {
  const explicit = (env.PI_DESKTOP_DATA_DIR || "").trim()
  if (explicit) return resolve(explicit)
  try {
    const moved = JSON.parse(fs.readFileSync(join(userDataDir(env, home, platform), "storage-location.json"), "utf8"))
    const data = moved && moved.roots && moved.roots.data
    if (typeof data === "string" && isAbsolute(data)) return data
  } catch {
    // no such file, or not one to go by: the default
  }
  return join(home, ".pi-desktop-plus")
}

export function pathsFor(env = process.env, home = homedir(), platform = process.platform) {
  const root = join(home, ".config", "magpie-piplus")
  const data = dataDir(env, home, platform)
  const agents = (env.PI_DESKTOP_AGENTS_DIR || "").trim() || join(home, ".agents")
  const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
  return {
    plugin: join(root, "plugin"),
    manifest: join(root, "plugin", "manifest.json"),
    mcp: join(root, "mcp.json"),
    status: join(root, "status.json"),
    registry: join(data, "plugins", "registry.json"),
    servers: join(agents, "servers"),
    selected: join(packageDir, "selected.js"),
    middleware: join(packageDir, "piplus.middleware.js"),
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8")
  } catch (e) {
    if (e.code === "ENOENT" || e.code === "ENOTDIR") return null
    throw e
  }
}

function writeAtomic(file, text) {
  fs.mkdirSync(dirname(file), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, text, { flag: "wx" })
    fs.renameSync(temp, file)
  } finally {
    fs.rmSync(temp, { force: true })
  }
}

function writeIfChanged(file, text) {
  if (readText(file) === text) return false
  writeAtomic(file, text)
  return true
}

// What magpie's row currently asks for, read from the manifest it keeps.
export function readRow(paths) {
  const off = { connected: false, model: "", manifest: null }
  const raw = readText(paths.manifest)
  if (raw === null || raw.trim() === "") return off
  let manifest
  try {
    manifest = JSON.parse(raw)
  } catch {
    return off
  }
  if (!manifest || typeof manifest !== "object" || manifest.id !== PLUGIN_ID) return off
  const declared = manifest.contributes && manifest.contributes.providers
  if (!Array.isArray(declared) || declared.length === 0) return off
  const model = typeof manifest.magpieModel === "string" ? manifest.magpieModel.trim() : ""
  return { connected: true, model, manifest }
}

// ---- 1. the alias's model -------------------------------------------------

export function syncSelected(paths, row) {
  const text =
    "// Written by lib/bridge.mjs: the model picked for Pi Desktop Plus For Magpie on magpie's Agents page.\n" +
    `export const selected = ${JSON.stringify(row.connected ? row.model : "")}\n`
  if (!writeIfChanged(paths.selected, text)) return "ok"
  // magpie reloads a middleware when its own file changes, not when a file it
  // imports does: a new modification time on the middleware makes it read
  // selected.js again.
  if (paths.middleware) {
    try {
      const now = new Date()
      fs.utimesSync(paths.middleware, now, now)
    } catch {
      // without the file there is nothing to reload
    }
  }
  return "updated"
}

// ---- 2. the resting manifest ------------------------------------------------

// magpie writes the manifest too, when the row is switched. A missing file is
// created only if it is still missing at the write. An empty one ({} is what
// magpie leaves of a manifest it made itself) is replaced only once it has
// read the same for SETTLE_MS, so a write of magpie's that is under way is not
// taken for one.
export const SETTLE_MS = 1500

// Returns "connected" (magpie's manifest, left alone), "resting" (already in
// place), "seeded" (written now), "waiting" (an empty file that has to stay
// the same for a moment first) or "foreign" (something else: left alone).
export function syncResting(paths, row, memo = {}, now = Date.now()) {
  if (row.connected) {
    memo.raw = undefined
    return "connected"
  }
  const raw = readText(paths.manifest)
  const text = JSON.stringify(restingManifest(), null, 2) + "\n"
  if (raw === null) {
    fs.mkdirSync(dirname(paths.manifest), { recursive: true })
    try {
      fs.writeFileSync(paths.manifest, text, { flag: "wx" })
    } catch (e) {
      if (e.code === "EEXIST") return "waiting"
      throw e
    }
    return "seeded"
  }
  let parsed
  try {
    parsed = raw.trim() === "" ? {} : JSON.parse(raw)
  } catch {
    return "foreign"
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "foreign"
  const declared = parsed.contributes && parsed.contributes.providers
  if (parsed.id === PLUGIN_ID && Array.isArray(declared) && declared.length === 0) return "resting"
  if (Object.keys(parsed).length > 0) return "foreign"
  if (memo.raw !== raw) {
    memo.raw = raw
    memo.since = now
    return "waiting"
  }
  if (now - memo.since < SETTLE_MS) return "waiting"
  memo.raw = undefined
  writeAtomic(paths.manifest, text)
  return "seeded"
}

// ---- 3. Pi-Desktop-Plus's plugin registry ----------------------------------

export function piPlusRunning() {
  try {
    if (process.platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq Pi-Desktop-Plus.exe", "/FO", "CSV", "/NH"], {
        encoding: "utf8",
        windowsHide: true,
        timeout: 8000,
      })
      return /pi-desktop-plus\.exe/i.test(out)
    }
    const pattern = process.platform === "darwin" ? "Pi-Desktop-Plus.app/Contents/MacOS/Pi-Desktop-Plus" : "pi-desktop-plus"
    const found = spawnSync("pgrep", ["-if", pattern], { encoding: "utf8", timeout: 8000 })
    if (found.error) return true
    return found.status === 0
  } catch {
    // Not knowing is treated as running: the registry is then left alone.
    return true
  }
}

// The row Pi-Desktop-Plus's own "Load local plugin" writes (host-core load_dev).
export function registryRow(paths, manifest, previous, now = new Date().toISOString()) {
  return {
    id: PLUGIN_ID,
    name: typeof manifest.name === "string" ? manifest.name : "Magpie",
    version: typeof manifest.version === "string" ? manifest.version : "0.0.0",
    enabled: previous ? previous.enabled !== false : true,
    scope: previous && previous.scope ? previous.scope : { mode: "global", projects: [] },
    source: "dev",
    bundled: false,
    status: previous && previous.enabled === false ? "disabled" : "ready",
    permissions: Array.isArray(manifest.permissions) ? manifest.permissions : [],
    path: paths.plugin,
    capabilities: ["providers"],
    description: typeof manifest.description === "string" ? manifest.description : undefined,
    author: typeof manifest.author === "string" ? manifest.author : undefined,
    installedAt: (previous && previous.installedAt) || now,
    updatedAt: now,
    autoUpdate: false,
  }
}

function sameRow(a, b) {
  const keys = ["name", "version", "source", "path"]
  return keys.every((k) => a[k] === b[k]) && JSON.stringify(a.permissions) === JSON.stringify(b.permissions)
}

// Returns "ok", "added", "updated", "removed", "pending-quit" (Pi-Desktop-Plus
// is running, so nothing was written), "foreign" (a row with this id that this
// package did not write), "unreadable" (the registry is left untouched) or
// "no-pi-desktop-plus" (its data folder is not there, and is not made here).
export function syncRegistry(paths, row, running = piPlusRunning) {
  const raw = readText(paths.registry)
  let rows = []
  if (raw !== null) {
    try {
      rows = JSON.parse(raw)
    } catch {
      return "unreadable"
    }
    if (!Array.isArray(rows) || rows.some((r) => !r || typeof r !== "object" || typeof r.id !== "string")) return "unreadable"
  }
  const previous = rows.find((r) => r.id === PLUGIN_ID) || null
  const ours = previous && previous.source === "dev" && previous.path === paths.plugin

  let next
  let result
  if (row.connected) {
    const wanted = registryRow(paths, row.manifest, ours ? previous : null)
    if (ours && sameRow(previous, wanted)) return "ok"
    next = [...rows.filter((r) => r.id !== PLUGIN_ID), wanted]
    result = previous ? "updated" : "added"
  } else {
    if (!previous) return "ok"
    if (!ours) return "foreign"
    next = rows.filter((r) => r.id !== PLUGIN_ID)
    result = "removed"
  }
  if (raw === null && !fs.existsSync(dirname(dirname(paths.registry)))) return "no-pi-desktop-plus"
  if (running()) return "pending-quit"
  if (raw !== null) {
    const backup = `${paths.registry}.magpie-piplus.bak`
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, raw)
  }
  writeAtomic(paths.registry, JSON.stringify(next, null, 2))
  return result
}

// ---- 4. Library MCP servers ------------------------------------------------

function strings(value) {
  const out = {}
  if (!value || typeof value !== "object" || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value)) if (typeof v === "string") out[k] = v
  return out
}

// Pi-Desktop-Plus's server ids: a letter first, then letters, digits, "_" or
// "-", at most 64 characters.
export function serverId(name) {
  const slug = String(name)
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return (MCP_PREFIX + (slug || "server")).slice(0, 64)
}

// magpie's "claude" MCP file ({mcpServers: {name: {command, args, env} | {type,
// url, headers}}}) as Pi-Desktop-Plus's server files. Returns {id: config} and
// the names it could not express.
export function translateMcp(raw) {
  const servers = {}
  const skipped = []
  if (raw === null || raw.trim() === "") return { servers, skipped }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { servers, skipped: ["(unreadable MCP file)"] }
  }
  const map = parsed && typeof parsed === "object" && parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : parsed
  if (!map || typeof map !== "object" || Array.isArray(map)) return { servers, skipped }
  for (const [name, def] of Object.entries(map)) {
    if (!def || typeof def !== "object") continue
    let id = serverId(name)
    for (let n = 2; servers[id]; n++) id = `${serverId(name).slice(0, 60)}-${n}`
    const config = { id, label: name, description: `${MCP_MARK} 由 Magpie 资源库管理，请在 Magpie 里修改。` }
    const type = typeof def.type === "string" ? def.type.toLowerCase() : ""
    if (typeof def.command === "string" && def.command !== "") {
      config.transport = "stdio"
      config.command = def.command
      config.args = Array.isArray(def.args) ? def.args.filter((a) => typeof a === "string") : []
      config.env = strings(def.env)
    } else if (typeof def.url === "string" && /^https?:\/\//i.test(def.url) && type !== "sse") {
      // Pi-Desktop-Plus speaks stdio and streamable HTTP.
      config.transport = "http"
      config.url = def.url
      config.headers = strings(def.headers)
    } else {
      skipped.push(name)
      continue
    }
    servers[id] = config
  }
  return { servers, skipped }
}

function ownedServerFiles(paths) {
  const out = {}
  let names = []
  try {
    names = fs.readdirSync(paths.servers)
  } catch {
    return out
  }
  for (const name of names) {
    if (!name.startsWith(MCP_PREFIX) || !name.endsWith(".json")) continue
    const file = join(paths.servers, name)
    try {
      const config = JSON.parse(fs.readFileSync(file, "utf8"))
      if (config && typeof config.description === "string" && config.description.startsWith(MCP_MARK)) out[name] = file
    } catch {
      // not a file this package wrote
    }
  }
  return out
}

export function syncMcp(paths) {
  const { servers, skipped } = translateMcp(readText(paths.mcp))
  const owned = ownedServerFiles(paths)
  let written = 0
  let removed = 0
  const blocked = []
  for (const [id, config] of Object.entries(servers)) {
    const name = `${id}.json`
    const file = join(paths.servers, name)
    // A file of that name the user made themselves stays theirs.
    if (!owned[name] && fs.existsSync(file)) {
      blocked.push(id)
      continue
    }
    if (writeIfChanged(file, JSON.stringify(config, null, 2) + "\n")) written++
    delete owned[name]
  }
  for (const file of Object.values(owned)) {
    fs.rmSync(file, { force: true })
    removed++
  }
  return { count: Object.keys(servers).length - blocked.length, written, removed, skipped, blocked }
}

// ---- the loop ---------------------------------------------------------------

export function syncOnce(paths = pathsFor(), running = piPlusRunning, memo = {}) {
  const row = readRow(paths)
  const status = { connected: row.connected, model: row.model }
  const step = (name, fn) => {
    try {
      status[name] = fn()
    } catch (error) {
      status[name] = `error: ${error instanceof Error ? error.message : String(error)}`
    }
  }
  step("selected", () => syncSelected(paths, row))
  step("manifest", () => syncResting(paths, row, memo))
  step("registry", () => syncRegistry(paths, row, running))
  step("mcp", () => syncMcp(paths))
  return status
}

export function startBridge({ paths, interval = 3000, log = () => {} } = {}) {
  // Pi-Desktop-Plus's data can be moved while this runs, so its place is looked
  // up again at each pass.
  const current = paths ? () => paths : () => pathsFor()
  paths = current()
  let previous = ""
  let lastCheck = 0
  let lastRunning = true
  // tasklist / pgrep is only asked when the registry needs a change, and at
  // most every ten seconds.
  const running = () => {
    const now = Date.now()
    if (now - lastCheck >= 10000) {
      lastCheck = now
      lastRunning = piPlusRunning()
    }
    return lastRunning
  }
  const memo = {}
  const tick = () => {
    let status
    try {
      paths = current()
      status = syncOnce(paths, running, memo)
    } catch (error) {
      status = { error: error instanceof Error ? error.message : String(error) }
    }
    const line = JSON.stringify(status)
    if (line === previous) return
    previous = line
    try {
      writeAtomic(paths.status, JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2) + "\n")
    } catch {
      // the status file is a convenience
    }
    log(line)
  }
  tick()
  const timer = setInterval(tick, interval)
  timer.unref?.()
  // magpie restarts the plugin host soon after the row is switched off or the
  // package is removed, so what magpie writes is acted on at once and not at
  // the next interval. Watching is an extra: the interval covers a platform
  // or a folder where it does not work.
  const watchers = []
  let soon = null
  const nudge = () => {
    if (soon) return
    soon = setTimeout(() => {
      soon = null
      tick()
    }, 50)
    soon.unref?.()
  }
  for (const dir of new Set([dirname(paths.manifest), dirname(paths.mcp)])) {
    try {
      fs.mkdirSync(dir, { recursive: true })
      const watcher = fs.watch(dir, { persistent: false }, nudge)
      watcher.on("error", () => {})
      watchers.push(watcher)
    } catch {
      // the interval still runs
    }
  }
  return () => {
    clearInterval(timer)
    if (soon) clearTimeout(soon)
    for (const watcher of watchers) {
      try {
        watcher.close()
      } catch {
        // already closed
      }
    }
  }
}
