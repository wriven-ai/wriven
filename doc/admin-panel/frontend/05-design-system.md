# Admin Panel — Design System

Reuse the **Wriven brand** so the console feels part of the product, tuned for
**dense operational** screens. Tokens below are the canonical Wriven palette (light
+ dark), font, shadows, and utility classes — lifted from the tenant app's
`global.css`. Drop them into `src/styles/globals.css`.

---

## 1. Tailwind v4 setup (`globals.css`)

```css
@import 'tailwindcss';
@import 'tw-animate-css';            /* if you want the same animations */

@custom-variant dark (&:is(.dark *));

@theme {
  /* brand */
  --color-brand-accent: var(--brand-accent);
  --color-brand-accent-hover: var(--brand-accent-hover);
  --color-brand-secondary: var(--brand-secondary);
  --color-brand-bg: var(--brand-bg);
  --color-brand-surface: var(--brand-surface);
  --color-brand-surface-soft: var(--brand-surface-soft);
  --color-brand-border: var(--brand-border);

  /* shadcn aliases mapped onto brand */
  --color-background: var(--brand-bg);
  --color-foreground: var(--text-primary);
  --color-border: var(--brand-border);
  --color-input: var(--brand-border);
  --color-ring: var(--brand-accent);
  --color-card: var(--brand-surface);
  --color-card-foreground: var(--text-primary);
  --color-popover: var(--brand-surface);
  --color-popover-foreground: var(--text-primary);
  --color-muted: var(--brand-surface-soft);
  --color-muted-foreground: var(--text-muted);
  --color-accent: var(--brand-surface-soft);
  --color-accent-foreground: var(--text-primary);
  --color-primary: var(--brand-accent);
  --color-primary-foreground: #ffffff;
  --color-secondary: var(--brand-surface-soft);
  --color-secondary-foreground: var(--text-primary);

  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-text-muted: var(--text-muted);
  --color-status-success: var(--status-success);
  --color-status-warning: var(--status-warning);
  --color-status-error: var(--status-error);

  /* sidebar */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);

  /* type — load Manrope via @fontsource/manrope or a <link> */
  --font-sans: 'Manrope', sans-serif;
  --text-2xs: 0.65rem;
  --text-3xs: 0.55rem;
}

:root {
  --brand-accent: #0b6e4f;          /* Sovereign Emerald */
  --brand-accent-hover: #075039;    /* Deep Forest */
  --brand-secondary: #d97706;       /* Refined deep amber */
  --brand-bg: #faf8f5;              /* Warm oatmeal eggshell */
  --brand-surface: #ffffff;
  --brand-surface-soft: #eef4f0;    /* Sage-tinted wash */
  --brand-border: #dbe5df;          /* Ice-sage hairline */

  --text-primary: #080d0a;          /* Ink charcoal */
  --text-secondary: #424c46;        /* Slate pine */
  --text-muted: #79857e;            /* Faint spruce */

  --status-success: #1e6b4b;
  --status-warning: #b37d28;
  --status-error: #a32e2e;

  --sidebar: #ffffff;
  --sidebar-foreground: #080d0a;
  --sidebar-accent: #eef4f0;
  --sidebar-accent-foreground: #0b6e4f;
  --sidebar-border: #dbe5df;

  --shadow-sm: 0 4px 12px -2px rgba(8,13,10,.05), 0 2px 6px -1px rgba(8,13,10,.03);
  --shadow-lg: 0 16px 32px -4px rgba(8,13,10,.06), 0 8px 16px -2px rgba(8,13,10,.03);
}

.dark {
  --brand-accent: #0faf7b;          /* Electric Chromium Emerald */
  --brand-accent-hover: #15d296;    /* Vivid mint neon */
  --brand-secondary: #f59e0b;       /* Luminous Sun Amber */
  --brand-bg: #050a08;              /* Obsidian pine */
  --brand-surface: #0c1210;         /* Rainforest carbon */
  --brand-surface-soft: #141d19;    /* Slate moss */
  --brand-border: #1d2a23;          /* Spruce twilight line */

  --text-primary: #faf8f5;
  --text-secondary: #99a6a0;
  --text-muted: #64736c;

  --status-success: #35a375;
  --status-warning: #dca245;
  --status-error: #d94646;

  --sidebar: #0c1210;
  --sidebar-foreground: #faf8f5;
  --sidebar-accent: #141d19;
  --sidebar-accent-foreground: #0faf7b;
  --sidebar-border: #1d2a23;

  --shadow-sm: 0 4px 12px -2px rgba(0,0,0,.35), 0 2px 6px -1px rgba(0,0,0,.25);
  --shadow-lg: 0 16px 32px -4px rgba(0,0,0,.5), 0 8px 16px -2px rgba(0,0,0,.4);
}

body {
  background-color: var(--color-brand-bg);
  color: var(--color-text-primary);
  font-family: var(--font-sans);
}
```

---

## 2. Palette reference

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| accent | `#0b6e4f` | `#0faf7b` | Primary buttons, active nav, links |
| accent-hover | `#075039` | `#15d296` | Hover/pressed |
| secondary | `#d97706` | `#f59e0b` | Secondary accents/highlights |
| bg | `#faf8f5` | `#050a08` | App background |
| surface | `#ffffff` | `#0c1210` | Cards, tables, panels |
| surface-soft | `#eef4f0` | `#141d19` | Muted rows, hover, chips |
| border | `#dbe5df` | `#1d2a23` | Hairlines, table borders |
| text-primary | `#080d0a` | `#faf8f5` | Body/headings |
| text-secondary | `#424c46` | `#99a6a0` | Secondary text |
| text-muted | `#79857e` | `#64736c` | Meta, placeholders |
| success | `#1e6b4b` | `#35a375` | Active/healthy/published |
| warning | `#b37d28` | `#dca245` | Past-due/near-limit |
| error | `#a32e2e` | `#d94646` | Suspended/failed/destructive |

---

## 3. Typography & density
- Font: **Manrope** across the board (`--font-sans`). Load via `@fontsource/manrope`
  (weights 400–800) or a Google Fonts `<link>`. No italics (the brand strips them).
- Admin density: base `13–14px`; compact table rows (`h-9`/`h-10`); use
  `text-2xs`/`text-3xs` for table meta and badges. Tighter than the tenant editor.
- Headings: Manrope semibold/bold; generous letter-spacing on small caps labels.

---

## 4. Components & motion
- shadcn-style wrappers over **Base UI** primitives (dialog, popover, tooltip,
  dropdown-menu, tabs, select, checkbox, command). Match the tenant app's
  `data-slot` styling so the two products feel identical.
- **Shadows:** `--shadow-sm` for cards/tables, `--shadow-lg` for popovers/dialogs.
  Subtle hover lift only on interactive cards (`translateY(-2px)`), not on dense
  table rows.
- **Radii:** medium (`rounded-lg` ~10–12px) on cards/inputs/buttons; chips/badges
  fully rounded. Keep it consistent and calm — this is an ops tool, not marketing.
- **Status badges:** soft surface bg + status-color text/border (e.g. success =
  `surface-soft` bg, `status-success` text).
- **Focus:** visible ring using `--color-ring` (brand accent) — important for a
  keyboard-heavy admin tool.
- **Dark mode:** toggle on `<html class="dark">` via the store; persist preference.

---

## 5. Optional brand textures
The tenant app ships `.editorial-grid` (faint blueprint grid), `.neo-shadow*`
(organic depth), `.clay-plate`, `.paper-grain`. **Use sparingly** in an admin tool
— maybe the login screen background or empty states. Keep data screens flat and
legible; texture is for personality moments, not dense tables.
