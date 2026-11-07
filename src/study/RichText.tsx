import { Fragment, type ReactNode } from 'react';
import { findReferences } from '../bible/refParser';
import { RefLink } from './RefLink';
import type { RichDoc, RichNode } from './types';

/** Splits text into plain runs and reference links. */
function withReferences(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let pos = 0;
  for (const ref of findReferences(text)) {
    if (ref.index > pos) out.push(text.slice(pos, ref.index));
    out.push(<RefLink key={`${key}-${ref.index}`} text={ref.text} range={ref.range} chapterOnly={ref.chapterOnly} />);
    pos = ref.index + ref.length;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

function renderNode(node: RichNode, key: string): ReactNode {
  const kids = () => (node.content ?? []).map((c, i) => renderNode(c, `${key}.${i}`));
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{kids()}</p>;
    case 'bulletList':
      return <ul key={key}>{kids()}</ul>;
    case 'orderedList':
      return <ol key={key}>{kids()}</ol>;
    case 'listItem':
      return <li key={key}>{kids()}</li>;
    case 'blockquote':
      return <blockquote key={key}>{kids()}</blockquote>;
    case 'hardBreak':
      return <br key={key} />;
    case 'text': {
      let el: ReactNode = <Fragment key={key}>{withReferences(node.text ?? '', key)}</Fragment>;
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') el = <strong key={key}>{el}</strong>;
        else if (mark.type === 'italic') el = <em key={key}>{el}</em>;
        else if (mark.type === 'strike') el = <s key={key}>{el}</s>;
        else if (mark.type === 'underline') el = <u key={key}>{el}</u>;
      }
      return el;
    }
    default:
      return <Fragment key={key}>{kids()}</Fragment>;
  }
}

/** Shows saved note text, with every verse reference as a link. */
export function RichText({ doc, className }: { doc: RichDoc | null; className?: string }) {
  return <div className={className ?? 'rich-text'}>{(doc?.content ?? []).map((n, i) => renderNode(n, String(i)))}</div>;
}
