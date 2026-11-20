// Headless check against the installed Pi-Desktop-Plus host-core, in a
// throwaway data directory: does a registry row written by lib/bridge.mjs make
// the host create provider rows from the manifest magpie keeps?
//
//   node scripts/hostcore-check.mjs <pi-desktop-host-core> <scratch dir> [off | resting | oldurl | orphan-empty | orphan-gone]
//
// Run it twice on one scratch dir to see a change: first with no mode (the
// row is on), then with the mode to check.
import fs from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { agent, connect, restingManifest } from "../piplus.agent.js"
import { readRow, syncRegistry } from "../lib/bridge.mjs"

const [hostBin, scratch, mode] = process.argv.slice(2)
const data = join(scratch, "data")
const paths = {
  plugin: join(scratch, "cfg", "plugin"),
  manifest: join(scratch, "cfg", "plugin", "manifest.json"),
  registry: join(data, "plugins", "registry.json"),
}
fs.mkdirSync(paths.plugin, { recursive: true })
fs.mkdirSync(join(data, "plugins"), { recursive: true })

const gateway = { url: "http://127.0.0.1:3425", v1: "http://127.0.0.1:3425/v1", key: "k" }
const models = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", context: 131072, output: 8192, images: false, efforts: [] },
  { id: "any-claude/claude-x", name: "Claude X", context: 200000, output: 64000, images: true, efforts: ["none", "low", "medium", "high"] },
]
// "orphan-empty" / "orphan-gone": what Pi-Desktop-Plus is left with when the
// magpie plugin is removed and nothing takes the registry row out. magpie has
// emptied the manifest, or the folder is gone, and the row is still there.
// "resting": the row is off, or the package was removed from magpie, and
// magpie has put the resting manifest back; the registry row is still there.
if (mode === "resting") {
  fs.writeFileSync(paths.manifest, JSON.stringify(restingManifest(), null, 2))
} else if (mode === "orphan-empty") {
  fs.writeFileSync(paths.manifest, "{}\n")
} else if (mode === "orphan-gone") {
  fs.rmSync(paths.plugin, { recursive: true, force: true })
} else if (mode === "off") {
  fs.writeFileSync(paths.manifest, "{}\n")
} else {
  const manifest = { ...connect({ gateway, model: models[1], models }), [agent.model]: models[1].id }
  // "oldurl": the address earlier versions declared, to check that a later
  // run with the current one moves the provider row.
  if (mode === "oldurl") for (const card of manifest.contributes.providers) card.baseUrl = gateway.v1
  fs.writeFileSync(paths.manifest, JSON.stringify(manifest, null, 2))
}
if (mode === "resting" || (mode && mode.startsWith("orphan"))) console.log("registry: left as it was")
else console.log("registry:", syncRegistry(paths, readRow(paths), () => false))

const child = spawn(hostBin, [], { env: { ...process.env, PI_DESKTOP_DATA_DIR: data }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true })
let err = ""
child.stderr.on("data", (d) => (err += d))
child.stdout.on("data", () => {})
// The host has done its start-up work when it logs the reconcile (or says why
// it could not); a first start in a new folder can take a while.
for (let waited = 0; waited < 30000 && !/reconciled plugin provider rows|manifest unreadable/.test(err); waited += 250) {
  await new Promise((r) => setTimeout(r, 250))
}
await new Promise((r) => setTimeout(r, 1500))
child.kill()
await new Promise((r) => child.once("exit", r))
console.log("--- host stderr (last lines)")
console.log(err.split(/\r?\n/).filter((l) => /plugin|provider|error|warn/i.test(l)).slice(-12).join("\n") || "(nothing about plugins)")

const db = new DatabaseSync(join(data, "pi.sqlite"), { readOnly: true })
console.log("--- providers")
for (const r of db.prepare("SELECT id, name, base_url, auth_kind, api_style, enabled, owner_plugin_id, default_model_id FROM providers").all()) console.log(JSON.stringify(r))
console.log("--- models")
for (const r of db.prepare("SELECT provider_id, model_id, display_name, context_window, max_output_tokens, source FROM models").all()) console.log(JSON.stringify(r))
// Pi-Desktop-Plus keeps a plugin's declared models in the provider row's
// config_json, not in the models table (that one is the user/catalog path).
for (const r of db.prepare("SELECT id, config_json FROM providers WHERE owner_plugin_id IS NOT NULL").all()) {
  for (const m of JSON.parse(r.config_json || "{}").models || []) console.log(JSON.stringify({ provider_id: r.id, declared: m }))
}
console.log("--- registry after run")
console.log(fs.readFileSync(paths.registry, "utf8").slice(0, 900))
db.close()
