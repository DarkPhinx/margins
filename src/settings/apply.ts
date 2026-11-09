/**
 * Puts the screen settings on the page: dark mode and text size, as
 * attributes on <html> that index.css reads (data-theme, data-text-size).
 */

import { getSettings, subscribeSettings } from './store';

export function applyScreenSettings(root: HTMLElement = document.documentElement): () => void {
  const apply = () => {
    const { theme, textSize } = getSettings();
    // "system" leaves it to prefers-color-scheme.
    if (theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = theme;
    root.dataset.textSize = textSize;
  };
  apply();
  return subscribeSettings(apply);
}
