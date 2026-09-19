import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createAppServer } from "../scripts/serve.js";

test("server exposes public assets while rejecting private paths and write requests", async (t) => {
  const server = createAppServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  const html = await page.text();
  assert.match(html, /Content-Security-Policy/);
  for (const [, path] of html.matchAll(/(?:src|href)="(\.\/[^"\s]+)"/g)) {
    assert.equal((await fetch(new URL(path, url))).status, 200, path);
  }
  const script = await fetch(`${url}/src/planner.js`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get("content-type"), /javascript/);
  for (const path of [
    "/.git/config",
    "/package.json",
    "/.env",
    "/docs/design.md",
    "/src/../../.git/config",
    "/missing",
  ]) {
    assert.equal((await fetch(url + path)).status, 404, path);
  }
  assert.equal((await fetch(url, { method: "POST" })).status, 405);
  const head = await fetch(`${url}/src/planner.js`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal(head.headers.get("x-content-type-options"), "nosniff");
});
