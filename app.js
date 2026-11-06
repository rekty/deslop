import { analyze, countWords, verdict } from "./shared/detect.js";
import { createPollen, DEFAULT_MODEL, ENDPOINTS } from "./shared/pollen.js";

const $ = (id) => document.getElementById(id);

const pollen = createPollen();

const state = {
  result: null,
  rewrite: "",
  after: null,
  device: null,
  timer: 0,
};

const SAMPLE = `In today's fast-paced world, writing has become a tapestry of tools and techniques. Language models don't just generate text—they produce a voice, a rhythm, a signature. It is important to note that this voice is not merely a stylistic choice but a window into the model's training. Furthermore, these models leverage vast datasets to deliver seamless, robust, and holistic output. Let's dive into why this matters. On one hand, the voice is useful; on the other hand, it can be exhausting. Ultimately, the key takeaway is that removing the LLM voice is crucial for authentic communication. In conclusion, it is worth noting that deliberate revision, careful attention, and honest editing can unlock a more human tone.`;

const SYSTEM = [
  "You remove the LLM voice from a draft: the recognisable style of prose written by language models.",
  "Keep every fact, name, number, claim and any Markdown structure. Keep the length within about fifteen percent. Add nothing new.",
  'Drop these constructions when they appear: "not just X, but Y", "not only … but also", rule-of-three lists that only pad, em dashes used as commas, "delve", "tapestry", "testament", "in today\'s fast-paced world", "let\'s dive in", "it is important to note", "in conclusion", "the key takeaway", "serves as", and marketing verbs such as journey, unlock, elevate, supercharge.',
  "Do not add an opening line, a closing summary or any commentary about the rewrite. Vary sentence length. Prefer concrete nouns and active verbs.",
  "Reply with the rewritten text only.",
].join(" ");

function say(id, text, bad = false) {
  const element = $(id);
  element.textContent = text;
  element.classList.toggle("bad", bad);
}

function tone(element, value) {
  element.classList.remove("tone-bad", "tone-warn", "tone-ok");
  element.classList.add(`tone-${value}`);
}

/* ---------- scan ---------- */

function renderScan() {
  const result = state.result;
  const words = result ? result.words : 0;
  const found = result ? result.hits : [];

  $("count").textContent = `${countWords($("draft").value)} words`;

  $("score").textContent = String(result ? result.score : 0);
  tone($("score-card"), result ? verdict(result.score).tone : "ok");

  if (!words) {
    $("verdict").textContent = "Nothing to scan yet";
    $("score-note").textContent = "Paste text and the tells appear below.";
  } else {
    const rates = verdict(result.score);
    $("verdict").textContent = rates.label;
    const hits = found.length;
    $("score-note").textContent = hits
      ? `${hits} ${hits === 1 ? "tell" : "tells"} in ${words} words · ${result.metrics.sentences} sentences, ${result.metrics.averageSentence} words each on average.`
      : `${words} words with none of the ${found.length || "known"} tells. Average sentence: ${result.metrics.averageSentence} words.`;
  }

  const list = $("tells");
  if (!found.length) {
    const item = document.createElement("li");
    item.className = "empty";
    item.textContent = words
      ? "No tells matched. That is the point of the scan: nothing to fix."
      : "The tells are listed here after you paste something.";
    list.replaceChildren(item);
    $("tells-note").textContent = "Ordered by how much each one drags the score up.";
    return;
  }

  $("tells-note").textContent = "Ordered by how much each one drags the score up.";
  list.replaceChildren(
    ...found.map((hit) => {
      const item = document.createElement("li");
      const what = document.createElement("div");
      what.className = "what";

      const name = document.createElement("span");
      name.textContent = hit.label;

      const times = document.createElement("span");
      times.className = "times";
      times.textContent = `${hit.count}×`;

      what.append(name, times);

      const why = document.createElement("p");
      why.className = "why";
      why.textContent = hit.why;

      item.append(what, why);

      for (const sample of hit.samples.slice(0, 2)) {
        const text = document.createElement("p");
        text.className = "sample";
        text.textContent = `“${sample}”`;
        item.append(text);
      }
      return item;
    }),
  );
}

let scanTimer = 0;
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    state.result = analyze($("draft").value);
    renderScan();
  }, 180);
}

$("draft").addEventListener("input", scheduleScan);

$("sample").onclick = () => {
  $("draft").value = SAMPLE;
  state.result = analyze(SAMPLE);
  renderScan();
};

$("clear").onclick = () => {
  $("draft").value = "";
  state.result = analyze("");
  renderScan();
  $("out").textContent = "";
  $("after-card").hidden = true;
  $("copy").hidden = true;
  $("use").hidden = true;
  say("status", "");
};

/* ---------- sign in ---------- */

function renderAuth() {
  const connected = pollen.status().state === "connected";
  $("auth-title").textContent = connected ? "Connected — your Pollen is paying" : "Not connected";
  $("auth-note").textContent = connected
    ? "The rewrite spends your own key. Disconnect whenever you like."
    : "The scan works without signing in. Only the rewrite needs Pollen.";
  $("auth-connect").hidden = connected;
  $("auth-out").hidden = !connected;
  $("auth-device").hidden = !state.device;
  $("go").disabled = false;
}

async function pollDevice() {
  const result = await pollen.poll();
  if (result.state === "pending") return;
  state.device = null;
  clearInterval(state.timer);
  if (result.state === "error") $("auth-note").textContent = `Sign-in failed: ${result.message}`;
  renderAuth();
}

$("auth-connect").onclick = async () => {
  $("auth-connect").disabled = true;
  try {
    state.device = await pollen.connect();
    $("auth-code").textContent = state.device.userCode;
    $("auth-open").onclick = () => window.open(state.device.verify, "_blank", "noopener");
    state.timer = setInterval(pollDevice, Math.max(state.device.interval || 5000, 3000));
    renderAuth();
  } catch (error) {
    say("status", `Sign-in failed: ${error.message}`, true);
  } finally {
    $("auth-connect").disabled = false;
  }
};

$("auth-out").onclick = () => {
  clearInterval(state.timer);
  state.device = null;
  pollen.signOut();
  renderAuth();
};

$("auth-use").onclick = () => {
  try {
    pollen.useKey($("auth-key").value);
    $("auth-key").value = "";
    renderAuth();
    say("status", "Key accepted. Press Deslop it.");
  } catch (error) {
    say("status", error.message, true);
  }
};

/* ---------- models ---------- */

async function loadModels() {
  const select = $("model");
  select.replaceChildren(new Option(DEFAULT_MODEL, DEFAULT_MODEL));

  try {
    const response = await fetch(`${ENDPOINTS.gen}/models`);
    if (!response.ok) return;
    const body = await response.json();
    const list = Array.isArray(body) ? body : (body?.data ?? body?.models ?? []);
    const ids = list
      .map((entry) => (typeof entry === "string" ? entry : entry?.id || entry?.name))
      .filter((id) => typeof id === "string" && id.includes("/"))
      .slice(0, 24);
    if (!ids.includes(DEFAULT_MODEL)) ids.unshift(DEFAULT_MODEL);
    select.replaceChildren(...ids.map((id) => new Option(id, id)));
    select.value = DEFAULT_MODEL;
  } catch {
    /* the default is enough; a failed list must not break the page */
  }
}

/* ---------- rewrite ---------- */

function promptFor(draft, result) {
  const tells = (result?.hits ?? []).slice(0, 8).map((hit) => hit.label);
  const note = tells.length ? `A local check found these tells: ${tells.join("; ")}.\n\n` : "";
  return `${note}Draft:\n"""\n${draft}\n"""`;
}

$("go").onclick = async () => {
  const draft = $("draft").value.trim();
  if (!draft) {
    say("status", "Nothing to rewrite yet.", true);
    return;
  }
  if (pollen.status().state !== "connected") {
    say("status", "Connect your Pollen first: the rewrite is the only paid step.", true);
    return;
  }

  $("go").disabled = true;
  say("status", "Rewriting…");
  $("after-card").hidden = true;

  try {
    state.rewrite = await pollen.ask({
      system: SYSTEM,
      prompt: promptFor(draft, state.result),
      model: $("model").value || DEFAULT_MODEL,
      maxTokens: Math.max(600, Math.min(2000, Math.round(countWords(draft) * 3))),
    });

    $("out").textContent = state.rewrite;
    $("copy").hidden = false;
    $("use").hidden = false;

    state.after = analyze(state.rewrite);
    $("after-card").hidden = false;
    $("after-score").textContent = String(state.after.score);
    tone($("after-card"), verdict(state.after.score).tone);
    $("after-verdict").textContent = verdict(state.after.score).label;

    const before = state.result?.score ?? 0;
    const delta = before - state.after.score;
    $("after-note").textContent =
      delta > 0
        ? `${before} → ${state.after.score}: ${delta} points of LLM voice gone.`
        : `Same tells or new ones (${before} → ${state.after.score}). Run it again or edit by hand.`;

    say("status", state.after.hits.length ? `Left: ${state.after.hits.map((hit) => hit.label).slice(0, 3).join(", ")}.` : "Clean by the same rules.");
  } catch (error) {
    const message =
      error?.code === "auth"
        ? "That key was rejected. Connect again or paste a fresh sk_ key."
        : error?.code === "quota"
          ? "That key is out of Pollen."
          : error?.message || "the request failed";
    say("status", message, true);
  } finally {
    $("go").disabled = false;
  }
};

$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(state.rewrite);
    say("status", "Copied.");
  } catch {
    say("status", "Select the text and copy it by hand.", true);
  }
};

$("use").onclick = () => {
  $("draft").value = state.rewrite;
  state.result = analyze(state.rewrite);
  renderScan();
  say("status", "The rewrite is now your draft. Run the scan again to see what is left.");
};

/* ---------- boot ---------- */

renderAuth();
renderScan();
loadModels();

if (location.hash === "#demo") {
  $("draft").value = SAMPLE;
  state.result = analyze(SAMPLE);
  renderScan();
}
