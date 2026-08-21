import type { ViewportPreset } from './types';

/**
 * The 8 named viewport presets this tool ships with, matching the
 * device/breakpoint table real teams actually test against - not an
 * arbitrary Mobile/Tablet/Desktop trio. Shared between the client UI
 * (app/page.tsx, for the viewport picker) and anything server-side that
 * wants the same canonical list (e.g. defaults for a scripted scan).
 *
 * `category` groups presets in the picker UI; `icon` is purely cosmetic.
 */
export const VIEWPORT_PRESETS: ViewportPreset[] = [
  { id: 'mobile-s', label: 'Mobile S', width: 320, height: 568, icon: '📱', category: 'Mobile' },
  { id: 'mobile', label: 'Mobile', width: 375, height: 667, icon: '📱', category: 'Mobile' },
  { id: 'mobile-l', label: 'Mobile Large', width: 390, height: 844, icon: '📱', category: 'Mobile' },
  { id: 'tablet', label: 'Tablet', width: 768, height: 1024, icon: '📱', category: 'Tablet' },
  { id: 'tablet-landscape', label: 'Tablet Landscape', width: 1024, height: 768, icon: '📱', category: 'Tablet' },
  { id: 'laptop', label: 'Laptop', width: 1280, height: 720, icon: '💻', category: 'Desktop' },
  { id: 'desktop', label: 'Desktop', width: 1440, height: 900, icon: '🖥️', category: 'Desktop' },
  { id: 'large-desktop', label: 'Large Desktop', width: 1920, height: 1080, icon: '🖥️', category: 'Desktop' },
];

// Which of the 8 presets are enabled in the scan form by default - a
// representative sizes across each device class rather than all 8 (keeps a
// first-run scan focused), including the clean Large Desktop result used by
// the bundled edge-case demo.
export const DEFAULT_ENABLED_PRESET_IDS: Set<string> = new Set([
  'mobile',
  'mobile-l',
  'tablet',
  'laptop',
  'desktop',
  'large-desktop',
]);
