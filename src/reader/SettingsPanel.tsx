import { useEffect, useRef } from 'react';
import { useOfflineState } from '../offline';
import { listProviders } from '../translations/registry';
import { updateSettings, useSettings } from '../settings';

function Toggle({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle-row">
      <span>
        <span className="toggle-label">{label}</span>
        <span className="toggle-hint">{hint}</span>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const offline = useOfflineState();
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="sheet"
      aria-label="Settings"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="sheet-inner">
        <header className="sheet-head">
          <span />
          <h2>Settings</h2>
          <button type="button" className="link-btn" onClick={onClose}>
            Done
          </button>
        </header>
        <Toggle
          label="Continuous reading"
          hint="Scroll straight from one chapter into the next, and from book to book. Margins keeps track of where you are as you scroll."
          checked={settings.continuousScroll}
          onChange={(v) => updateSettings({ continuousScroll: v })}
        />
        <Toggle
          label="Red letters"
          hint="Show the words of Jesus in red."
          checked={settings.redLetters}
          onChange={(v) => updateSettings({ redLetters: v })}
        />
        <Toggle
          label="Show manuscript notes"
          hint="KJV: show the 16 verses the earliest manuscripts lack as faded numbers you can tap. Turn off to read them in the text, as printed."
          checked={settings.showManuscriptNotes}
          onChange={(v) => updateSettings({ showManuscriptNotes: v })}
        />
        <p className="offline-line">
          {offline === 'ready'
            ? 'Ready to read offline.'
            : offline === 'preparing'
              ? 'Saving the Bibles for offline reading…'
              : 'Offline reading isn’t available in this browser.'}
        </p>
        <section className="about">
          <h3 className="sheet-section">Sources</h3>
          {listProviders().map((p) => (
            <p key={p.meta.id}>
              <strong>{p.meta.abbreviation}.</strong> {p.meta.notice}{' '}
              {p.meta.noticeUrl && (
                <a href={p.meta.noticeUrl} target="_blank" rel="noreferrer">
                  {new URL(p.meta.noticeUrl).hostname}
                </a>
              )}
            </p>
          ))}
        </section>
      </div>
    </dialog>
  );
}
