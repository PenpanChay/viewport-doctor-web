'use strict';

/**
 * The 8 named viewport presets this tool ships with, matching the
 * device/breakpoint table real teams actually test against - not an
 * arbitrary Mobile/Tablet/Desktop trio. Shared between the client UI
 * (app/page.tsx, for the viewport picker) and anything server-side that
 * wants the same canonical list (e.g. defaults for a scripted scan).
 *
 * `category` groups presets in the picker UI; `icon` is purely cosmetic.
 */
const VIEWPORT_PRESETS = [
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
// representative one per device class rather than all 8 (keeps a first-run
// scan fast), matching this tool's own "Select Viewports" mockup example
// (Mobile 375x667, Mobile 390x844, Tablet 768x1024, Desktop 1280x720,
// Desktop 1440x900).
const DEFAULT_ENABLED_PRESET_IDS = new Set(['mobile', 'mobile-l', 'tablet', 'laptop', 'desktop']);

// The width bands "Breakpoint Discovery" (lib/discoverBreakpoints.js)
// classifies a real, measured layout-change width against - the common,
// intentional breakpoints most responsive designs are actually built
// around (close cousins of Tailwind's own default `sm/md/lg/xl` scale,
// which is itself a close cousin of most real design systems' scales).
// Only used to label a detected transition as "expected" (close to one of
// these) vs. "unexpected" (a real behavior change nowhere near any of
// them, which is exactly the kind of surprise a plain Mobile/Tablet/Desktop
// screenshot comparison can't tell you about).
const STANDARD_BREAKPOINTS = [
  { width: 640, band: 'Mobile → Tablet Small' },
  { width: 768, band: 'Tablet Small → Tablet' },
  { width: 1024, band: 'Tablet → Desktop' },
  { width: 1280, band: 'Desktop → Large Desktop' },
];

// The named bands themselves, for rendering the "Responsive Behavior"
// timeline (320-639 Mobile, 640-767 Tablet Small, ...).
const BREAKPOINT_BANDS = [
  { label: 'Mobile', min: 320, max: 639 },
  { label: 'Tablet Small', min: 640, max: 767 },
  { label: 'Tablet', min: 768, max: 1023 },
  { label: 'Desktop', min: 1024, max: 1279 },
  { label: 'Large Desktop', min: 1280, max: Infinity },
];

module.exports = { VIEWPORT_PRESETS, DEFAULT_ENABLED_PRESET_IDS, STANDARD_BREAKPOINTS, BREAKPOINT_BANDS };
