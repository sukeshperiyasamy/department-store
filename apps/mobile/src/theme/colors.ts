/**
 * Design system and color tokens for the Departmental Store Mobile App.
 *
 * Polished, modern light theme:
 * - White surfaces and soft-grey canvas
 * - Teal accents (#0d9488) matching the owner dashboard and brand
 * - Accessible contrast ratios (WCAG AA compliant)
 * - Touch-friendly dimensions (min 44px tap targets)
 */

export const colors = {
  // Canvas & Backgrounds
  background: "#f8fafc",      // Slate 50
  surface: "#ffffff",         // Pure white
  surfaceSubtle: "#f1f5f9",   // Slate 100
  surfaceElevated: "#ffffff", // Pure white with shadow

  // Primary Brand Accent (Teal)
  primary: "#0d9488",         // Teal 600
  primaryHover: "#0f766e",    // Teal 700
  primaryLight: "#f0fdfa",    // Teal 50
  primaryBorder: "#99f6e4",   // Teal 200
  primaryDark: "#115e59",     // Teal 800

  // Neutral Borders & Dividers
  border: "#e2e8f0",          // Slate 200
  borderDark: "#cbd5e1",      // Slate 300
  divider: "#f1f5f9",         // Slate 100

  // Typography
  text: "#0f172a",            // Slate 900
  textSecondary: "#475569",   // Slate 600
  textMuted: "#64748b",       // Slate 500
  textInverse: "#ffffff",     // White

  // Status & Semantic Feedback
  success: "#16a34a",         // Green 600
  successLight: "#f0fdf4",    // Green 50
  successBorder: "#bbf7d0",   // Green 200

  warning: "#d97706",         // Amber 600
  warningLight: "#fffbeb",    // Amber 50
  warningBorder: "#fde68a",   // Amber 200

  danger: "#dc2626",          // Red 600
  dangerLight: "#fef2f2",     // Red 50
  dangerBorder: "#fecaca",    // Red 200

  info: "#0284c7",            // Sky 600
  infoLight: "#f0f9ff",       // Sky 50
  infoBorder: "#bae6fd",      // Sky 200

  // Tenant Identifier Badges
  tenantBadgeBg: "#ccfbf1",   // Teal 100
  tenantBadgeText: "#115e59", // Teal 800
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  full: 9999,
} as const;

export const typography = {
  title: {
    fontSize: 22,
    fontWeight: "700" as const,
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 17,
    fontWeight: "600" as const,
    lineHeight: 22,
  },
  body: {
    fontSize: 14,
    fontWeight: "400" as const,
    lineHeight: 20,
  },
  bodyBold: {
    fontSize: 14,
    fontWeight: "600" as const,
    lineHeight: 20,
  },
  caption: {
    fontSize: 12,
    fontWeight: "500" as const,
    lineHeight: 16,
  },
  tiny: {
    fontSize: 11,
    fontWeight: "400" as const,
    lineHeight: 14,
  },
} as const;

export const shadows = {
  sm: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  lg: {
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;
