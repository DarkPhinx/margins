import type { TranslationProvider } from '../bible/types';
import { createEsvProvider } from './provider';
import { httpEsvTransport } from './transport';

/** The ESV as the app uses it: through the Supabase edge function. Loaded only when the flag is on. */
export function createConfiguredEsvProvider(fallback: TranslationProvider): TranslationProvider {
  const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!base) throw new Error('VITE_SUPABASE_URL is needed for the ESV edge function');
  const transport = httpEsvTransport(`${base}/functions/v1/esv`, anon ? { authorization: `Bearer ${anon}` } : {});
  return createEsvProvider({ transport, fallback });
}
