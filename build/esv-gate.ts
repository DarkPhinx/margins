/**
 * Build-time rules for the ESV feature flag. Used by vite.config.ts and tested
 * in tests/esv-gate.test.ts.
 */

export interface EsvGateInput {
  /** Raw value of MARGINS_ESV from the build environment. */
  flag: string | undefined;
  /** The Crossway copyright notice, or null while it has not been added. */
  notice: string | null;
  /** The whole build environment, to catch a key exposed to the browser. */
  env: Record<string, string | undefined>;
}

export function esvFlagEnabled(flag: string | undefined): boolean {
  return flag === '1' || flag === 'true';
}

/** Throws when the build would break an ESV rule; returns whether ESV is on. */
export function checkEsvGate({ flag, notice, env }: EsvGateInput): boolean {
  const exposed = Object.keys(env).filter((k) => /^VITE_/i.test(k) && /ESV|CROSSWAY/i.test(k));
  if (exposed.length) {
    throw new Error(
      `${exposed.join(', ')}: the ESV key must never use a VITE_ prefix, because Vite ships VITE_ variables to the browser.`,
    );
  }
  const enabled = esvFlagEnabled(flag);
  if (enabled && !notice?.trim()) {
    throw new Error(
      'MARGINS_ESV is on but the ESV copyright notice is missing. Add the exact wording from api.esv.org/#copyright to src/esv/notice.ts.',
    );
  }
  return enabled;
}
