// detector.js, the dark-pattern detector, running entirely in the browser.
//
// Two engines, mirroring the Python backend:
//   1. a heuristic pass (regex / keyword rules), fast, high precision
//   2. a learning pass, the trained scikit-learn classifier, exported to
//      model.json, with inference reimplemented here in plain JS
//
// The classifier maths replicates sklearn's TfidfVectorizer (word + char_wb
// n-grams, sublinear tf, per-vectoriser L2 norm) feeding a LogisticRegression.
// It's verified to match the Python model (see parity test).

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic engine (faithful port of detector.py's rules)
// ─────────────────────────────────────────────────────────────────────────────

const HEURISTICS = [
  {
    category: "Urgency & Scarcity",
    severity: "high",
    patterns: [
      /only \d+ (?:left|remaining|in stock)/i,
      /hurry[,!]/i, /act (?:fast|now)/i, /limited time/i,
      /(?:selling|going) (?:out )?fast/i, /last chance/i,
      /ends (?:in|tonight|today|soon)/i, /\d+ people (?:are )?(?:viewing|looking)/i,
      /while supplies last/i, /before (?:it'?s|they'?re) gone/i,
    ],
    recommendation: "Check the same offer elsewhere, urgency claims are often fabricated.",
  },
  {
    category: "Confirmshaming",
    severity: "high",
    patterns: [
      /no[, ]+(?:thanks?[, ]+)?i (?:don'?t|do not|hate|prefer|would rather|like)/i,
      /i'?d rather (?:not|miss|pay)/i,
      /no[, ]+i('?ll| will)? (?:pass|stay|keep)/i,
      /keep me (?:poor|uninformed)/i,
    ],
    recommendation: "Declining an offer is always valid, ignore the guilt-tripping language.",
  },
  {
    category: "Roach Motel",
    severity: "medium",
    patterns: [
      /to cancel.{0,30}(?:call|phone|email|contact|visit|mail)/i,
      /cancellation (?:requires|fee|by phone|by mail)/i,
      /(?:unsubscribe|close your account).{0,30}(?:call|phone|written|mail|agent|representative)/i,
      /cancellation fee/i, /early termination/i,
    ],
    recommendation: "Before subscribing, search '[service] how to cancel' and check the process.",
  },
  {
    category: "Privacy Zuckering",
    severity: "medium",
    patterns: [
      /share your (?:data|information|details).{0,30}(?:partners|third part)/i,
      /(?:sell|sold) (?:your )?(?:data|information).{0,20}(?:advertis|partner|third)/i,
      /consent to (?:data collection|tracking)/i,
      /personalize ads/i, /selected partners/i,
    ],
    recommendation: "Look for a granular opt-out. Bundled 'agree to all' consent is a red flag.",
  },
  {
    category: "Hidden Costs",
    severity: "medium",
    patterns: [
      /(?:booking|service|handling|convenience|processing|admin\w*) fee/i,
      /(?:excludes?|plus|additional|extra) (?:taxes|fees|charges|shipping)/i,
      /before taxes and fees/i, /resort fee/i,
    ],
    recommendation: "Watch the final total at checkout, fees are often added late.",
  },
  {
    category: "Forced Continuity",
    severity: "medium",
    patterns: [
      /free for \d+ days?,? then/i, /free trial/i,
      /(?:billed|charged) automatically/i, /auto-?renews?/i,
      /renews? (?:automatically|at full price)/i,
      /cancel before.{0,20}trial/i,
    ],
    recommendation: "Note the renewal date and price before starting any free trial.",
  },
  {
    category: "Trick Questions",
    severity: "medium",
    patterns: [
      /uncheck.{0,30}(?:if you|to)/i, /do not (?:un)?(?:check|tick)/i,
      /leave (?:ticked|checked|blank)/i, /untick to/i,
    ],
    recommendation: "Re-read opt-out checkboxes carefully, the wording is often deliberately confusing.",
  },
  {
    category: "Social Proof Manipulation",
    severity: "low",
    patterns: [
      /join (?:over )?[\d,]+ (?:happy )?(?:customers|users|people)/i,
      /trusted by [\d,]+/i,
      /\b\w+ from \w+ just (?:purchased|bought|signed)/i,
      /someone (?:just|nearby) (?:purchased|bought|signed up)/i,
      /\d+% of (?:users|people) (?:recommend|choose)/i,
    ],
    recommendation: "Treat live 'someone just bought this' notices skeptically, many are fake.",
  },
  {
    category: "Disguised Ads",
    severity: "low",
    // Word-boundary ad tokens only, must NOT match Bootstrap's navbar-brand.
    patterns: [
      /(?:^|[-_ ])(?:native-?ad|sponsored|advertorial|promoted|partner-content)(?:$|[-_ ])/i,
    ],
    recommendation: "Sponsored content dressed as editorial, check for an 'ad' or 'sponsored' label.",
  },
];

function runHeuristics(text) {
  const found = [];
  for (const rule of HEURISTICS) {
    const hits = [];
    for (const re of rule.patterns) {
      const m = text.match(re);
      if (m) hits.push(m[0].trim());
    }
    if (hits.length) {
      found.push({
        category: rule.category,
        severity: rule.severity,
        source: "heuristic",
        confidence: null,
        evidence: [...new Set(hits)].slice(0, 4),
        recommendation: rule.recommendation,
      });
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Classifier inference (replicates the exported sklearn pipeline)
// ─────────────────────────────────────────────────────────────────────────────

let MODEL = null;

async function loadModel(url = "model.json") {
  if (MODEL) return MODEL;
  const resp = await fetch(url);
  MODEL = await resp.json();
  return MODEL;
}

// Word tokens: sklearn default token_pattern (?u)\b\w\w+\b, lowercased.
function wordTokens(text) {
  return (text.toLowerCase().match(/\b\w\w+\b/gu) || []);
}

function wordNgrams(text, [minN, maxN]) {
  const toks = wordTokens(text);
  const grams = [];
  for (let n = minN; n <= maxN; n++) {
    for (let i = 0; i + n <= toks.length; i++) {
      grams.push(toks.slice(i, i + n).join(" "));
    }
  }
  return grams;
}

// char_wb: pad each whitespace-token with spaces, slide n-grams within it.
function charWbNgrams(text, [minN, maxN]) {
  const collapsed = text.toLowerCase().replace(/\s+/g, " ").trim();
  const grams = [];
  for (const raw of collapsed.split(" ")) {
    if (!raw) continue;
    const w = " " + raw + " ";
    for (let n = minN; n <= maxN; n++) {
      if (w.length < n) continue;
      for (let off = 0; off + n <= w.length; off++) {
        grams.push(w.slice(off, off + n));
      }
    }
  }
  return grams;
}

// Build one vectoriser's sparse, L2-normalised tf-idf vector as {index: value}.
function tfidfVector(grams, vec) {
  const counts = new Map();
  for (const g of grams) {
    const idx = vec.vocabulary[g];
    if (idx === undefined) continue;
    counts.set(idx, (counts.get(idx) || 0) + 1);
  }
  const weights = new Map();
  let normSq = 0;
  for (const [idx, count] of counts) {
    const tf = vec.sublinear_tf ? 1 + Math.log(count) : count;
    const w = tf * vec.idf[idx];
    weights.set(idx, w);
    normSq += w * w;
  }
  const norm = Math.sqrt(normSq) || 1;
  for (const [idx, w] of weights) weights.set(idx, w / norm);
  return weights;
}

function softmax(scores) {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// Classify a single short text span. Returns {label, confidence, proba{}}.
function classifySpan(text) {
  if (!MODEL) throw new Error("model not loaded");
  const wordVec = tfidfVector(wordNgrams(text, MODEL.word.ngram_range), MODEL.word);
  const charVec = tfidfVector(charWbNgrams(text, MODEL.char.ngram_range), MODEL.char);

  const nWord = MODEL.n_word;
  const scores = MODEL.classes.map((_, c) => {
    const coef = MODEL.coef[c];
    let dot = MODEL.intercept[c];
    for (const [idx, w] of wordVec) dot += w * coef[idx];
    for (const [idx, w] of charVec) dot += w * coef[nWord + idx];
    return dot;
  });

  // sklearn multinomial LR uses softmax over class scores.
  const proba = softmax(scores);
  let best = 0;
  for (let i = 1; i < proba.length; i++) if (proba[i] > proba[best]) best = i;
  const out = {};
  MODEL.classes.forEach((cls, i) => { out[cls] = proba[i]; });
  return { label: MODEL.classes[best], confidence: proba[best], proba: out };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API: analyse text or HTML the way the backend does
// ─────────────────────────────────────────────────────────────────────────────

const ML_THRESHOLD = 0.55;

// Pull candidate UI spans out of HTML (mirrors segmenter.py). For plain text,
// each non-empty line is a span.
function extractSpans(input) {
  const MAX_SPANS = 400; // matches the backend segmenter; guards huge pastes
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(input);
  if (!looksLikeHtml) {
    return input.split(/\n+/).map((s) => s.trim())
      .filter((s) => s.length >= 3 && s.length <= 240)
      .slice(0, MAX_SPANS);
  }
  const doc = new DOMParser().parseFromString(input, "text/html");
  doc.querySelectorAll("script,style,noscript,svg,head").forEach((n) => n.remove());
  const tags = "button,a,label,h1,h2,h3,h4,li,p,span,strong,summary";
  const seen = new Set();
  const spans = [];
  for (const el of doc.querySelectorAll(tags)) {
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (t.length < 3 || t.length > 240) continue;
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    spans.push(t);
    if (spans.length >= MAX_SPANS) break;
  }
  return spans;
}

function plainText(input) {
  const looksLikeHtml = /<[a-z][\s\S]*>/i.test(input);
  if (!looksLikeHtml) return input;
  const doc = new DOMParser().parseFromString(input, "text/html");
  return doc.body ? doc.body.textContent : input;
}

// Main entry point. Returns { riskLevel, score, detections[] }.
function analyse(input) {
  const text = plainText(input);
  const heuristic = runHeuristics(text);
  const heuristicCats = new Set(heuristic.map((d) => d.category));

  // ML pass over spans, grouped by category, skipping categories heuristics
  // already flagged (same merge rule as the backend).
  const spans = extractSpans(input);
  const mlByCat = {};
  for (const span of spans) {
    const { label, confidence } = classifySpan(span);
    if (label === "benign" || confidence < ML_THRESHOLD) continue;
    if (heuristicCats.has(label)) continue;
    (mlByCat[label] = mlByCat[label] || []).push({ span, confidence });
  }

  const mlDetections = Object.entries(mlByCat).map(([category, hits]) => {
    hits.sort((a, b) => b.confidence - a.confidence);
    const top = hits[0].confidence;
    return {
      category,
      severity: top >= 0.8 ? "high" : top >= 0.65 ? "medium" : "low",
      source: "ml",
      confidence: top,
      evidence: hits.slice(0, 4).map((h) => `"${h.span}" (${Math.round(h.confidence * 100)}%)`),
      recommendation: "Flagged by the learning model, not a fixed rule, likely a novel or reworded instance.",
    };
  });

  const detections = [...heuristic, ...mlDetections];

  // Simple severity score, same spirit as the backend.
  const weights = { high: 30, medium: 15, low: 6 };
  let score = detections.reduce((s, d) => s + (weights[d.severity] || 0), 0);
  score = Math.min(100, score);
  const riskLevel =
    detections.length === 0 ? "clean" :
    score >= 60 ? "critical" :
    score >= 35 ? "high" :
    score >= 15 ? "medium" : "low";

  return { riskLevel, score, detections };
}

// Exposed for the parity test (Node) and the UI (browser).
if (typeof module !== "undefined" && module.exports) {
  module.exports = { loadModel, classifySpan, analyse, _setModel: (m) => { MODEL = m; } };
}
