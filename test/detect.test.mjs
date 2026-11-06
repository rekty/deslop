import assert from "node:assert/strict";
import test from "node:test";

import { analyze, countWords, sentences, verdict } from "../shared/detect.js";

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
