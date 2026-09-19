#!/usr/bin/env node
/**
 * Monologue cards — the content engine.
 *
 * Ghost Light's growth problem is impressions, not conversion (169 in 90 days; see
 * docs/growth/README.md). ASO moves the App Store number. This moves the other one:
 * social traffic, generated from the thing we already own that nobody else has —
 * roughly 7,000 monologues that are unambiguously free to publish anywhere.
 *
 * Produces a 1080×1350 card (Instagram / TikTok portrait) in the app's own visual
 * language, plus a caption file, per monologue.
 *
 * THE COPYRIGHT RULE, WHICH IS NOT NEGOTIABLE:
 *
 * Two filters, and you need both.
 *
 * 1. `copyright_status = public_domain`, applied server-side and asserted again
 *    before render. Do not "just this once" a Tennessee Williams.
 *
 * 2. `year_written <= 1900` (--before to override), because filter 1 is not
 *    enough. That column is US-centric: US copyright runs from publication, so
 *    Noël Coward's Hay Fever (1925) went public domain there in 2021 and is
 *    flagged `public_domain` in our database — while the UK and EU run life+70
 *    from the author's death, and Coward died in 1973, so it is protected there
 *    until 2043. Instagram is not a US-only venue. Worse, several of those rows
 *    were transcribed from a Samuel French Acting Edition, and acting editions
 *    carry their own layer of rights over the setting and any emendations.
 *    Samuel French is the single most litigious rights-holder in this industry.
 *
 *    A pre-1900 play has an author who died long enough ago to be clear in every
 *    jurisdiction that matters. Shakespeare, Webster, Ibsen, Chekhov, Wilde and
 *    Brandon Thomas all survive the cut; Coward and O'Neill do not, and that is
 *    the filter working rather than the filter being too blunt.
 *
 *    The app itself is a different question with a different answer — a licensed,
 *    paywalled catalogue is not a public Instagram post. This limit is about what
 *    we broadcast, not about what we hold.
 *
 *   node scripts/cards.mjs --count 7
 *   node scripts/cards.mjs --count 1 --png          # needs playwright
 *   node scripts/cards.mjs --count 5 --seed 2026-09-19
 *   node scripts/cards.mjs --fixture tmp/rows.json  # render without network
 *
 * Output lands in content/cards/ as <slug>.svg + <slug>.txt.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { argv } from 'node:process';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://ppvqmbzuqvzpiuqaiqfy.supabase.co';
const SUPABASE_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_6X-B4xO0C0ndogzqzy8RAw_BJETJmsh';

/** Straight from src/theme/tokens.ts. Change one, change the other. */
const C = {
  stage: '#130b08',
  glow: '#e0731f',
  primary: '#c24e10',
  paper: '#f3eee6',
  ink: '#15110f',
  body: '#221c19',
  muted: '#5a5450',
  faint: '#897e74',
  rule: '#dad3c8',
  yellow: '#f2e22b',
};

const W = 1080;
const H = 1350;

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

/** See the copyright note at the top before you raise this. */
const DEFAULT_YEAR_CUTOFF = 1900;

function args() {
  const out = {
    count: 7,
    out: 'content/cards',
    png: false,
    seed: null,
    before: DEFAULT_YEAR_CUTOFF,
    fixture: null,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--png') out.png = true;
    else if (a === '--count') out.count = Number(argv[++i]);
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--seed') out.seed = argv[++i];
    else if (a === '--before') out.before = Number(argv[++i]);
    else if (a === '--fixture') out.fixture = argv[++i];
  }
  if (!Number.isFinite(out.count) || out.count < 1) out.count = 7;
  if (!Number.isFinite(out.before)) out.before = DEFAULT_YEAR_CUTOFF;
  return out;
}

/**
 * Deterministic PRNG. A scheduled weekly run seeded on the ISO week produces the
 * same batch if it is re-run, which means a retry after a network blip does not
 * silently burn seven different monologues and leave gaps in the queue.
 */
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

async function fetchCandidates(before) {
  // PostgREST embeds the joined play so copyright_status and year arrive with the
  // row and can be re-asserted at render time rather than trusted from the query.
  const params = new URLSearchParams({
    select:
      'id,title,character_name,text,word_count,estimated_duration_seconds,primary_emotion,tone,character_gender,character_age_range,overdone_score,plays!inner(title,author,year_written,copyright_status,source_type)',
    'plays.copyright_status': 'eq.public_domain',
    'plays.year_written': `lte.${before}`,
    word_count: 'gte.70',
    order: 'id.asc',
    limit: '1200',
  });
  // Keep the excerpt from being a fragment of something enormous, and skip the
  // warhorses — the whole pitch is that we surface what nobody else is doing.
  params.append('word_count', 'lte.320');
  params.append('overdone_score', 'lt.0.35');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/monologues?${params}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * A translator's footnote apparatus: "The grizzly Vale-King (*) comes ... (*) The
 * German is, Thalvogt, Ruler of the Valley--the name given figuratively to ..."
 *
 * The marker is repairable; the footnote body that follows is not, because it is
 * unmarked prose that looks exactly like speech. Rather than guess where the play
 * stops and the scholarship starts, drop the row. There are roughly 7,000 eligible
 * monologues and we need seven a week — a quality gate costs us nothing here, and
 * a card with a footnote about Swiss weather on it costs us the post.
 */
const HAS_FOOTNOTES = /\((?:\*|\+|†|\d)\)|\[\s*(?:\*|\d+)\s*\]/;

/** Every filter, applied to whatever source the rows came from. */
function eligible(rows, before) {
  return rows.filter(
    (r) =>
      r.plays?.copyright_status === 'public_domain' &&
      Number.isFinite(r.plays?.year_written) &&
      r.plays.year_written <= before &&
      typeof r.text === 'string' &&
      r.character_name &&
      r.plays.title &&
      !HAS_FOOTNOTES.test(r.text) &&
      scrub(r.text).length > 200,
  );
}

/**
 * Strip the bibliography that lives inside `text` on a good number of rows.
 *
 * The corpus was scraped from sources that ran the citation straight on from the
 * speech with no delimiter, so the raw field ends things like:
 *
 *   "...as some witty line tickles their fancy. Noel Coward. Hay Fever . London:
 *    Samuel French Acting Edition. p.11."
 *   "...I use but half a blush in't. John Webster, The Duchess of Malfi Act 1,
 *    Sc.2, ll.374-392."
 *
 * On a card that reads as part of the monologue, which is both wrong and, in the
 * Samuel French case, an advertisement for the fact that we took it from their
 * edition. The app should get this fixed at the source; until then, here.
 */
function scrub(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();

  // Every parenthetical and bracketed group goes. In this corpus they are, without
  // exception worth preserving, one of three things that do not belong on a card:
  //
  //   another character's line  "(DUNCAN: O valiant cousin!)"
  //   a stage direction         "(Exeunt Prince and Attendants; ...)" "(Knocking.)"
  //   a blocking note           "(Jack looks at her in amazement.)"
  //
  // An earlier version enumerated the forms — uppercase-name-colon, then a list of
  // direction verbs — and missed the third kind, because "Jack looks at her" is
  // neither. Matching the punctuation rather than the content is the rule that
  // does not need extending every time the scrape turns up a new phrasing.
  t = t.replace(/\([^)]*\)/g, ' ').replace(/\[[^\]]*\]/g, ' ');

  // A bare trailing direction, which sometimes runs on with no bracket at all.
  t = t.replace(/\s*(?:Enter|Exeunt|Exit)\s+[A-Z][^.]{0,60}\.?\s*$/, '');

  const cuts = [
    // "London: Samuel French Acting Edition. p.11." and relatives
    /\s*[A-Z][^.]{0,40}\.\s*[A-Z][\w' ]+\s*\.\s*(London|New York|Chicago)\s*:.*$/,
    // "Act 1, Sc.2, ll.374-392." / "Act II, Scene 3."
    /\s*Act\s+[IVXLC\d]+\s*,?\s*(Sc(ene)?\.?\s*[IVXLC\d]+)?\s*,?\s*(ll?\.\s*[\d-–]+)?\s*\.?\s*$/i,
    // A trailing "Author Name, Play Title" with no sentence of its own
    /\s*[A-Z][a-z]+\s+[A-Z][a-z]+,\s+The\s+[A-Z][\w' ]+\s*$/,
    // Bare page refs
    /\s*p{1,2}\.\s*\d+\s*\.?\s*$/i,
  ];
  for (const re of cuts) t = t.replace(re, '');
  // Trailing em-dash the scrape left where the citation used to begin
  return t.replace(/\s*[-–—]{1,3}\s*$/, '').trim();
}

// ---------------------------------------------------------------------------
// Excerpt
// ---------------------------------------------------------------------------

/**
 * Courier is monospace at a 0.6em advance, so wrapping is exact arithmetic rather
 * than a guess — which is the entire reason the card is set in it and not in a
 * proportional face. No measurement pass, no headless browser needed to lay out.
 */
const ADVANCE = 0.6;

function wrap(text, fontSize, maxWidth) {
  const cols = Math.floor(maxWidth / (fontSize * ADVANCE));
  const lines = [];
  for (const para of text.split(/\n+/)) {
    let line = '';
    for (const word of para.trim().split(/\s+/)) {
      if (!word) continue;
      if (line.length + word.length + (line ? 1 : 0) <= cols) {
        line += (line ? ' ' : '') + word;
      } else {
        if (line) lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * Take enough to be worth reading and stop somewhere that sounds deliberate.
 * Prefers a sentence end inside the last third of the allowance; otherwise cuts
 * clean and lets the ellipsis do the work of saying there is more in the app.
 */
function excerpt(text, maxLines, fontSize, maxWidth) {
  const all = wrap(text, fontSize, maxWidth);
  if (all.length <= maxLines) return { lines: all, truncated: false };

  const window = all.slice(0, maxLines);
  for (let i = window.length - 1; i >= Math.floor(maxLines * 0.6); i--) {
    if (/[.!?]["')\]]?$/.test(window[i])) {
      return { lines: window.slice(0, i + 1), truncated: true };
    }
  }
  const last = window[window.length - 1].replace(/[,;:\s]+$/, '');
  return { lines: [...window.slice(0, -1), `${last}…`], truncated: true };
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function titleCase(s) {
  return String(s)
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

function card(m) {
  const play = m.plays;
  const PAD = 72;
  const CARD_X = PAD;
  const CARD_Y = 210;
  const CARD_W = W - PAD * 2;
  const CARD_H = 900;
  const TEXT_X = CARD_X + 64;
  const TEXT_W = CARD_W - 128;

  const FS = 30;
  const LH = 46;
  const maxLines = Math.floor((CARD_H - 250) / LH);
  const { lines, truncated } = excerpt(scrub(m.text), maxLines, FS, TEXT_W);

  const character = titleCase(m.character_name);
  const byline = `${play.title}${play.author ? ` · ${play.author}` : ''}${
    play.year_written ? ` · ${play.year_written}` : ''
  }`;

  const mins = m.estimated_duration_seconds
    ? `${Math.max(1, Math.round(m.estimated_duration_seconds / 60))} MIN`
    : null;
  // "1 MIN · JOYFUL · 20S" read as twenty seconds sitting next to one minute.
  // The age range needs the word or it is just a second duration on the same line.
  const age = m.character_age_range && !/^any$/i.test(m.character_age_range)
    ? `AGE ${m.character_age_range}`
    : null;
  const meta = [mins, m.tone && titleCase(m.tone).toUpperCase(), age]
    .filter(Boolean)
    .join('   ·   ');

  const body = lines
    .map(
      (ln, i) =>
        `<text x="${TEXT_X}" y="${CARD_Y + 170 + i * LH}" font-family="'Courier Prime','Courier New',monospace" font-size="${FS}" fill="${C.body}">${esc(ln)}</text>`,
    )
    .join('\n    ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="spot" cx="50%" cy="34%" r="62%">
      <stop offset="0%"   stop-color="${C.glow}" stop-opacity="0.16"/>
      <stop offset="32%"  stop-color="${C.glow}" stop-opacity="0.07"/>
      <stop offset="68%"  stop-color="${C.glow}" stop-opacity="0"/>
    </radialGradient>
    <!-- The halo has to fall off. A flat circle at 0.14 reads as a brown disc
         painted on the backdrop — an object, not light. -->
    <radialGradient id="halo">
      <stop offset="0%"   stop-color="${C.glow}" stop-opacity="0.55"/>
      <stop offset="35%"  stop-color="${C.glow}" stop-opacity="0.16"/>
      <stop offset="100%" stop-color="${C.glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.stage}"/>
  <rect width="${W}" height="${H}" fill="url(#spot)"/>

  <!-- the bulb -->
  <line x1="${W / 2}" y1="104" x2="${W / 2}" y2="162" stroke="#4a4038" stroke-width="3"/>
  <circle cx="${W / 2}" cy="104" r="72" fill="url(#halo)"/>
  <circle cx="${W / 2}" cy="104" r="8"  fill="#ffd9a8"/>

  <!-- hard offset shadow: a two-colour print, misregistered -->
  <rect x="${CARD_X + 10}" y="${CARD_Y + 10}" width="${CARD_W}" height="${CARD_H}" rx="6" fill="${C.yellow}"/>
  <rect x="${CARD_X}" y="${CARD_Y}" width="${CARD_W}" height="${CARD_H}" rx="6"
        fill="${C.paper}" stroke="${C.ink}" stroke-width="3"/>

  <text x="${TEXT_X}" y="${CARD_Y + 78}" font-family="'Playfair Display',Georgia,serif"
        font-size="54" font-weight="700" fill="${C.ink}">${esc(character)}</text>
  <text x="${TEXT_X}" y="${CARD_Y + 118}" font-family="Montserrat,Helvetica,sans-serif"
        font-size="24" fill="${C.muted}">${esc(byline)}</text>
  <line x1="${TEXT_X}" y1="${CARD_Y + 140}" x2="${CARD_X + CARD_W - 64}" y2="${CARD_Y + 140}"
        stroke="${C.rule}" stroke-width="2"/>

    ${body}

  ${
    meta
      ? `<text x="${TEXT_X}" y="${CARD_Y + CARD_H - 44}" font-family="Montserrat,Helvetica,sans-serif"
        font-size="21" letter-spacing="2" fill="${C.faint}">${esc(meta)}</text>`
      : ''
  }

  <text x="${W / 2}" y="${H - 96}" text-anchor="middle" font-family="Montserrat,Helvetica,sans-serif"
        font-size="26" font-weight="600" letter-spacing="4" fill="${C.glow}">GHOST LIGHT</text>
  <text x="${W / 2}" y="${H - 58}" text-anchor="middle" font-family="Montserrat,Helvetica,sans-serif"
        font-size="21" letter-spacing="1" fill="#b5ada3">${
          truncated ? 'Full piece in the app · free to read' : '19,000+ monologues · iOS'
        }</text>
</svg>`;
}

// ---------------------------------------------------------------------------
// Caption
// ---------------------------------------------------------------------------

const TAGS =
  '#acting #actorslife #monologue #audition #auditionprep #theatre #actor #drama #shakespeare #actorsofinstagram #castingcall #theatrekid #dramaschool #auditionmonologue #performingarts';

function caption(m) {
  const play = m.plays;
  const who = titleCase(m.character_name);
  const mins = m.estimated_duration_seconds
    ? `${Math.max(1, Math.round(m.estimated_duration_seconds / 60))}-minute`
    : null;

  // Leads with the use, not the trivia. An actor scrolling is triaging for "could
  // I take this into a room on Friday", and the answer has to be in line one.
  const hook = [
    mins ? `A ${mins} piece` : 'A piece',
    m.character_age_range ? `for ${m.character_age_range}` : null,
    m.tone ? `· ${String(m.tone).toLowerCase()}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return `${hook}.

${who} — ${play.title}${play.author ? `, ${play.author}` : ''}${
    play.year_written ? ` (${play.year_written})` : ''
  }.

Public domain, so it's yours to use. And it's nowhere near as overdone as the one you were going to bring.

Full text free in Ghost Light — 19,000+ monologues you can filter by age, gender, length and tone. Link in bio.

${TAGS}
`;
}

// ---------------------------------------------------------------------------
// PNG (optional)
// ---------------------------------------------------------------------------

async function toPng(svgFiles, outDir) {
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    console.log('\n  --png needs playwright: npm i -D playwright');
    return;
  }
  // GHOSTLIGHT_CHROMIUM lets a machine with a Chromium that Playwright did not
  // install itself point at it — CI images and the Claude Code remote sandbox both
  // ship one at a build number the npm package does not expect. Unset on a normal
  // Mac checkout, where `npx playwright install` has put one where it belongs.
  const executablePath = process.env.GHOSTLIGHT_CHROMIUM || undefined;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const { svg, slug } of svgFiles) {
    await page.setContent(
      `<body style="margin:0">${svg}</body>`,
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: path.join(outDir, `${slug}.png`) });
  }
  await browser.close();
  console.log(`  rendered ${svgFiles.length} png`);
}

// ---------------------------------------------------------------------------

async function main() {
  const opts = args();
  const seed = opts.seed ?? new Date().toISOString().slice(0, 10);

  console.log(`Ghost Light cards · seed ${seed} · public domain, written ≤ ${opts.before}`);

  const raw = opts.fixture
    ? JSON.parse(await readFile(opts.fixture, 'utf8'))
    : await fetchCandidates(opts.before);
  const pool = eligible(raw, opts.before);

  if (!pool.length) throw new Error('No eligible candidates. Check the filters before loosening them.');
  const dropped = raw.length - pool.length;
  console.log(`  ${pool.length} eligible${dropped ? ` (${dropped} dropped: rights or unclean text)` : ''}`);

  const rand = rng(seed);
  const picked = [];
  const seenPlays = new Set();
  const seenAuthors = new Set();
  // One per play AND one per author. Without the author rule a batch skews
  // Shakespeare — he is 2,064 of roughly 7,000 eligible rows, so a third of every
  // week would be him, and "we surface what nobody else is doing" is a hard pitch
  // to make over seven straight days of Shakespeare.
  for (let guard = 0; picked.length < opts.count && guard < pool.length * 8; guard++) {
    const m = pool[Math.floor(rand() * pool.length)];
    const author = m.plays.author ?? m.plays.title;
    if (seenPlays.has(m.plays.title) || seenAuthors.has(author)) continue;
    seenPlays.add(m.plays.title);
    seenAuthors.add(author);
    picked.push(m);
  }
  if (picked.length < opts.count) {
    console.log(`  note: only ${picked.length} distinct authors available for this seed`);
  }

  await mkdir(opts.out, { recursive: true });
  const svgs = [];

  for (const m of picked) {
    if (m.plays.copyright_status !== 'public_domain') continue; // belt and braces
    const slug = `${seed}-${String(m.plays.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}-${m.id}`;
    const svg = card(m);
    await writeFile(path.join(opts.out, `${slug}.svg`), svg);
    await writeFile(path.join(opts.out, `${slug}.txt`), caption(m));
    svgs.push({ svg, slug });
    console.log(`  ✓ ${titleCase(m.character_name)} — ${m.plays.title}`);
  }

  if (opts.png) await toPng(svgs, opts.out);
  console.log(`\n${svgs.length} cards → ${opts.out}/`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
