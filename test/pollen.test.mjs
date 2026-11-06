// Runs the shipped client against a fake network: device flow, key handling and
// the chat request shape, with no Pollen spent.
import assert from "node:assert/strict";
import test from "node:test";

import { APP_KEY, createMemoryStore, createPollen } from "../shared/pollen.js";

function fakeNetwork(responses) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const reply = responses(String(url), calls.length);
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      json: async () => reply.body,
    };
  };
  return { calls, fetchImpl };
}

const chat = (text) => ({ status: 200, body: { choices: [{ message: { content: text } }] } });

test("device flow: code, then approval", async () => {
  const { calls, fetchImpl } = fakeNetwork((url, call) => {
    if (url.endsWith("/api/device/code")) {
      return {
        status: 200,
        body: {
          device_code: "dev-1",
          user_code: "WXYZ-1234",
          verification_uri_complete: "https://enter.pollinations.ai/device?user_code=WXYZ-1234",
          expires_in: 1800,
          interval: 5,
        },
      };
    }
    return call === 2
      ? { status: 428, body: { error: "authorization_pending" } }
      : { status: 200, body: { access_token: "sk_user" } };
  });

  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });

  const started = await pollen.connect();
  assert.equal(started.userCode, "WXYZ-1234");
  // The app key travels as client_id so the consent screen names the app and
  // the traffic is attributed to it (BRING_YOUR_OWN_POLLEN.md, device flow).
  assert.equal(JSON.parse(calls[0].options.body).client_id, APP_KEY);
  assert.equal(pollen.status().state, "signed-out");

  assert.equal((await pollen.poll()).state, "pending");
  assert.equal((await pollen.poll()).state, "connected");
  assert.equal(pollen.status().state, "connected");
});

test("spending without a key is refused before any request", async () => {
  const { calls, fetchImpl } = fakeNetwork(() => chat("hi"));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  await assert.rejects(() => pollen.ask({ prompt: "hello" }), (error) => error.code === "auth");
  assert.equal(calls.length, 0);
});

test("a rewrite carries the user key, the model and both messages", async () => {
  const { calls, fetchImpl } = fakeNetwork(() => chat("A plainer sentence."));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  pollen.useKey("sk_user");

  const text = await pollen.ask({ system: "remove the tells", prompt: "delve into it" });
  assert.equal(text, "A plainer sentence.");

  const request = JSON.parse(calls[0].options.body);
  assert.equal(calls[0].url, "https://gen.pollinations.ai/v1/chat/completions");
  assert.equal(calls[0].options.headers.Authorization, "Bearer sk_user");
  assert.equal(request.model, "openai/gpt-5.4-nano");
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.messages[0].content, "remove the tells");
  assert.equal(request.messages[1].content, "delve into it");
  assert.equal(request.temperature, 0.4);
});

test("the model can be chosen per request", async () => {
  const { calls, fetchImpl } = fakeNetwork(() => chat("ok"));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  pollen.useKey("sk_user");
  await pollen.ask({ prompt: "hello", model: "some/other-model" });
  assert.equal(JSON.parse(calls[0].options.body).model, "some/other-model");
});

test("a spent balance is reported as quota", async () => {
  const { fetchImpl } = fakeNetwork(() => ({
    status: 402,
    body: { error: { message: "not enough pollen" } },
  }));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  pollen.useKey("sk_user");
  await assert.rejects(
    () => pollen.ask({ prompt: "hi" }),
    (error) => error.code === "quota" && /not enough pollen/.test(error.message),
  );
});

test("a rejected key is reported as auth", async () => {
  const { fetchImpl } = fakeNetwork(() => ({ status: 401, body: { error: "invalid key" } }));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  pollen.useKey("sk_user");
  await assert.rejects(() => pollen.ask({ prompt: "hi" }), (error) => error.code === "auth");
});

test("keys are validated and signing out forgets them", () => {
  const { fetchImpl } = fakeNetwork(() => chat("ok"));
  const pollen = createPollen({ fetchImpl, store: createMemoryStore() });
  assert.throws(() => pollen.useKey("pk_nope"), /not an sk_ key/);
  pollen.useKey(" sk_user ");
  assert.equal(pollen.status().state, "connected");
  assert.equal(pollen.signOut().state, "signed-out");
  assert.equal(pollen.status().state, "signed-out");
});

test("an expired device code is not polled", async () => {
  const store = createMemoryStore();
  store.set("deslop.device", "dev-1");
  store.set("deslop.until", "0");
  const { calls, fetchImpl } = fakeNetwork(() => chat("ok"));
  const pollen = createPollen({ fetchImpl, store });
  assert.equal((await pollen.poll()).state, "expired");
  assert.equal(calls.length, 0);
});
