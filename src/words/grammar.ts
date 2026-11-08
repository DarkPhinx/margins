/**
 * Plain-English grammar from STEPBible's codes: Greek Robinson codes
 * ("V-AAI-3S", "N-NSM") and Hebrew OpenScriptures codes ("HVqp3ms", "HNcfsa",
 * "HC/Vqw3ms"). Anything not recognised is shown as the code itself.
 */

const G_POS: Record<string, string> = {
  N: 'noun', V: 'verb', A: 'adjective', T: 'article', P: 'personal pronoun', R: 'relative pronoun',
  C: 'reciprocal pronoun', D: 'demonstrative pronoun', K: 'correlative pronoun', I: 'interrogative pronoun',
  X: 'indefinite pronoun', Q: 'correlative or interrogative pronoun', F: 'reflexive pronoun', S: 'possessive pronoun',
  ADV: 'adverb', CONJ: 'conjunction', COND: 'conditional', PRT: 'particle', PREP: 'preposition', INJ: 'interjection',
  ARAM: 'Aramaic word', HEB: 'Hebrew word', 'N-PRI': 'proper noun', 'A-NUI': 'number', 'N-LI': 'letter', 'N-OI': 'noun (indeclinable)',
};
const G_CASE: Record<string, string> = { N: 'nominative', G: 'genitive', D: 'dative', A: 'accusative', V: 'vocative' };
const G_NUM: Record<string, string> = { S: 'singular', P: 'plural' };
const G_GEN: Record<string, string> = { M: 'masculine', F: 'feminine', N: 'neuter' };
const G_TENSE: Record<string, string> = { P: 'present', I: 'imperfect', F: 'future', A: 'aorist', R: 'perfect', L: 'pluperfect', '2A': 'second aorist', '2R': 'second perfect', '2F': 'second future' };
const G_VOICE: Record<string, string> = { A: 'active', M: 'middle', P: 'passive', E: 'middle or passive', D: 'middle deponent', O: 'passive deponent', N: 'middle or passive deponent' };
const G_MOOD: Record<string, string> = { I: 'indicative', S: 'subjunctive', O: 'optative', M: 'imperative', N: 'infinitive', P: 'participle' };
const PERSON: Record<string, string> = { '1': '1st person', '2': '2nd person', '3': '3rd person' };

function greek(code: string): string {
  const parts = code.split('-');
  const head = parts[0] ?? '';
  if (G_POS[code]) return G_POS[code]!;
  if (head === 'V') {
    const tvm = parts[1] ?? '';
    const m = /^(2?[PIFARL])([AMPEDON])([ISOMNP])$/.exec(tvm);
    const out = ['verb'];
    if (m) out.push(G_TENSE[m[1]!] ?? m[1]!, G_VOICE[m[2]!] ?? m[2]!, G_MOOD[m[3]!] ?? m[3]!);
    const rest = parts[2] ?? '';
    const pn = /^([123])([SP])$/.exec(rest);
    if (pn) out.push(`${PERSON[pn[1]!]} ${G_NUM[pn[2]!]}`);
    const cng = /^([NGDAV])([SP])([MFN])$/.exec(rest);
    if (cng) out.push(G_CASE[cng[1]!]!, G_NUM[cng[2]!]!, G_GEN[cng[3]!]!);
    return out.join(', ');
  }
  const pos = G_POS[head];
  if (!pos) return code;
  const out = [pos];
  for (const p of parts.slice(1)) {
    const cng = /^([123])?([NGDAV])([SP])([MFN])?$/.exec(p);
    if (cng) {
      if (cng[1]) out.push(PERSON[cng[1]]!);
      out.push(G_CASE[cng[2]!]!, G_NUM[cng[3]!]!);
      if (cng[4]) out.push(G_GEN[cng[4]]!);
    } else if (p === 'C') out.push('comparative');
    else if (p === 'S') out.push('superlative');
  }
  return out.join(', ');
}

const H_POS: Record<string, string> = {
  A: 'adjective', C: 'conjunction', D: 'adverb', N: 'noun', P: 'pronoun', R: 'preposition', S: 'suffix',
  T: 'particle', V: 'verb',
};
const H_STEM: Record<string, string> = {
  q: 'Qal', N: 'Niphal', p: 'Piel', P: 'Pual', h: 'Hiphil', H: 'Hophal', t: 'Hithpael', o: 'Polel', O: 'Polal',
  r: 'Hithpolel', m: 'Poel', M: 'Poal', k: 'Palel', K: 'Pulal', Q: 'Qal passive', l: 'Pilpel', L: 'Polpal',
  f: 'Hithpalpel', D: 'Nithpael', j: 'Pealal', i: 'Pilel', u: 'Hothpaal', c: 'Tiphil', v: 'Hishtaphel',
  w: 'Nithpalel', y: 'Nithpoel', z: 'Hithpoel',
};
const H_FORM: Record<string, string> = {
  p: 'perfect', q: 'sequential perfect', i: 'imperfect', w: 'sequential imperfect', h: 'cohortative', j: 'jussive',
  v: 'imperative', r: 'participle', s: 'passive participle', a: 'infinitive absolute', c: 'infinitive construct',
};
const H_GEN: Record<string, string> = { m: 'masculine', f: 'feminine', b: 'both genders', c: 'common' };
const H_NUM: Record<string, string> = { s: 'singular', p: 'plural', d: 'dual' };
const H_STATE: Record<string, string> = { a: 'absolute', c: 'construct', d: 'determined' };
const H_SUB: Record<string, Record<string, string>> = {
  N: { c: 'common', g: 'gentilic', p: 'proper name' },
  A: { a: 'adjective', c: 'cardinal number', g: 'gentilic', o: 'ordinal number' },
  P: { d: 'demonstrative', f: 'indefinite', i: 'interrogative', p: 'personal', r: 'relative' },
  T: { a: 'affirmation', d: 'definite article', e: 'exhortation', i: 'interrogative', j: 'interjection', m: 'demonstrative', n: 'negative', o: 'direct object marker', r: 'relative' },
  S: { d: 'directional he', h: 'paragogic he', n: 'paragogic nun', p: 'pronoun suffix' },
  R: { d: 'definite article' },
};

function hebrewPart(part: string): string {
  const pos = part[0] ?? '';
  const name = H_POS[pos];
  if (!name) return part;
  const rest = part.slice(1);
  if (pos === 'V') {
    const stem = H_STEM[rest[0] ?? ''];
    const form = H_FORM[rest[1] ?? ''];
    const pgn = rest.slice(2);
    const out = ['verb'];
    if (stem) out.push(stem);
    if (form) out.push(form);
    const m = /^([123])?([mfbc])?([spd])?([acd])?$/.exec(pgn);
    if (m) {
      if (m[1]) out.push(PERSON[m[1]]!);
      if (m[2]) out.push(H_GEN[m[2]]!);
      if (m[3]) out.push(H_NUM[m[3]]!);
      if (m[4]) out.push(H_STATE[m[4]]!);
    }
    return out.join(' ');
  }
  const sub = H_SUB[pos]?.[rest[0] ?? ''];
  // "common noun", "personal pronoun"; particles, numbers and suffixes read best by their kind alone.
  const label = !sub ? name : pos === 'N' && sub === 'proper name' ? 'proper name' : pos === 'N' || pos === 'P' ? `${sub} ${name}` : sub;
  const out = [label];
  const m = /^[a-z]?([123])?([mfbc])?([spd])?([acd])?$/.exec(rest);
  if (m && pos !== 'T' && pos !== 'R' && pos !== 'C' && pos !== 'D') {
    if (m[1]) out.push(PERSON[m[1]]!);
    if (m[2]) out.push(H_GEN[m[2]]!);
    if (m[3]) out.push(H_NUM[m[3]]!);
    if (m[4]) out.push(H_STATE[m[4]]!);
  }
  return out.join(' ');
}

function hebrew(code: string): string {
  const aramaic = code.startsWith('A');
  const parts = code.slice(1).split('/');
  const text = parts.map(hebrewPart).join(' + ');
  return aramaic ? `Aramaic: ${text}` : text;
}

/** "V-AAI-3S" → "verb, aorist, active, indicative, 3rd person singular". */
export function describeGrammar(code: string): string {
  if (!code) return '';
  // Greek codes are either listed words (ADV, CONJ, ARAM) or have hyphens; Hebrew/Aramaic start H or A + a part of speech.
  if (G_POS[code] || code.includes('-')) return greek(code);
  if (/^[HA][ACDNPRSTV]/.test(code)) return hebrew(code);
  return code;
}
