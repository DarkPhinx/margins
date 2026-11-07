import type { TranslationId, TranslationProvider } from '../bible/types';
import { createBundledProvider } from './bundled';
import { BSB_META, KJV_META } from './meta';

const bsb = createBundledProvider(BSB_META);
const kjv = createBundledProvider(KJV_META);

let providers: TranslationProvider[] = [bsb, kjv];

/**
 * Adds remote translations. With the ESV flag off, the ESV branch and its
 * module are removed from the build entirely.
 */
export async function loadRemoteProviders(): Promise<TranslationProvider[]> {
  if (__ESV_ENABLED__) {
    const { createConfiguredEsvProvider } = await import('../esv/configured');
    providers = [bsb, kjv, createConfiguredEsvProvider(bsb)];
  }
  return providers;
}

export function listProviders(): TranslationProvider[] {
  return providers;
}

export function getProvider(id: TranslationId): TranslationProvider {
  return providers.find((p) => p.meta.id === id) ?? bsb;
}

export function isAvailable(id: string): id is TranslationId {
  return providers.some((p) => p.meta.id === id);
}
