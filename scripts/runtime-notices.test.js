const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runtimeNotices } = require("./runtime-notices.js");

test("includes direct and transitive licenses and deduplicates shared packages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ht-license-test-"));
  const write = (file, content) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, content); };
  try {
    for (const app of ["extension", "popup"]) write(path.join(root, app, "package.json"), JSON.stringify({ dependencies: { first: "1" } }));
    write(path.join(root, "node_modules/first/package.json"), JSON.stringify({ name: "first", version: "1.0.0", license: "MIT", dependencies: { second: "1" } }));
    write(path.join(root, "node_modules/first/LICENSE"), "First license");
    write(path.join(root, "node_modules/second/package.json"), JSON.stringify({ name: "second", version: "1.0.0", license: "ISC" }));
    write(path.join(root, "node_modules/second/LICENSE-MIT.txt"), "Second license");
    const notice = runtimeNotices(root);
    assert.match(notice, /first@1\.0\.0 — MIT/);
    assert.match(notice, /second@1\.0\.0 — ISC/);
    assert.match(notice, /First license/);
    assert.match(notice, /Second license/);
    assert.equal((notice.match(/first@1\.0\.0/g) ?? []).length, 1);
    fs.rmSync(path.join(root, "node_modules/second/LICENSE-MIT.txt"));
    assert.throws(() => runtimeNotices(root), /No license text found/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("the installed runtime graphs have reviewable license texts", () => {
  const notices = runtimeNotices(path.resolve(__dirname, ".."));
  assert.match(notices, /color-alpha@2\.0\.0 — MIT/);
  assert.match(notices, /color-rgba@3\.0\.0 — MIT/);
  assert.match(notices, /react@/);
  assert.match(notices, /Copyright/);
});
