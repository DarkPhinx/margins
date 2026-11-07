import { findReferences } from '../bible/refParser';
import type { VerseRange } from '../bible/types';
import type { RichDoc, RichNode } from './types';

export const emptyDoc = (): RichDoc => ({ type: 'doc', content: [{ type: 'paragraph' }] });

export function docFromText(text: string): RichDoc {
  const paragraphs = text.split(/\n{2,}|\n/);
  return {
    type: 'doc',
    content: paragraphs.map((p) => (p ? { type: 'paragraph', content: [{ type: 'text', text: p }] } : { type: 'paragraph' })),
  };
}

const BLOCKS = new Set(['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock']);

/** Plain text, one line per paragraph or list item. */
export function textOf(doc: RichDoc | RichNode | null | undefined): string {
  if (!doc) return '';
  const lines: string[] = [];
  let line = '';
  const walk = (node: RichNode | RichDoc) => {
    const n = node as RichNode;
    if (n.type === 'text') line += n.text ?? '';
    else if (n.type === 'hardBreak') line += '\n';
    for (const child of n.content ?? []) walk(child);
    if (BLOCKS.has(n.type) && !(n.content ?? []).some((c) => BLOCKS.has(c.type) || c.type.endsWith('List'))) {
      lines.push(line);
      line = '';
    }
  };
  walk(doc);
  if (line) lines.push(line);
  return lines.join('\n').trim();
}

export function refsIn(text: string): VerseRange[] {
  return findReferences(text).map((r) => r.range);
}

/** The first line of text, shortened, for lists. */
export function firstLine(text: string, max = 140): string {
  const line = text.split('\n').find((l) => l.trim()) ?? '';
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

export function todayLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
