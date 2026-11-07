import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface PopupProps {
  /** Accessible name of the trigger. */
  label: string;
  trigger: ReactNode;
  triggerClassName: string;
  children: ReactNode;
  id?: string;
  dataVerse?: number;
}

const WIDTH = 320;
const GUTTER = 16;

/** A small popup opened by tapping or hovering its trigger. */
export function Popup({ label, trigger, triggerClassName, children, id, dataVerse }: PopupProps) {
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const hoverTimer = useRef<number | undefined>(undefined);
  const panelId = useId();

  const close = useCallback(() => {
    setOpen(false);
    setPinned(false);
  }, []);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const r = buttonRef.current.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const width = Math.min(WIDTH, vw - GUTTER * 2);
    const left = Math.min(Math.max(r.left - 12, GUTTER), vw - width - GUTTER);
    setPos({ top: r.bottom + 8, left, width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        buttonRef.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) close();
    };
    const onScroll = () => close();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll);
    };
  }, [open, close]);

  useEffect(() => () => window.clearTimeout(hoverTimer.current), []);

  const canHover = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        id={id}
        data-verse={dataVerse}
        className={triggerClassName}
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (pinned) close();
          else {
            setOpen(true);
            setPinned(true);
          }
        }}
        onMouseEnter={() => {
          if (!canHover()) return;
          window.clearTimeout(hoverTimer.current);
          hoverTimer.current = window.setTimeout(() => setOpen(true), 250);
        }}
        onMouseLeave={() => {
          window.clearTimeout(hoverTimer.current);
          if (!pinned) hoverTimer.current = window.setTimeout(() => setOpen(false), 200);
        }}
      >
        {trigger}
      </button>
      {open && (
        <span
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className="popup"
          style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { visibility: 'hidden' }}
          onMouseEnter={() => window.clearTimeout(hoverTimer.current)}
          onMouseLeave={() => {
            if (!pinned) setOpen(false);
          }}
        >
          {children}
        </span>
      )}
    </>
  );
}
