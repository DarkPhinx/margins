import { describe, expect, it } from 'vitest';
import indexData from '../src/generated/verse-index.json';
import { makeVerseId } from '../src/bible/verseId';
import {
  alignVerse,
  baseStrong,
  cleanDefinition,
  kjvPhrases,
  parseBsbTables,
  parseLexicon,
  parseTagged,
  type LexResult,
  type OrigResult,
  type OrigWord,
} from '../scripts/lib/words';
import { describeGrammar } from '../src/words/grammar';

const max = (indexData as { maxVerse: Record<string, number[]> }).maxVerse;
const v = makeVerseId;
const fresh = (): OrigResult => ({ verses: new Map(), alts: new Map(), words: 0, skippedRefs: [] });

describe('STEPBible tagged text', () => {
  it('reads Hebrew words: the main word in braces, prefixes and separators dropped', () => {
    const r = fresh();
    parseTagged(
      [
        'Gen.1.1#01=L\tבְּ/רֵאשִׁ֖ית\tbe./re.Shit\tin/ beginning\tH9003/{H7225G}\tHR/Ncfsa\t\t\tH7225G\t\t\t',
        "Gen.1.1#07=L\tהָ/אָֽרֶץ\\׃\tha./'A.retz\tthe/ earth\tH9009/{H0776G}\\H9016\tHTd/Ncbsa\t\t\tH0776G\t\t\t",
      ].join('\n'),
      max,
      r,
    );
    expect(r.verses.get(v('GEN', 1, 1))).toEqual([
      ['H7225G', 'בְּרֵאשִׁ֖ית', 'bereshit', 'in beginning', 'HR/Ncfsa'],
      ['H0776G', 'הָאָֽרֶץ׃', "ha'aretz", 'the earth', 'HTd/Ncbsa'],
    ]);
  });

  it('reads Greek words and keeps only the main editions', () => {
    const r = fresh();
    parseTagged(
      [
        'Jhn.3.16#03=NKO\tἠγάπησεν (ēgapēsen)\tloved\tG0025=V-AAI-3S\tἀγαπάω=to love\tNA28\t\t\t\t\t#03\tG0025\t',
        'Jhn.3.16#99=o\tτι (ti)\tsomething\tG5100=X-NSN\tτις=any\tO\t\t\t\t\t#99\tG5100\t',
      ].join('\n'),
      max,
      r,
    );
    expect(r.verses.get(v('JHN', 3, 16))).toEqual([['G0025', 'ἠγάπησεν', 'ēgapēsen', 'loved', 'V-AAI-3S']]);
  });

  it('puts a Psalm title (verse 0) at the start of verse 1, and uses bracketed numbers our Bibles have', () => {
    const r = fresh();
    parseTagged(
      [
        'Psa.3.1(3.2)#01=L\tיְהוָ֗ה\tYah.weh\tLORD\t{H3068G}\tHNpt\t\t\t\t\t',
        'Psa.3.0(3.1)#01=L\tמִזְמ֥וֹר\tmiz.Mor\tpsalm\t{H4210}\tHNcmsa\t\t\t\t\t',
        '3Jn.1.15[1.14]#01=NKO\tεἰρήνη (eirēnē)\tPeace\tG1515=N-NSF\tεἰρήνη=peace\tNA28\t\t\t\t\t#01\tG1515\t',
      ].join('\n'),
      max,
      r,
    );
    expect(r.verses.get(v('PSA', 3, 1))!.map((w) => w[0])).toEqual(['H4210', 'H3068G']);
    expect(r.verses.get(v('3JN', 1, 14))!.map((w) => w[0])).toEqual(['G1515']);
    expect(r.skippedRefs).toEqual([]);
  });

  it('keeps text the Leningrad codex lacks that STEP restores (Joshua 21:36), with no section marks', () => {
    const r = fresh();
    parseTagged(
      [
        'Jos.21.36#01=R\tוּ/מִ/מַּטֵּה\tu./mi./ma.Teh\tand/ from/ [the] tribe of\tH9002/H9006/{H4294}\tHC/R/Ncmsc\t\t\t\t\t',
        'Jos.21.37#10=R\tאַרְבַּֽע\\׃\\ \\ס\t\'ar.Ba\'\tfour\t{H0702}\\H9016\\H9018\tHAcbsa\t\t\t\t\t',
        'Jos.21.35#01=X\tx\tx\tx\t{H0001}\tHNcmsa\t\t\t\t\t',
      ].join('\n'),
      max,
      r,
    );
    expect(r.verses.get(v('JOS', 21, 36))!.map((w) => w[0])).toEqual(['H4294']);
    expect(r.verses.get(v('JOS', 21, 37))![0]![1]).toBe('אַרְבַּֽע׃');
    expect(r.verses.has(v('JOS', 21, 35))).toBe(false);
  });

  it('numbers verses as our Bibles do where STEP gives two numbers, checked against the BSB’s words', () => {
    const greek = (ref: string, n: number, word: string, strong: string, gloss = 'x') =>
      `${ref}#${String(n).padStart(2, '0')}=NKO\t${word} (x)\t${gloss}\t${strong}=X\tx=x\tNA28\t\t\t\t\t#01\t${strong}\t`;
    const bsb = new Map([
      [v('2CO', 13, 13), new Set(['G0782', 'G4771', 'G3588', 'G0040', 'G3956'])],
      [v('2CO', 13, 14), new Set(['G3588', 'G5485', 'G2962'])],
      [v('2CO', 13, 12), new Set(['G0782', 'G0240', 'G1722', 'G0040', 'G5370'])],
      [v('PHP', 1, 16), new Set(['G0026', 'G1492'])],
      [v('PHP', 1, 17), new Set(['G2052', 'G5547'])],
    ]);
    const r = fresh();
    parseTagged(
      [
        // 2 Cor 13:13–14 in our Bibles are 13:12b and 13:13 in Greek editions: the KJV's number.
        greek('2Co.13.12[13.13]', 6, 'Ἀσπάζονται', 'G0782', '[13] Greet'),
        greek('2Co.13.12[13.13]', 7, 'ὑμᾶς', 'G4771'),
        greek('2Co.13.13[13.14]', 1, 'Ἡ', 'G3588'),
        greek('2Co.13.13[13.14]', 2, 'χάρις', 'G5485'),
        // Philippians 1:16 is 1:17 in the KJV, which our BSB doesn't follow: the BSB's words decide.
        greek('Php.1.16[1.17]', 1, 'ἀγάπης', 'G0026'),
        greek('Php.1.16[1.17]', 2, 'εἰδότες', 'G1492', 'knowing.'),
      ].join('\n'),
      max,
      r,
      { bsb },
    );
    expect(r.verses.get(v('2CO', 13, 13))!.map((w) => w[3])).toEqual(['Greet', 'x']);
    expect(r.verses.get(v('2CO', 13, 14))!.map((w) => w[0])).toEqual(['G3588', 'G5485']);
    expect(r.verses.get(v('PHP', 1, 16))!.map((w) => w[3])).toEqual(['x', 'knowing']);
  });

  it('leaves out the notes on where a letter was written, but keeps a closing Amen', () => {
    const tr = (n: number, word: string, strong: string, type = 'K') =>
      `2Co.13.13[13.14]#${n}=${type}\t${word} (x)\tx\t${strong}=X\tx=x\tTR\t\t\t\t\t#${n}\t${strong}\t`;
    const r = fresh();
    parseTagged(
      [
        tr(20, 'ὑμῶν', 'G4771', 'NKO'),
        tr(21, 'ἀμήν¶', 'G0281', 'KO'),
        tr(22, 'πρός', 'G4314'),
        tr(23, 'Κορινθίους', 'G2881'),
        tr(24, 'ἐγράφη', 'G1125'),
        tr(25, 'Λουκᾶ¶', 'G3065'),
        'Gal.1.1#01=NKO\tΠαῦλος (Paulos)\tPaul\tG3972=N-NSM-P\tΠαῦλος=Paul\tNA28\t\t\t\t\t#01\tG3972\t',
      ].join('\n'),
      max,
      r,
    );
    expect(r.verses.get(v('2CO', 13, 14))!.map((w) => w[1])).toEqual(['ὑμῶν', 'ἀμήν']);
  });

  it('keeps the other Strong’s numbers a word is given, for lining up English', () => {
    const r = fresh();
    parseTagged('Jhn.1.1#03=NKO\tἦν (ēn)\twas\tG1510=V-IAI-3S\tεἰμί=to be\tNA28\t\t\t\t\t#03\tG1510_A\tG2258\t', max, r);
    expect(r.alts.get(v('JHN', 1, 1))).toEqual([['G1510', 'G2258']]);
  });
});

describe('lexicons', () => {
  it('reads entries by extended number, with the plain number mapped and "form of" links kept', () => {
    const lex: LexResult = { entries: new Map(), base: new Map(), formOf: new Map() };
    parseLexicon(
      [
        'H7225\tH7225G =\tH7225G\tרֵאשִׁית\tre.shit\tH:N-F\tfirst: beginning\t: beginning<br>1) first',
        'G2258\tG2258 = a Form of\tG1510\tἦν\tēn\tG:V\twas\t<b>εἰμί</b>',
      ].join('\n'),
      lex,
    );
    expect(lex.entries.get('H7225G')).toEqual({ l: 'רֵאשִׁית', t: 'reshit', m: 'H:N-F', g: 'first: beginning', d: ': beginning<br>1) first' });
    expect(lex.base.get('H7225')).toBe('H7225G');
    expect(lex.formOf.get('G2258')).toBe('G1510');
  });

  it('keeps bold, italics and line breaks, and turns STEP references into readable ones', () => {
    expect(cleanDefinition(" <b>love</b>, <BR />__1. to God, <ref='Rom.5.8'>Rom.5:8;</ref> <span>x</span>")).toBe(
      '<b>love</b>,<br>1. to God, Rom 5:8; x',
    );
  });
});

describe('lining English up with the original', () => {
  const words: OrigWord[] = [
    ['G3779', 'οὕτως', 'houtōs', 'Thus', 'ADV'],
    ['G1063', 'γὰρ', 'gar', 'for', 'CONJ'],
    ['G0025', 'ἠγάπησεν', 'ēgapēsen', 'loved', 'V-AAI-3S'],
    ['G3588', 'ὁ', 'ho', '<the>', 'T-NSM'],
    ['G2316', 'θεὸς', 'theos', 'God', 'N-NSM-T'],
  ];

  it('links each English phrase to the original word with its Strong’s number, in English order', () => {
    const text = 'For God so loved the world';
    const { links, missed } = alignVerse(
      text,
      [
        { text: 'For', strong: 'G1063' },
        { text: 'God', strong: 'G2316' },
        { text: 'so', strong: 'G3779' },
        { text: 'loved', strong: 'G0025' },
      ],
      words,
    );
    expect(missed).toBe(0);
    expect(links.map(([s, e, i]) => [text.slice(s, e), words[i]![0]])).toEqual([
      ['For', 'G1063'],
      ['God', 'G2316'],
      ['so', 'G3779'],
      ['loved', 'G0025'],
    ]);
  });

  it('matches a classic Strong’s number through the alternatives and "form of" links', () => {
    const text = 'In the beginning was the Word';
    const orig: OrigWord[] = [['G1510', 'ἦν', 'ēn', 'was', 'V-IAI-3S']];
    const viaAlt = alignVerse(text, [{ text: 'was', strong: 'G2258' }], orig, [['G1510', 'G2258']]);
    expect(viaAlt.links).toEqual([[17, 20, 0]]);
    const viaForm = alignVerse(text, [{ text: 'was', strong: 'G2258' }], orig, [], new Map([['G2258', 'G1510']]));
    expect(viaForm.links).toEqual([[17, 20, 0]]);
    expect(alignVerse(text, [{ text: 'was', strong: 'G2258' }], orig).missed).toBe(1);
  });

  it('skips a phrase it can’t find rather than forcing it', () => {
    const { links, missed } = alignVerse('For God so loved', [{ text: 'whale', strong: 'G0025' }], words);
    expect(links).toEqual([]);
    expect(missed).toBe(1);
  });
});

describe('BSB tables and KJV tags', () => {
  it('reads the BSB’s English phrases per verse, leaving out untranslated words', () => {
    const head = 'Heb Sort\tGreek Sort\tBSB Sort\tVerse\tLanguage\tW\tW\tTr\tP\tP\tStr Heb\tStr Grk\tVerseId\tH\tC\tP\tS\tbQ\tBSB version\tpnc\teQ\tfn\tEnd\n';
    const row = (lang: string, num: string, eng: string, verse = '') =>
      `0\t0\t0\t0\t${lang}\tx\tx\tx\tx\tx\t${lang === 'Hebrew' ? num : ''}\t${lang === 'Greek' ? num : ''}\t${verse}\t\t\t\t\t\t${eng}\t\t\t\t\n`;
    const tables = parseBsbTables(head + row('Greek', '1063', ' For ', 'John 3:16') + row('Greek', '3588', ' - ') + row('Greek', '3588', ' [His] '));
    expect(tables.get(v('JHN', 3, 16))).toEqual([
      { text: 'For', strong: 'G1063' },
      { text: 'His', strong: 'G3588' },
    ]);
  });

  it('reads the KJV’s tagged words per verse', () => {
    const usfm = '\\c 3\n\\v 16 \\w For|strong="G1063"\\w* \\w God|strong="G2316"\\w* so';
    expect(kjvPhrases(usfm, 'JHN').get(v('JHN', 3, 16))).toEqual([
      { text: 'For', strong: 'G1063' },
      { text: 'God', strong: 'G2316' },
    ]);
  });

  it('normalises Strong’s numbers', () => {
    expect(baseStrong('G25')).toBe('G0025');
    expect(baseStrong('H0430G')).toBe('H0430');
  });
});

describe('grammar in plain English', () => {
  it.each([
    ['V-AAI-3S', 'verb, aorist, active, indicative, 3rd person singular'],
    ['N-NSF', 'noun, nominative, singular, feminine'],
    ['ADV', 'adverb'],
    ['HVqp3ms', 'verb Qal perfect 3rd person masculine singular'],
    ['HTd/Ncmpa', 'definite article + common noun masculine plural absolute'],
    ['AVqp3ms', 'Aramaic: verb Qal perfect 3rd person masculine singular'],
  ])('%s', (code, text) => {
    expect(describeGrammar(code)).toBe(text);
  });
});
