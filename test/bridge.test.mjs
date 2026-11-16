import test from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import { join } from "node:path"
import { agent, agentUrl, connect, restingManifest, shortName, ALIAS, MAX_MODELS, PLUGIN_ID, defaultLevel } from "../piapp.agent.js"
import { MCP_MARK, SETTLE_MS, dataDir, pathsFor, readRow, serverId, syncMcp, syncOnce, syncRegistry, syncResting, syncSelected, translateMcp } from "../lib/bridge.mjs"

const gateway = { url: "http://127.0.0.1:3425", v1: "http://127.0.0.1:3425/v1", key: "k" }
const model = (id, extra = {}) => ({ id, name: id.toUpperCase(), context: 200000, output: 8192, images: false, efforts: [], ...extra })

function sandbox() {
  const root = fs.mkdtempSync(join(os.tmpdir(), "piapp-test-"))
  const paths = {
    plugin: join(root, "cfg", "plugin"),
    manifest: join(root, "cfg", "plugin", "manifest.json"),
    mcp: join(root, "cfg", "mcp.json"),
    status: join(root, "cfg", "status.json"),
    registry: join(root, "pi", "plugins", "registry.json"),
    servers: join(root, "agents", "servers"),
    selected: join(root, "pkg", "selected.js"),
    middleware: join(root, "pkg", "piapp.middleware.js"),
  }
  // PI-Desktop's data folder: the registry is only written where it exists
  fs.mkdirSync(join(root, "pi"), { recursive: true })
  const write = (file, value) => {
    fs.mkdirSync(join(file, ".."), { recursive: true })
    fs.writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value, null, 2))
  }
  // what magpie writes: connect()'s keys plus the model key
  const connectRow = (picked, models) => write(paths.manifest, { ...connect({ gateway, model: picked, models }), [agent.model]: picked.id })
  return { root, paths, write, connectRow, read: (file) => JSON.parse(fs.readFileSync(file, "utf8")) }
}

test("connect: the alias, named Magpie, comes first with the picked model's limits; magpie's models follow", () => {
  const a = model("a/one", { name: "One · Vendor A", efforts: ["none", "low", "high"], images: true })
  const b = model("b/two", { context: 0, output: 0 })
  const out = connect({ gateway, model: a, models: [a, b, a] })
  assert.equal(out.id, PLUGIN_ID)
  assert.equal(out.main, "manifest.json")
  assert.deepEqual(out.permissions, ["provider.register"])
  assert.equal(out.contributes.providers.length, 1)
  const [card] = out.contributes.providers
  assert.equal(card.id, "magpie")
  assert.equal(card.authKind, "none")
  // the address under which the gateway counts requests as this agent's
  assert.equal(card.baseUrl, "http://127.0.0.1:3425/agent/pidesktopformagpie/v1")
  assert.equal(agentUrl({ url: "http://127.0.0.1:3425/" }), card.baseUrl)
  assert.equal(out.magpie.v1, card.baseUrl)
  assert.equal(agent.ua, undefined)
  assert.equal(agent.effort, true)
  assert.deepEqual(card.models.map((m) => [m.id, m.name]), [[ALIAS, "Magpie"], ["a/one", "One · Vendor A"], ["b/two", "B/TWO"]])
  assert.deepEqual(card.models[0].thinkingLevels, ["off", "low", "high"])
  assert.equal(card.models[0].defaultThinkingLevel, "high")
  assert.equal(card.models[0].supportsImages, true)
  assert.equal(card.models[0].contextWindow, 200000)
  assert.equal(card.models[2].contextWindow, undefined)
})

test("connect: a picked model that is not in the list still gives the alias", () => {
  const out = connect({ gateway, model: model("x/hidden", { name: "Hidden" }), models: [model("a/one")] })
  assert.deepEqual(out.contributes.providers[0].models.map((m) => m.id), [ALIAS, "a/one"])
})

test("connect: more than 64 models are split into cards, none over the limit", () => {
  const models = Array.from({ length: 150 }, (_, i) => model(`v/m${i}`))
  const cards = connect({ gateway, model: models[3], models }).contributes.providers
  assert.deepEqual(cards.map((c) => c.id), ["magpie", "magpie-2", "magpie-3"])
  assert.ok(cards.every((c) => c.models.length <= MAX_MODELS))
  assert.equal(cards.reduce((n, c) => n + c.models.length, 0), 151)
})

test("connect: without a pick every model is listed, split into cards of at most 64", () => {
  const models = Array.from({ length: 150 }, (_, i) => model(`v/m${i}`))
  const cards = connect({ gateway, model: undefined, models }).contributes.providers
  assert.deepEqual(cards.map((c) => c.id), ["magpie", "magpie-2", "magpie-3"])
  assert.ok(cards.every((c) => c.models.length <= MAX_MODELS))
  assert.equal(cards.reduce((n, c) => n + c.models.length, 0), 150)
  assert.equal(shortName("GLM-5.3-Flash · 70$"), "GLM-5.3-Flash")
  assert.equal(shortName("plain"), "plain")
  const none = connect({ gateway, model: undefined, models: [] }).contributes.providers
  assert.equal(none.length, 1)
  assert.deepEqual(none[0].models, [])
})

test("defaultLevel falls to the nearest level", () => {
  assert.equal(defaultLevel(["low", "medium"]), "medium")
  assert.equal(defaultLevel(["xhigh", "max"]), "xhigh")
  assert.equal(defaultLevel([]), undefined)
})

test("selected.js follows the row, and empties when the row is off", async () => {
  const s = sandbox()
  s.connectRow(model("a/one"), [model("a/one")])
  s.write(s.paths.middleware, "// middleware")
  const old = new Date(Date.now() - 60000)
  fs.utimesSync(s.paths.middleware, old, old)
  assert.equal(syncSelected(s.paths, readRow(s.paths)), "updated")
  // the middleware's time moves, so magpie loads it (and selected.js) again
  assert.ok(fs.statSync(s.paths.middleware).mtimeMs > old.getTime() + 30000)
  const touched = fs.statSync(s.paths.middleware).mtimeMs
  assert.equal(syncSelected(s.paths, readRow(s.paths)), "ok")
  assert.equal(fs.statSync(s.paths.middleware).mtimeMs, touched)
  assert.match(fs.readFileSync(s.paths.selected, "utf8"), /export const selected = "a\/one"\n/)
  s.write(s.paths.manifest, {})
  syncSelected(s.paths, readRow(s.paths))
  assert.match(fs.readFileSync(s.paths.selected, "utf8"), /export const selected = ""\n/)
})

test("registry: waits while PI-Desktop runs, then adds the row and keeps the others", () => {
  const s = sandbox()
  const other = { id: "x.theme", name: "T", version: "1", enabled: true, source: "marketplace", status: "ready", permissions: [] }
  s.write(s.paths.registry, [other])
  s.connectRow(model("a/one"), [model("a/one")])
  const row = readRow(s.paths)
  assert.equal(syncRegistry(s.paths, row, () => true), "pending-quit")
  assert.deepEqual(s.read(s.paths.registry), [other])
  assert.equal(syncRegistry(s.paths, row, () => false), "added")
  const rows = s.read(s.paths.registry)
  assert.deepEqual(rows[0], other)
  assert.equal(rows[1].id, PLUGIN_ID)
  assert.equal(rows[1].source, "dev")
  assert.equal(rows[1].path, s.paths.plugin)
  assert.equal(rows[1].status, "ready")
  assert.deepEqual(rows[1].permissions, ["provider.register"])
  assert.ok(fs.existsSync(`${s.paths.registry}.magpie-piapp.bak`))
  // nothing to do the second time, so the process list is not even asked
  assert.equal(syncRegistry(s.paths, row, () => assert.fail("asked")), "ok")
})

test("registry: the row goes when the row in magpie is switched off", () => {
  const s = sandbox()
  s.connectRow(model("a/one"), [model("a/one")])
  syncRegistry(s.paths, readRow(s.paths), () => false)
  s.write(s.paths.manifest, {})
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => true), "pending-quit")
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "removed")
  assert.deepEqual(s.read(s.paths.registry), [])
})

test("registry: an unreadable file and someone else's row are left alone", () => {
  const s = sandbox()
  s.connectRow(model("a/one"), [model("a/one")])
  s.write(s.paths.registry, "{ not json")
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "unreadable")
  assert.equal(fs.readFileSync(s.paths.registry, "utf8"), "{ not json")
  const foreign = [{ id: PLUGIN_ID, name: "x", version: "1", enabled: true, source: "marketplace", status: "ready", permissions: [], path: "/elsewhere" }]
  s.write(s.paths.registry, foreign)
  s.write(s.paths.manifest, {})
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "foreign")
  assert.deepEqual(s.read(s.paths.registry), foreign)
})

test("registry: a disabled row stays disabled when the manifest changes", () => {
  const s = sandbox()
  s.connectRow(model("a/one"), [model("a/one")])
  syncRegistry(s.paths, readRow(s.paths), () => false)
  const rows = s.read(s.paths.registry)
  rows[0].enabled = false
  rows[0].status = "disabled"
  rows[0].version = "0.0.1"
  s.write(s.paths.registry, rows)
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "updated")
  const [row] = s.read(s.paths.registry)
  assert.equal(row.enabled, false)
  assert.equal(row.status, "disabled")
})

test("mcp: magpie's claude file becomes one PI-Desktop file per server", () => {
  const { servers, skipped } = translateMcp(
    JSON.stringify({
      mcpServers: {
        playwright: { command: "npx", args: ["@playwright/mcp"], env: { A: "1", B: 2 } },
        "My Hub!": { type: "http", url: "http://127.0.0.1:3425/mcp/magpie/hub/piapp", headers: { "X-A": "b" } },
        old: { type: "sse", url: "http://x/sse" },
      },
    }),
  )
  assert.deepEqual(skipped, ["old"])
  assert.deepEqual(Object.keys(servers), ["magpie-playwright", "magpie-My-Hub"])
  assert.equal(servers["magpie-playwright"].transport, "stdio")
  assert.deepEqual(servers["magpie-playwright"].env, { A: "1" })
  assert.equal(servers["magpie-My-Hub"].transport, "http")
  assert.equal(servers["magpie-My-Hub"].label, "My Hub!")
  assert.ok(servers["magpie-My-Hub"].description.startsWith(MCP_MARK))
  assert.ok(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(serverId("  中文 名字 with a very long name ".repeat(5))))
})

test("mcp: only this package's files are replaced or removed", () => {
  const s = sandbox()
  s.write(join(s.paths.servers, "mine.json"), { id: "mine", label: "mine", transport: "stdio", command: "x" })
  s.write(join(s.paths.servers, "magpie-taken.json"), { id: "magpie-taken", label: "user's own", transport: "stdio", command: "x" })
  s.write(s.paths.mcp, { mcpServers: { a: { command: "a" }, taken: { command: "t" } } })
  let r = syncMcp(s.paths)
  assert.deepEqual([r.count, r.written, r.removed, r.blocked], [1, 1, 0, ["magpie-taken"]])
  assert.equal(s.read(join(s.paths.servers, "magpie-a.json")).command, "a")
  assert.equal(s.read(join(s.paths.servers, "magpie-taken.json")).label, "user's own")
  assert.equal(syncMcp(s.paths).written, 0)
  s.write(s.paths.mcp, { mcpServers: { b: { command: "b" } } })
  r = syncMcp(s.paths)
  assert.deepEqual([r.written, r.removed], [1, 1])
  fs.rmSync(s.paths.mcp)
  assert.equal(syncMcp(s.paths).removed, 1)
  assert.deepEqual(fs.readdirSync(s.paths.servers).sort(), ["magpie-taken.json", "mine.json"])
})

test("syncOnce reports each step and survives a missing everything", () => {
  const s = sandbox()
  const status = syncOnce(s.paths, () => false)
  assert.equal(status.connected, false)
  assert.equal(status.manifest, "seeded")
  assert.equal(status.registry, "ok")
  assert.equal(status.mcp.count, 0)
})

test("resting manifest: a valid plugin with no providers, holding every key connect() writes but its own two", () => {
  const resting = restingManifest()
  assert.equal(resting.id, PLUGIN_ID)
  assert.deepEqual(resting.contributes, { providers: [] })
  const connected = connect({ gateway, model: model("a/one"), models: [model("a/one")] })
  // magpie puts back the keys it found and takes out the ones it added: the
  // only keys connect() may add to the resting manifest are these.
  assert.deepEqual(Object.keys(connected).filter((k) => !(k in resting)), ["magpie"])
  assert.deepEqual(Object.keys(resting).filter((k) => !(k in connected)), [])
})

test("resting manifest: seeded when the file is missing, then left as it is", () => {
  const s = sandbox()
  assert.equal(syncResting(s.paths, readRow(s.paths)), "seeded")
  assert.deepEqual(s.read(s.paths.manifest), restingManifest())
  assert.equal(readRow(s.paths).connected, false)
  assert.equal(syncResting(s.paths, readRow(s.paths)), "resting")
  // magpie's own manifest is not touched
  s.connectRow(model("a/one"), [model("a/one")])
  const before = fs.readFileSync(s.paths.manifest, "utf8")
  assert.equal(syncResting(s.paths, readRow(s.paths)), "connected")
  assert.equal(fs.readFileSync(s.paths.manifest, "utf8"), before)
})

test("resting manifest: an emptied file is replaced only after it has stayed the same", () => {
  const s = sandbox()
  s.write(s.paths.manifest, "{}")
  const memo = {}
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000), "waiting")
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000 + SETTLE_MS - 1), "waiting")
  assert.equal(fs.readFileSync(s.paths.manifest, "utf8"), "{}")
  // the file changed in between: the wait starts again
  s.write(s.paths.manifest, "{}\n")
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000 + SETTLE_MS + 5), "waiting")
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000 + 2 * SETTLE_MS + 5), "seeded")
  assert.deepEqual(s.read(s.paths.manifest), restingManifest())
})

test("resting manifest: a row switched on while an empty file waits is not written over", () => {
  const s = sandbox()
  s.write(s.paths.manifest, "{}")
  const memo = {}
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000), "waiting")
  s.connectRow(model("a/one"), [model("a/one")])
  assert.equal(syncResting(s.paths, readRow(s.paths), memo, 1000 + SETTLE_MS), "connected")
  assert.equal(readRow(s.paths).connected, true)
})

test("resting manifest: a file that is neither empty nor this package's is left alone", () => {
  const s = sandbox()
  for (const text of ["{ not json", '{"id":"someone.else","contributes":{"providers":[]}}', "[]"]) {
    s.write(s.paths.manifest, text)
    const memo = {}
    assert.equal(syncResting(s.paths, readRow(s.paths), memo, 0), "foreign")
    assert.equal(syncResting(s.paths, readRow(s.paths), memo, 10 * SETTLE_MS), "foreign")
    assert.equal(fs.readFileSync(s.paths.manifest, "utf8"), text)
  }
})

test("switched off with the resting manifest in place: the registry row goes, the manifest stays", () => {
  const s = sandbox()
  syncResting(s.paths, readRow(s.paths))
  // what magpie does: connect() over the resting manifest, then every key back
  s.connectRow(model("a/one"), [model("a/one")])
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "added")
  s.write(s.paths.manifest, restingManifest())
  const status = syncOnce(s.paths, () => false)
  assert.equal(status.connected, false)
  assert.equal(status.manifest, "resting")
  assert.equal(status.registry, "removed")
  assert.deepEqual(s.read(s.paths.registry), [])
})

test("PI-Desktop's data folder: the override, then where its storage setting moved it, then the default", () => {
  const home = fs.mkdtempSync(join(os.tmpdir(), "piapp-home-"))
  const appData = join(home, "AppData", "Roaming")
  const pointer = join(appData, "PI-Desktop", "storage-location.json")
  const moved = join(home, "elsewhere", "data")
  assert.equal(dataDir({ APPDATA: appData }, home, "win32"), join(home, ".pi-desktop"))
  fs.mkdirSync(join(appData, "PI-Desktop"), { recursive: true })
  fs.writeFileSync(pointer, JSON.stringify({ version: 1, roots: { data: moved, browser: join(home, "elsewhere", "browser") }, backups: [] }))
  assert.equal(dataDir({ APPDATA: appData }, home, "win32"), moved)
  assert.equal(pathsFor({ APPDATA: appData }, home, "win32").registry, join(moved, "plugins", "registry.json"))
  assert.equal(dataDir({ APPDATA: appData, PI_DESKTOP_DATA_DIR: join(home, "explicit") }, home, "win32"), join(home, "explicit"))
  for (const bad of ["not json", "{}", JSON.stringify({ roots: { data: "relative/path" } })]) {
    fs.writeFileSync(pointer, bad)
    assert.equal(dataDir({ APPDATA: appData }, home, "win32"), join(home, ".pi-desktop"))
  }
  // the other systems keep the file elsewhere
  fs.mkdirSync(join(home, "Library", "Application Support", "PI-Desktop"), { recursive: true })
  fs.writeFileSync(join(home, "Library", "Application Support", "PI-Desktop", "storage-location.json"), JSON.stringify({ roots: { data: moved } }))
  assert.equal(dataDir({}, home, "darwin"), moved)
  assert.equal(dataDir({}, home, "linux"), join(home, ".pi-desktop"))
  fs.mkdirSync(join(home, "xdg", "PI-Desktop"), { recursive: true })
  fs.writeFileSync(join(home, "xdg", "PI-Desktop", "storage-location.json"), JSON.stringify({ roots: { data: moved } }))
  assert.equal(dataDir({ XDG_CONFIG_HOME: join(home, "xdg") }, home, "linux"), moved)
})

test("registry: nothing is made where PI-Desktop has no data folder", () => {
  const s = sandbox()
  fs.rmSync(join(s.root, "pi"), { recursive: true })
  s.connectRow(model("a/one"), [model("a/one")])
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "no-pi-desktop")
  assert.equal(fs.existsSync(join(s.root, "pi")), false)
  fs.mkdirSync(join(s.root, "pi"))
  assert.equal(syncRegistry(s.paths, readRow(s.paths), () => false), "added")
})
