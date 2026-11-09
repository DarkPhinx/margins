import { useEffect, useRef, type ReactNode } from 'react';
import { useOfflineState } from '../offline';
import { listProviders } from '../translations/registry';
import { XREF_CREDIT } from '../xrefs/xrefs';
import { WORDS_CREDIT } from '../words/data';
import { AccountSection } from '../sync/SyncStatus';
import { SETTINGS, updateSettings, useSettings, useSettingsAccount, type PageSettingKey, type Scope, type Settings, type TextSize, type Theme } from '../settings';

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

function Choice<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="choice-row">
      <legend className="toggle-label">{label}</legend>
      <div className="choice-options">
        {options.map((o) => (
          <label key={o.value} className={o.value === value ? 'choice selected' : 'choice'}>
            <input type="radio" name={name} value={o.value} checked={o.value === value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const TEXT_SIZE_OPTIONS: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
  { value: 'larger', label: 'Larger' },
];

/** The controls, each for one setting; the panel puts each under its setting's scope. */
const CONTROLS: { key: PageSettingKey; render: (s: Settings) => ReactNode }[] = [
  {
    key: 'continuousScroll',
    render: (s) => (
      <Toggle
        label="Continuous reading"
        hint="Scroll straight from one chapter into the next, and from book to book. Margins keeps track of where you are as you scroll."
        checked={s.continuousScroll}
        onChange={(v) => updateSettings({ continuousScroll: v })}
      />
    ),
  },
  {
    key: 'redLetters',
    render: (s) => (
      <Toggle label="Red letters" hint="Show the words of Jesus in red." checked={s.redLetters} onChange={(v) => updateSettings({ redLetters: v })} />
    ),
  },
  {
    key: 'showManuscriptNotes',
    render: (s) => (
      <Toggle
        label="Show manuscript notes"
        hint="KJV: show the 16 verses the earliest manuscripts lack as faded numbers you can tap. Turn off to read them in the text, as printed."
        checked={s.showManuscriptNotes}
        onChange={(v) => updateSettings({ showManuscriptNotes: v })}
      />
    ),
  },
  {
    key: 'theme',
    render: (s) => <Choice label="Dark mode" name="theme" options={THEME_OPTIONS} value={s.theme} onChange={(v) => updateSettings({ theme: v })} />,
  },
  {
    key: 'textSize',
    render: (s) => (
      <Choice label="Text size" name="text-size" options={TEXT_SIZE_OPTIONS} value={s.textSize} onChange={(v) => updateSettings({ textSize: v })} />
    ),
  },
];

function ScopeSection({ scope, settings, signedIn }: { scope: Scope; settings: Settings; signedIn: boolean }) {
  const controls = CONTROLS.filter((c) => SETTINGS[c.key].scope === scope);
  if (!controls.length) return null;
  const title = scope === 'account' ? 'Reading' : 'This device';
  const note =
    scope === 'device'
      ? 'Kept on this device only.'
      : signedIn
        ? 'Saved with your account, so they’re the same on every device.'
        : 'Kept on this device. Sign in to keep them the same on every device.';
  return (
    <section aria-label={title}>
      <h3 className="sheet-section">{title}</h3>
      <p className="scope-note">{note}</p>
      {controls.map((c) => (
        <div key={c.key}>{c.render(settings)}</div>
      ))}
    </section>
  );
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  const signedIn = useSettingsAccount() !== null;
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
        <ScopeSection scope="account" settings={settings} signedIn={signedIn} />
        <ScopeSection scope="device" settings={settings} signedIn={signedIn} />
        <p className="offline-line">
          {offline === 'ready'
            ? 'Ready to read offline.'
            : offline === 'preparing'
              ? 'Saving the Bibles for offline reading…'
              : 'Offline reading isn’t available in this browser.'}
        </p>
        <AccountSection />
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
          <p>
            <strong>Cross-references.</strong> {XREF_CREDIT}{' '}
            <a href="https://www.openbible.info/labs/cross-references/" target="_blank" rel="noreferrer">
              openbible.info
            </a>
          </p>
          <p>
            <strong>Original language.</strong> {WORDS_CREDIT} English word links from the BSB’s public-domain
            tables and the KJV’s Strong’s tags.{' '}
            <a href="https://github.com/STEPBible/STEPBible-Data" target="_blank" rel="noreferrer">
              STEPBible-Data
            </a>
          </p>
        </section>
      </div>
    </dialog>
  );
}
