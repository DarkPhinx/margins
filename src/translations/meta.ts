import type { TranslationMeta } from '../bible/types';

export const BSB_META: TranslationMeta = {
  id: 'bsb',
  name: 'Berean Standard Bible',
  abbreviation: 'BSB',
  source: 'bundled',
  notice: 'The Berean Standard Bible is in the public domain.',
  noticeUrl: 'https://berean.bible',
};

export const KJV_META: TranslationMeta = {
  id: 'kjv',
  name: 'King James Version',
  abbreviation: 'KJV',
  source: 'bundled',
  notice:
    'King James Version (1769 text), public domain, courtesy of eBible.org and CrossWire. Printing it in the United Kingdom needs permission.',
  noticeUrl: 'https://ebible.org/kjv/',
};
