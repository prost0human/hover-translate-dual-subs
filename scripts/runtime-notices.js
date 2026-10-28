const fs = require("node:fs");
const path = require("node:path");

/** Find the dependency as Node's nested node_modules resolution does. */
function findPackage(start, name) {
  for (let current = start;; current = path.dirname(current)) {
    const candidate = path.join(current, "node_modules", name);
    if (fs.existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(current) === current) return null;
  }
}

/** Bundle the licenses of declared production dependencies, including transitives. */
function runtimeNotices(root) {
  const packages = new Map();
  const visit = (dir) => {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const id = `${meta.name}@${meta.version}`;
    if (packages.has(id)) return;
    packages.set(id, { dir, meta });
    for (const [name, optional] of [
      ...Object.keys(meta.dependencies ?? {}).filter((name) => !(name in (meta.optionalDependencies ?? {}))).map((name) => [name, false]),
      ...Object.keys(meta.optionalDependencies ?? {}).map((name) => [name, true]),
    ]) {
      const found = findPackage(dir, name);
      if (found) visit(found);
      else if (!optional) throw new Error(`Missing runtime dependency ${name} for ${id}`);
    }
  };

  for (const app of ["extension", "popup"]) {
    const dir = path.join(root, app);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    for (const name of Object.keys(meta.dependencies ?? {})) {
      const found = findPackage(dir, name);
      if (!found) throw new Error(`Missing runtime dependency ${name} for ${app}`);
      visit(found);
    }
  }

  const notices = [
    "Third-party runtime dependencies and license texts",
    "Generated from the installed production dependency graphs of extension/ and popup/.",
    "This may include dependencies that the bundler does not use. See THIRD_PARTY_NOTICES.md.",
  ];
  const licenseName = /^(?:licen[cs]e|copying|notice)(?:[._-].*)?$/i;
  for (const [id, { dir, meta }] of [...packages].sort(([a], [b]) => a.localeCompare(b))) {
    let files = fs.readdirSync(dir).filter((name) => licenseName.test(name) && fs.statSync(path.join(dir, name)).isFile()).sort();
    const fallback = path.join(root, "third_party_licenses", `${meta.name}.txt`);
    if (!files.length && fs.existsSync(fallback)) files = [fallback];
    if (!files.length) throw new Error(`No license text found for ${id}; review and add it to third_party_licenses/`);
    notices.push(`\n${"=".repeat(72)}\n${id} — ${meta.license ?? "license unspecified"}`);
    for (const file of files) {
      const source = path.isAbsolute(file) ? file : path.join(dir, file);
      notices.push(`\n--- ${path.basename(file)} ---\n${fs.readFileSync(source, "utf8").trim()}`);
    }
  }
  return notices.join("\n") + "\n";
}

module.exports = { runtimeNotices };
