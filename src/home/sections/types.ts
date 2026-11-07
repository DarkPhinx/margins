import type { ComponentType } from 'react';

/**
 * One part of the home page. The home page is just an ordered list of these,
 * so it can grow (open questions, recent notes, studies, templates, the
 * library…) by adding a section, without changing the others.
 *
 * To add one: write a component in this folder, then add it to HOME_SECTIONS
 * in ./index.ts. Order there is order on the page.
 */
export interface HomeSection {
  /** Stable id: used as the section's key and data-section attribute. */
  id: string;
  /** Accessible name of the section. */
  label: string;
  Component: ComponentType;
}
