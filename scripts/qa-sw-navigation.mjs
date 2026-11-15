// Execute the actual service worker handler against a cache/network test double.
// No browser profile, user data, network, or generated application files are touched.
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const origin = "https://fly-view-personal.vercel.app";
const source = fs.readFileSync("apps/reader/public/sw.js", "utf8");
const handlers = new Map();
const cache = new Map();
const html = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
let network = async () => html("new reader shell");
let cacheFailure = false;
const cacheApi = {
  async open() {
    return { async put(key, response) { if (cacheFailure) throw new Error("Simulated storage failure"); cache.set(typeof key === "string" ? key : key.url, response.clone()); } };
  },
  async match(key) { return cache.get(typeof key === "string" ? key : key.url)?.clone(); }
};
vm.runInNewContext(source, { self: { location: { origin }, addEventListener: (name, handler) => handlers.set(name, handler) },
  caches: cacheApi, fetch: (...args) => network(...args), URL, Response, console });
const handler = handlers.get("fetch");
function navigate(pathname) {
  let intercepted = false;
  let response;
  handler({ request: { url: new URL(pathname, origin).href, method: "GET", mode: "navigate", headers: new Headers() },
    respondWith(value) { intercepted = true; response = Promise.resolve(value); } });
  return { intercepted, response };
}
const tests = [];
async function check(name, run) { await run(); tests.push(name); }

await check("successful root navigation refreshes both reader shell entries", async () => {
  const navigation = navigate("/");
  assert.equal(await (await navigation.response).text(), "new reader shell");
  assert.equal(await cache.get("/").clone().text(), "new reader shell");
  assert.equal(await cache.get("/index.html").clone().text(), "new reader shell");
});
await check("pairing page and other standalone pages cannot replace the reader shell", async () => {
  network = async () => html("pairing page");
  for (const path of ["/connect.html", "/connect.html#test-only-fragment", "/missing-page"]) assert.equal(navigate(path).intercepted, false);
  assert.equal(await cache.get("/").clone().text(), "new reader shell");
});
await check("404, server errors and non-HTML successes never poison the offline shell", async () => {
  for (const response of [html("error page", 404), html("server error", 503), new Response('{"status":"unexpected"}', { headers: { "Content-Type": "application/json" } })]) {
    network = async () => response.clone();
    const navigation = navigate("/index.html");
    assert.equal((await navigation.response).status, response.status);
    assert.equal(await cache.get("/").clone().text(), "new reader shell");
  }
});
await check("a redirected login page cannot replace the offline reader shell", async () => {
  const redirected = html("login page");
  Object.defineProperty(redirected, "redirected", { value: true });
  network = async () => redirected;
  assert.equal(await (await navigate("/").response).text(), "login page");
  assert.equal(await cache.get("/").clone().text(), "new reader shell");
});
await check("offline root restores the original reader after standalone and error navigations", async () => {
  network = async () => { throw new TypeError("offline"); };
  assert.equal(await (await navigate("/").response).text(), "new reader shell");
  assert.equal(await (await navigate("/index.html").response).text(), "new reader shell");
  assert.equal(navigate("/connect.html").intercepted, false);
});
await check("cache write failures keep online navigation usable and previous shell intact", async () => {
  cacheFailure = true;
  network = async () => html("latest online reader");
  assert.equal(await (await navigate("/").response).text(), "latest online reader");
  assert.equal(await cache.get("/").clone().text(), "new reader shell");
});
console.log(JSON.stringify({ ok: true, tests }, null, 2));
