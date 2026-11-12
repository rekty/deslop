// The tells of the LLM voice, as patterns over plain text plus the reason each
// one reads like a machine wrote it. Pure functions, so the page and
// `node --test` score a draft with exactly the same arithmetic.

export const TELLS = [
  {
    id: "delve",
    label: "delve",
    why: "The word that gives a model away in one syllable.",
    weight: 3,
    cap: 2,
    patterns: [/\bdelv(?:e|es|ed|ing)\b/gi],
  },
  {
    id: "tapestry",
    label: "tapestry",
    why: "A metaphor models reach for when the subject is thin.",
    weight: 3,
    cap: 2,
    patterns: [/\btapestr(?:y|ies)\b/gi],
  },
  {
    id: "testament",
    label: "a testament to",
    why: "Ceremony where a sentence would do.",
    weight: 3,
    cap: 2,
    patterns: [/\btestament to\b/gi],
  },
  {
    id: "landscape",
    label: "landscape / realm / arena",
    why: "An abstract place standing in for a real subject.",
    weight: 2,
    cap: 3,
    patterns: [/\b(?:landscape|realm|arena|ecosystem)\b/gi],
  },
  {
    id: "not-just",
    label: "“not just X, but Y”",
    why: "The negation-then-upgrade frame a model uses as a thesis.",
    weight: 3,
    cap: 3,
    patterns: [
      /\bnot (?:just|only|merely)\b[^.!?\n]{2,70}?(?:\bbut\b|\bit'?s\b|\bit is\b|—|,)/gi,
      /\b(?:isn'?t|aren'?t|don'?t|doesn'?t|wasn'?t|won'?t) (?:just|only|merely)\b/gi,
    ],
  },
  {
    id: "not-only",
    label: "“not only … but also”",
    why: "A paired construction that pads a simple claim.",
    weight: 2.5,
    cap: 2,
    patterns: [/\bnot only\b[^.!?\n]{0,90}?\bbut also\b/gi],
  },
  {
    id: "fast-paced",
    label: "“in today’s fast-paced world”",
    why: "An opener that sets no scene.",
    weight: 3,
    cap: 2,
    patterns: [
      /\bin (?:today'?s|this) (?:fast[- ]paced|ever[- ]changing|digital|modern|hyper-?connected)\b/gi,
    ],
  },
  {
    id: "dive",
    label: "“let’s dive in”",
    why: "Narration of a dive that never happens.",
    weight: 2,
    cap: 2,
    patterns: [
      /\blet'?s (?:dive|unpack|explore|break (?:this|it) down)\b/gi,
      /\bdive (?:deep|into)\b/gi,
    ],
  },
  {
    id: "journey",
    label: "journey / unlock / elevate",
    why: "Marketing verbs dropped into ordinary prose.",
    weight: 2,
    cap: 3,
    patterns: [
      /\b(?:journey|unlock(?:s|ing)?|elevat(?:e|es|ing)|supercharg(?:e|es|ing)|game[- ]chang(?:er|ing))\b/gi,
    ],
  },
  {
    id: "crucial",
    label: "crucial / pivotal / vital role",
    why: "Importance asserted instead of shown.",
    weight: 1.5,
    cap: 3,
    patterns: [/\b(?:crucial|pivotal|paramount|indispensable)\b/gi],
  },
  {
    id: "seamless",
    label: "seamless / robust / leverage",
    why: "Adjectives that promise nothing measurable.",
    weight: 1.5,
    cap: 3,
    patterns: [
      /\b(?:seamless(?:ly)?|robust|holistic|synerg(?:y|ies|istic)|leverag(?:e|es|ing)|harness(?:es|ing)?)\b/gi,
    ],
  },
  {
    id: "hedge",
    label: "stacked hedges",
    why: "Two hedges in one breath, so nothing is claimed.",
    weight: 2,
    cap: 2,
    patterns: [
      /\b(?:may|might|could) (?:potentially|possibly|arguably|conceivably)\b/gi,
      /\bit (?:could|can) be argued\b/gi,
    ],
  },
  {
    id: "important-note",
    label: "“it’s important to note”",
    why: "A throat cleared before the point.",
    weight: 2,
    cap: 2,
    patterns: [
      /\bit (?:is|'s) (?:important|worth|crucial) (?:to note|noting)\b/gi,
      /\bneedless to say\b/gi,
    ],
  },
  {
    id: "conclusion",
    label: "“in conclusion” / “the key takeaway”",
    why: "A summary that repeats what the reader just read.",
    weight: 1.5,
    cap: 2,
    patterns: [
      /\b(?:in conclusion|in summary|to sum up|all in all|at the end of the day|the key takeaway)\b/gi,
    ],
  },
  {
    id: "serves-as",
    label: "“serves as” / “plays a vital role”",
    why: "A flat copula dressed up as significance.",
    weight: 2,
    cap: 2,
    patterns: [/\bserves? as\b/gi, /\bplays? (?:a|an) (?:vital|crucial|key|important) role\b/gi],
  },
  {
    id: "tricolon",
    label: "rule-of-three lists",
    why: "Three items whether or not the subject has three parts.",
    weight: 1,
    cap: 3,
    patterns: [/\b\w+, \w+, and \w+\b/g],
  },
  {
    id: "balanced",
    label: "“on one hand … on the other”",
    why: "Balance performed instead of a position taken.",
    weight: 1.5,
    cap: 1,
    patterns: [/\bon (?:the )?one hand\b[^.!?\n]{0,140}?\bon the other\b/gi],
  },
  {
    id: "filler",
    label: "filler adverbs",
    why: "Really, truly, simply: volume where there is no content.",
    weight: 0.5,
    cap: 6,
    patterns: [/\b(?:really|truly|simply|quite|remarkably|incredibly)\b/gi],
  },
];

// A few tells are about shape rather than wording, so they are measured.
const EM_DASH = { weight: 0.5, cap: 6 };
const MONOTONE = { weight: 2 };
const QUESTION = { weight: 0.5, cap: 2 };

// Points per 100 words become the 0-100 score. The factor is calibration, not
// precision: a sloppy draft lands near 100 and a plain one near zero.
const SCALE = 8;

export function countWords(text) {
  const trimmed = String(text || "").trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

export function sentences(text) {
  return String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function snippet(match) {
  const clean = match.replace(/\s+/g, " ").trim();
  return clean.length > 64 ? `${clean.slice(0, 61)}…` : clean;
}

/**
 * Score a draft and list what gave it away.
 * Returns { words, score, points, hits, metrics } and never throws on bad input.
 */
export function analyze(text) {
  const source = String(text || "");
  const words = countWords(source);

  if (!words) {
    return {
      words: 0,
      score: 0,
      points: 0,
      hits: [],
      metrics: { sentences: 0, averageSentence: 0, sentenceVariety: 0, emDashes: 0, questions: 0 },
    };
  }

  const hits = [];
  let points = 0;

  for (const tell of TELLS) {
    const samples = [];
    let count = 0;
    for (const pattern of tell.patterns) {
      pattern.lastIndex = 0;
      for (const match of source.matchAll(pattern)) {
        count += 1;
        if (samples.length < 3) samples.push(snippet(match[0]));
      }
    }
    if (!count) continue;
    const capped = Math.min(count, tell.cap ?? count);
    const contribution = capped * tell.weight;
    points += contribution;
    hits.push({ id: tell.id, label: tell.label, why: tell.why, count, points: round(contribution), samples });
  }

  const emDashes = (source.match(/—/g) || []).length;
  if (emDashes) {
    const contribution = Math.min(emDashes, EM_DASH.cap) * EM_DASH.weight;
    points += contribution;
    hits.push({
      id: "em-dash",
      label: "em dash used as a comma",
      why: "The punctuation tic that reads as a model mid-thought.",
      count: emDashes,
      points: round(contribution),
      samples: [snippet((source.match(/[^.!?\n]{0,30}—[^.!?\n]{0,30}/) || [""])[0])].filter(Boolean),
    });
  }

  const parts = sentences(source);
  const lengths = parts.map(countWords);
  const variety = stdev(lengths);
  const average = lengths.length ? lengths.reduce((sum, n) => sum + n, 0) / lengths.length : 0;

  if (lengths.length >= 5 && variety < 2.5) {
    points += MONOTONE.weight;
    hits.push({
      id: "monotone",
      label: "every sentence the same length",
      why: "Even rhythm is the clearest sign that no one read it aloud.",
      count: lengths.length,
      points: MONOTONE.weight,
      samples: [`average ${round(average)} words, variation ${round(variety)}`],
    });
  }

  const questions = parts.filter((sentence) => sentence.endsWith("?")).length;
  if (questions) {
    const contribution = Math.min(questions, QUESTION.cap) * QUESTION.weight;
    points += contribution;
    hits.push({
      id: "questions",
      label: "rhetorical questions",
      why: "A question the writer answers themselves is a stage cue.",
      count: questions,
      points: round(contribution),
      samples: parts.filter((sentence) => sentence.endsWith("?")).slice(0, 2).map(snippet),
    });
  }

  const density = (points / words) * 100;
  const score = Math.max(0, Math.min(100, Math.round(density * SCALE)));

  hits.sort((a, b) => b.points - a.points);

  return {
    words,
    score,
    points: round(points),
    hits,
    metrics: {
      sentences: parts.length,
      averageSentence: round(average),
      sentenceVariety: round(variety),
      emDashes,
      questions,
    },
  };
}

// Models measured against this app's own rewrite prompt. A model that answers with
// a preamble or a code fence costs the reader Pollen and still needs cleaning, so the
// picker says which ones were actually checked.
export const REWRITE_SYSTEM = [
  "You remove the LLM voice from a draft: the recognisable style of prose written by language models.",
  "Keep every fact, name, number, claim and any Markdown structure. Keep the length within about fifteen percent. Add nothing new.",
  "The passage between the DRAFT markers is the only text to rewrite. Never repeat the instruction, the list of tells or the markers in your answer.",
  'Drop these constructions when they appear: "not just X, but Y", "not only … but also", rule-of-three lists that only pad, em dashes used as commas, "delve", "tapestry", "testament", "in today\'s fast-paced world", "let\'s dive in", "it is important to note", "in conclusion", "the key takeaway", "serves as", and marketing verbs such as journey, unlock, elevate, supercharge.',
  "Do not reuse a sentence from the draft: only facts, names and numbers carry over. Write it again, shorter and plainer.",
  "Do not add an opening line, a closing summary or any commentary about the rewrite. Vary sentence length. Prefer concrete nouns and active verbs.",
  "Reply with the rewritten text only.",
].join(" ");

export const VERIFIED_MODELS = ["openai/gpt-5.4-nano", "z-ai/glm-5.3-flash"];

export function isVerifiedModel(id) {
  return VERIFIED_MODELS.includes(String(id || ""));
}

/** Strip what a chat model adds around a rewrite: fences, a preamble line, stray quotes. */
export function cleanRewrite(text) {
  let out = String(text == null ? "" : text).replace(/\r/g, "").trim();
  out = out.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
  // Models like to echo the brief they were given. Drop a leading restatement.
  out = out.replace(
    /^(?:a local check found|the local check found|tells found|the draft (?:currently )?shows|known tells|draft)\b[^\n]*\n+/i,
    "",
  );
  out = out.replace(/^(?:rewrite(?:d)? (?:the|this) (?:draft|passage)[^\n]*\n+)/i, "");
  out = out.replace(/^<<<DRAFT\s*\n?/i, "").replace(/\n?DRAFT>>>$/i, "").trim();
  out = out.replace(/^(?:here(?:'s| is) (?:the )?(?:rewrit(?:e|ten)[a-z ]*|version)[^:\n]*:\s*)/i, "").trim();
  out = out.replace(/^(?:rewritten(?: text| version)?\s*[-—:]\s*)/i, "").trim();
  const quoted = /^"([\s\S]*)"$/.exec(out) || /^“([\s\S]*)”$/.exec(out);
  if (quoted && quoted[1].length > 40) out = quoted[1].trim();
  return out;
}

export const STRICT_RETRY =
  "That answer added text around the rewrite. Reply again with only the rewritten passage: no preamble, no fence, no quotes around it, no commentary.";

/** Second-quality attempt: name what survived and forbid copying the draft. */
export function qualityRetryPrompt(remaining) {
  const list = remaining.length ? remaining.join(", ") : "the same model tics";
  return [
    STRICT_RETRY,
    `Your rewrite still reads like a model wrote it: it kept ${list}.`,
    "Write it again from scratch. Do not reuse any sentence from the draft or from your last answer — only the facts, names and numbers carry over.",
    "Short sentences are allowed. So are plain words.",
  ].join(" ");
}

/**
 * Run the rewrite, clean it, retry once when the model wraps its answer, and — when a
 * before-score is given — retry once more if the result barely improved. The best of
 * the attempts is returned, measured by the same rules that scored the draft.
 * `send(prompt)` is injected, so the whole policy is testable without a network call.
 */
export async function rewriteWithRetry({ send, prompt, beforeScore = null, minDrop = 25 }) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("rewrite needs a prompt");

  const attempts = [];
  const round = async (text) => {
    const raw = await send(text);
    const cleaned = cleanRewrite(raw);
    const result = cleaned ? analyze(cleaned) : null;
    return { raw, text: cleaned, wrapped: isWrapped(raw, cleaned), score: result ? result.score : null, hits: result ? result.hits : [] };
  };

  attempts.push(await round(prompt));
  const wrapperRetry = attempts[0].wrapped;
  if (wrapperRetry) attempts.push(await round(`${prompt}\n\n${STRICT_RETRY}`));

  const bestOf = (list) => list.filter((a) => a.text).sort((a, b) => (a.score ?? 100) - (b.score ?? 100))[0] || list[0];
  let best = bestOf(attempts);

  const qualityRetry =
    beforeScore != null && best.score != null && beforeScore - best.score < minDrop && attempts.length < 3;
  if (qualityRetry) {
    const remaining = (best.hits || []).map((hit) => hit.label).slice(0, 5);
    attempts.push(await round(`${prompt}\n\n${qualityRetryPrompt(remaining)}`));
    best = bestOf(attempts);
  }

  return {
    text: best.text,
    raw: best.raw,
    attempts: attempts.length,
    retryFailed: wrapperRetry && attempts[1].wrapped && attempts.every((a) => a.wrapped),
    recovered: wrapperRetry && !attempts[1].wrapped,
    qualityRetry,
    scores: attempts.map((a) => a.score),
  };
}

/** Did the model wrap the passage in commentary we had to cut away? */
export function isWrapped(raw, cleaned) {
  const source = String(raw || "").trim();
  if (!source) return false;
  if (/```/.test(source)) return true;
  if (/^(?:here(?:'s| is)|sure|certainly|of course|rewritten)/i.test(source)) return true;
  const cut = source.length - String(cleaned || "").length;
  return cut > 24;
}

export function verdict(score) {
  if (score >= 70) return { tone: "bad", label: "Reads like a model wrote it" };
  if (score >= 40) return { tone: "warn", label: "Model habits are showing" };
  if (score >= 15) return { tone: "warn", label: "A few tells left" };
  return { tone: "ok", label: "Mostly your own voice" };
}

function round(value) {
  return Math.round(value * 10) / 10;
}
