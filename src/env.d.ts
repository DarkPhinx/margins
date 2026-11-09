/** Set at build time from MARGINS_ESV. When false, all ESV code is left out of the build. */
declare const __ESV_ENABLED__: boolean;

/** True in the Windows app's build (`vite build --mode desktop`): no service worker, everything is in the program. */
declare const __DESKTOP__: boolean;
