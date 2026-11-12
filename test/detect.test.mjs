import assert from "node:assert/strict";
import test from "node:test";

import {
  analyze,
  countWords,
  sentences,
  verdict,
  cleanRewrite,
  isWrapped,
  rewriteWithRetry,
  isVerifiedModel,
  VERIFIED_MODELS,
  STRICT_RETRY,
} from "../shared/detect.js";

const SLOP = `In today's fast-paced world, writing has become a tapestry of tools and techniques. Language models don't just generate text—they produce a voice, a rhythm, a signature. It is important to note that this voice is not merely a stylistic choice but a window into the model's training. Furthermore, these models leverage vast datasets to deliver seamless, robust, and holistic output. Let's dive into why this matters. On one hand, the voice is useful; on the other hand, it can be exhausting. Ultimately, the key takeaway is that removing the LLM voice is crucial for authentic communication. In conclusion, it is worth noting that deliberate revision, careful attention, and honest editing can unlock a more human tone.`;

const PLAIN = `The train left at six. I walked home along the canal because the bus was full. My sister called about the leak under the sink. We argued for ten minutes about who should pay for it.`;

test("empty input scores zero and reports nothing", () => {
  for (const value of ["", "   ", "\n\n", null, undefined]) {
    const result = analyze(value);
    assert.equal(result.score, 0);
    assert.equal(result.words, 0);
    assert.deepEqual(result.hits, []);
  }
});

test("a sloppy draft lands in the top band", () => {
  const result = analyze(SLOP);
  assert.ok(result.score >= 70, `score was ${result.score}`);
  assert.ok(result.hits.length >= 6, `only ${result.hits.length} tells`);
  assert.equal(verdict(result.score).tone, "bad");
});

test("plain prose stays far below it", () => {
  const result = analyze(PLAIN);
  assert.ok(result.score <= 15, `score was ${result.score}`);
  assert.equal(verdict(result.score).tone, "ok");
});

test("the same draft always scores the same", () => {
  assert.deepEqual(analyze(SLOP), analyze(SLOP));
});

test("each tell is counted with the text that triggered it", () => {
  const result = analyze("We delve into it. Then we delve again, and delve once more.");
  const delve = result.hits.find((hit) => hit.id === "delve");
  assert.ok(delve);
  assert.equal(delve.count, 3);
  assert.match(delve.samples[0], /delve/i);
});

test('"not just X, but Y" is caught in both spellings', () => {
  const straight = analyze("It is not just a tool but a habit.");
  assert.ok(straight.hits.some((hit) => hit.id === "not-just"));

  const contracted = analyze("Models don't just answer, they perform.");
  const hit = contracted.hits.find((item) => item.id === "not-just");
  assert.ok(hit);
  assert.equal(hit.count, 1);
});

test("em dashes are counted and capped", () => {
  const many = analyze(`a—b ${"c—d ".repeat(12)}`);
  const hit = many.hits.find((item) => item.id === "em-dash");
  assert.ok(hit);
  assert.equal(hit.count, 13);
  assert.equal(hit.points, 3);
  assert.equal(many.score, 100);
});

test("even sentence lengths are called out", () => {
  const even = analyze("The cat sat on the mat. The dog ran in the park. The bird sang in the tree. The fish swam in the pond. The cow stood in the field.");
  assert.ok(even.hits.some((hit) => hit.id === "monotone"));
});

test("scores stay inside 0-100 for hostile input", () => {
  const wall = analyze("crucial crucial crucial tapestry delve delve not only A but also B — — — ".repeat(200));
  assert.ok(wall.score <= 100);
  assert.ok(wall.score >= 0);
});

test("words, sentences and verdicts behave", () => {
  assert.equal(countWords("  one two   three "), 3);
  assert.equal(sentences("One. Two? Three!").length, 3);
  assert.equal(verdict(0).tone, "ok");
  assert.equal(verdict(50).tone, "warn");
  assert.equal(verdict(90).tone, "bad");
});

/* ---------- rewrite wrapper handling ---------- */

const PASSAGE = "We shipped the scanner on Tuesday. It found four tells in the draft and the rewrite dropped two of them, which is roughly what we expected for a first pass.";

const plain = (text = PASSAGE) => text;
const fenced = (text = PASSAGE) => "```\n" + text + "\n```";
const preambled = (text = PASSAGE) => "Here is the rewritten passage:\n\n" + text;

const answer = (texts) => {
  let call = 0;
  const prompts = [];
  return {
    prompts,
    send: async (prompt) => {
      prompts.push(prompt);
      const text = texts[Math.min(call, texts.length - 1)];
      call += 1;
      return text;
    },
  };
};

test("cleanRewrite strips fences, preambles and wrapping quotes", () => {
  assert.equal(cleanRewrite(fenced()), PASSAGE);
  assert.equal(cleanRewrite(preambled()), PASSAGE);
  assert.equal(cleanRewrite('"' + PASSAGE + '"'), PASSAGE);
  assert.equal(cleanRewrite("  \n" + PASSAGE + "\n  "), PASSAGE);
  assert.equal(cleanRewrite(""), "");
});

test("cleanRewrite leaves a clean passage untouched", () => {
  assert.equal(cleanRewrite(PASSAGE), PASSAGE);
  assert.equal(isWrapped(PASSAGE, cleanRewrite(PASSAGE)), false);
});

test("a wrapped answer is detected before any retry is spent", () => {
  assert.equal(isWrapped(fenced(), cleanRewrite(fenced())), true);
  assert.equal(isWrapped(preambled(), cleanRewrite(preambled())), true);
});

test("a clean first answer is never retried", async () => {
  const fake = answer([plain()]);
  const out = await rewriteWithRetry({ send: fake.send, prompt: "Draft: x" });
  assert.equal(fake.prompts.length, 1);
  assert.equal(out.attempts, 1);
  assert.equal(out.text, PASSAGE);
  assert.equal(out.recovered, false);
});

test("a wrapped answer triggers exactly one stricter retry and uses the recovery", async () => {
  const fake = answer([fenced(), plain("Second answer, clean.")]);
  const out = await rewriteWithRetry({ send: fake.send, prompt: "Draft: x" });
  assert.equal(fake.prompts.length, 2);
  assert.equal(out.attempts, 2);
  assert.equal(out.recovered, true);
  assert.equal(out.retryFailed, false);
  assert.ok(!out.text.includes("```"), "the chosen text is the cleaned one");
  assert.match(fake.prompts[1], new RegExp(STRICT_RETRY.slice(0, 24)));
});

test("a model that keeps wrapping is charged once, not looped", async () => {
  const fake = answer([fenced(), fenced("Still wrapped.")]);
  const out = await rewriteWithRetry({ send: fake.send, prompt: "Draft: x" });
  assert.equal(fake.prompts.length, 2, "two attempts, never a third");
  assert.equal(out.retryFailed, true);
  assert.equal(out.text, PASSAGE, "the first passage is shown, cleaned");
});

test("rewrite refuses to run without a prompt", async () => {
  await assert.rejects(() => rewriteWithRetry({ send: async () => PASSAGE }), /prompt/);
});

const SLOP_DRAFT = "In today's fast-paced world, this is not just a tool but a tapestry of seamless, robust, and holistic output. It is important to note that we delve into the landscape. I hope this helps!";

test("a rewrite that barely improves triggers one quality retry and keeps the better text", async () => {
  const fake = answer([plain(SLOP_DRAFT), plain("We tried the tool on Tuesday. It worked.")]);
  const before = analyze(SLOP_DRAFT).score;
  const out = await rewriteWithRetry({ send: fake.send, prompt: "Draft: " + SLOP_DRAFT, beforeScore: before });
  assert.equal(fake.prompts.length, 2);
  assert.equal(out.qualityRetry, true);
  assert.match(fake.prompts[1], /still reads like a model wrote it|copies|Earlier answer was not JSON|Wrong shape/i);
  assert.ok(out.text.length > 0);
  assert.ok(out.scores.filter((s) => s != null).length >= 2);
});

test("a rewrite that already drops the score is not retried for quality", async () => {
  const fake = answer([plain("Short. Plain. Done."), plain("We tried it. It worked.")]);
  const out = await rewriteWithRetry({ send: fake.send, prompt: "Draft: " + SLOP_DRAFT, beforeScore: 95 });
  assert.equal(fake.prompts.length, 1, "no second call when the improvement is already there");
  assert.equal(out.qualityRetry, false);
});

test("the measured models are the two that were actually verified", () => {
  assert.deepEqual(VERIFIED_MODELS, ["openai/gpt-5.4-nano", "z-ai/glm-5.3-flash"]);
  assert.equal(isVerifiedModel("openai/gpt-5.4-nano"), true);
  assert.equal(isVerifiedModel("some/other-model"), false);
  assert.equal(isVerifiedModel(undefined), false);
});
