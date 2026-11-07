import { Extension, EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { Node as PMNode } from '@tiptap/pm/model';
import { useEffect, useRef, useState } from 'react';
import { findReferences, formatRange } from '../bible/refParser';
import type { VerseRange } from '../bible/types';
import type { RichDoc } from './types';

/** The reference under a click in the editor, if any. */
function referenceAt(target: EventTarget | null): { range: VerseRange; chapterOnly: boolean } | null {
  const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('.ref-detected');
  if (!el) return null;
  const start = Number(el.dataset.refStart);
  const end = Number(el.dataset.refEnd);
  if (!start || !end) return null;
  return { range: { start, end }, chapterOnly: el.dataset.refChapter === '1' };
}

/** Underlines verse references while typing, so you can see they were recognised. */
function referenceDecorations(doc: PMNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    let text = '';
    const at: number[] = [];
    node.forEach((child, offset) => {
      if (child.isText) {
        for (let i = 0; i < child.text!.length; i++) at.push(pos + 1 + offset + i);
        text += child.text;
      } else {
        at.push(pos + 1 + offset);
        text += ' ';
      }
    });
    for (const ref of findReferences(text)) {
      const from = at[ref.index];
      const last = at[ref.index + ref.length - 1];
      if (from !== undefined && last !== undefined) {
        decorations.push(
          Decoration.inline(from, last + 1, {
            class: 'ref-detected',
            'data-ref-start': String(ref.range.start),
            'data-ref-end': String(ref.range.end),
            'data-ref-chapter': ref.chapterOnly ? '1' : '0',
            title: `Go to ${formatRange(ref.range, ref.chapterOnly)} (Alt+click to edit)`,
          }),
        );
      }
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

const ReferenceHighlight = Extension.create({
  name: 'referenceHighlight',
  addProseMirrorPlugins() {
    const key = new PluginKey<DecorationSet>('referenceHighlight');
    return [
      new Plugin<DecorationSet>({
        key,
        state: {
          init: (_, state) => referenceDecorations(state.doc),
          apply: (tr, old) => (tr.docChanged ? referenceDecorations(tr.doc) : old),
        },
        props: {
          decorations(state) {
            return key.getState(state);
          },
        },
      }),
    ];
  },
});

function ToolbarButton({ editor, label, active, run, children }: {
  editor: Editor;
  label: string;
  active: boolean;
  run: (e: Editor) => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={active ? 'tool-btn active' : 'tool-btn'}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => run(editor)}
    >
      {children}
    </button>
  );
}

interface RichEditorProps {
  initial: RichDoc;
  onChange: (doc: RichDoc) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Clicking a recognised reference follows it, like a link. Alt+click (or
   * Shift, Ctrl or Cmd) places the cursor instead, for editing it.
   */
  onReference?: (range: VerseRange, chapterOnly: boolean) => void;
}

/** The note editor: plain paragraphs, bold, italic, lists and quotes. */
export function RichEditor({ initial, onChange, label, placeholder, autoFocus, onReference }: RichEditorProps) {
  const onChangeRef = useRef(onChange);
  const onReferenceRef = useRef(onReference);
  useEffect(() => {
    onChangeRef.current = onChange;
    onReferenceRef.current = onReference;
  }, [onChange, onReference]);
  const [empty, setEmpty] = useState(true);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, horizontalRule: false }),
      ReferenceHighlight,
    ],
    content: initial,
    autofocus: autoFocus ? 'end' : false,
    editorProps: {
      attributes: { 'aria-label': label, 'aria-multiline': 'true', role: 'textbox', class: 'rich-editor' },
      handleDOMEvents: {
        click: (view, event) => {
          const follow = onReferenceRef.current;
          if (!follow || event.button !== 0 || event.altKey || event.shiftKey || event.ctrlKey || event.metaKey) return false;
          // Dragging across a reference to select text is not a click on the link.
          if (!view.state.selection.empty) return false;
          const ref = referenceAt(event.target);
          if (!ref) return false;
          event.preventDefault();
          follow(ref.range, ref.chapterOnly);
          return true;
        },
      },
    },
    onCreate: ({ editor: e }) => setEmpty(e.isEmpty),
    onUpdate: ({ editor: e }) => {
      setEmpty(e.isEmpty);
      onChangeRef.current(e.getJSON() as RichDoc);
    },
  });

  if (!editor) return null;
  return (
    <div className="editor">
      <div className="editor-tools" role="toolbar" aria-label="Formatting">
        <ToolbarButton editor={editor} label="Bold" active={editor.isActive('bold')} run={(e) => e.chain().focus().toggleBold().run()}>
          <b>B</b>
        </ToolbarButton>
        <ToolbarButton editor={editor} label="Italic" active={editor.isActive('italic')} run={(e) => e.chain().focus().toggleItalic().run()}>
          <i>I</i>
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Bulleted list"
          active={editor.isActive('bulletList')}
          run={(e) => e.chain().focus().toggleBulletList().run()}
        >
          •
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Numbered list"
          active={editor.isActive('orderedList')}
          run={(e) => e.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolbarButton>
        <ToolbarButton
          editor={editor}
          label="Quote"
          active={editor.isActive('blockquote')}
          run={(e) => e.chain().focus().toggleBlockquote().run()}
        >
          ❝
        </ToolbarButton>
      </div>
      <div className="editor-area">
        {empty && placeholder && (
          <p className="editor-placeholder" aria-hidden="true">
            {placeholder}
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
