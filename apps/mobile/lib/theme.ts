/**
 * Field-app visual constants. Deliberately a single light theme, not the
 * scaffold's light/dark pair (constants/Colors.ts still exists for the
 * one bit of chrome — expo-router's ThemeProvider — that still reads it):
 * a worker outdoors in daylight needs maximum contrast, not a theme
 * toggle, and every screen in this app is built around a handful of
 * large, high-contrast surfaces rather than the desktop's dense tables —
 * see CONTEXT.md "Mobile application" for the full UX reasoning.
 */

export const COLORS = {
  primary: "#0f6e5c",
  primaryDark: "#0b5548",
  background: "#f4f5f7",
  surface: "#ffffff",
  border: "#dde1e6",
  text: "#161a1f",
  textMuted: "#5b6470",
  danger: "#c0392b",
  dangerBg: "#fdecea",
  warning: "#b7791f",
  warningBg: "#fef3e0",
  success: "#1b7a4d",
  successBg: "#e8f7ee",
  info: "#2563a8",
  infoBg: "#e8f1fb",
  overdue: "#c0392b",
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const RADIUS = { sm: 8, md: 12, lg: 16 };

/** Apple/Android accessibility guidance is 44/48dp; this app's brief
 * explicitly calls for large touch targets for gloved/one-handed use, so
 * every primary action button targets meaningfully above that floor. */
export const TOUCH_TARGET = 56;
