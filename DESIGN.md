---
name: Closer Coach
description: Cold-call practice with an AI business owner and an honest coach.
colors:
  frame-navy: "#13234a"
  frame-ink: "#c9d3e8"
  action-blue: "#2563eb"
  action-blue-deep: "#1d4fd0"
  action-wash: "#eaf1ff"
  data-navy: "#0f2c5c"
  data-wash: "#e9eff8"
  compare-blue: "#a9bbda"
  canvas: "#f6f8fa"
  tray: "#eef1f5"
  surface: "#ffffff"
  ink: "#1a2233"
  muted: "#667085"
  faint: "#98a2b3"
  line: "#e4e8ee"
  good: "#1f8a5b"
  good-wash: "#e3f4ec"
  mixed: "#9a6a12"
  mixed-wash: "#fbf0d9"
  bad: "#c43c3c"
  bad-wash: "#fbe7e7"
typography:
  display:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "38px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.3
  metric:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  panel: "18px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.action-blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.action-blue-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "34px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.xl}"
    padding: "26px 28px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  nav-item-active:
    backgroundColor: "{colors.frame-navy}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  pill:
    rounded: "{rounded.pill}"
    padding: "2px 8px"
---

# Design System: Closer Coach

## Overview

**Creative North Star: "The Practice Room"**

Closer Coach is a quiet room a rep walks into to rehearse before the real call. The frame is calm and dark (a deep navy sidebar), the floor is a cool pale gray, and the work happens on soft white cards. Color is spent sparingly and with meaning: a bright action blue marks the one thing to do next, and green, amber, and red only ever describe how a call or skill went. Nothing competes with the coaching.

The interface is an operating tool, not a marketing page. Density is moderate: numbers are large and tabular so progress reads at a glance, and every explanation is short, plain, and specific. Cards are rounded and lightly lifted so the app feels approachable, the way a good coach is, without becoming playful.

**Key Characteristics:**
- Deep navy frame, cool gray canvas, soft white cards.
- One bright blue for actions; status colors only for outcomes and grades.
- Apple's system font, with big tabular numbers for scores.
- Rounded, gently lifted cards; one dark navy panel per page at most, reserved for the moment that matters (the call box).
- Plain, coach-like copy in sentence case.

## Colors

A restrained cool palette: navy for structure, one bright blue for action, and a small set of status colors that always mean the same thing.

### Primary
- **Practice Navy** (frame-navy): the sidebar and the one dark panel per page (the "Start your call" box). It frames the room; it never fills content cards.
- **Action Blue** (action-blue): primary buttons (Start a call, Begin call, Practice it now), focus rings, and active highlights. Deepens to action-blue-deep on hover.
- **Data Navy** (data-navy): chart lines, bars, meters, and the score badge text when no grade color applies. Quieter than Action Blue so data never reads as a button.

### Secondary
- **Previous-Period Blue** (compare-blue): the dashed comparison line and markers for "previous period" only.

### Neutral
- **Cool Canvas** (canvas): the page background behind everything.
- **Tray Gray** (tray): grouping trays behind dashboard tiles, meter tracks, and quiet badges.
- **Card White** (surface): every content card.
- **Ink** (ink): headings and body text.
- **Slate** (muted): secondary text, labels, axis labels, and empty-state hints (about 4.9:1 on white).
- **Mist** (faint): decorative only, never text (about 2.6:1 on white).
- **Hairline** (line): 1px borders and dividers.

### Status
- **Booked Green** (good / good-wash): improvements, Elite and Strong grades, things that worked.
- **Follow-up Amber** (mixed / mixed-wash): Developing grades, mixed verdicts, gentle warnings like "No offer saved."
- **Missed Red** (bad / bad-wash): declines, drops, things that fell flat, destructive actions.

### Named Rules
**The One Blue Rule.** Action Blue marks what to do next. A screen has one primary blue button; everything else is secondary or a text link.

**The Status Means Status Rule.** Green, amber, and red describe how a call or skill went and nothing else. They are never decoration, section accents, or stripes on cards.

## Typography

**Display Font:** Apple's system font (SF Pro on Apple devices) with Helvetica Neue and Arial fallbacks.
**Body Font:** the same family.

**Character:** One family throughout, so the voice stays even. Hierarchy comes from size and weight, and numbers use tabular figures so scores line up.

### Hierarchy
- **Display** (600, 38px, 1.15): the title of the Start a call page only.
- **Headline** (600, 30px, 1.2): page titles (Dashboard greeting, My progress, Call history, Settings).
- **Title** (600, 17px, 1.3): card titles.
- **Metric** (700, 26 to 32px, tabular): stat values, scores, and percentages.
- **Body** (400, 15px, 1.55): explanations and coaching text; keep lines under about 70 characters.
- **Label** (500, 13px): field labels, table headers, helper text, and stat labels.

### Named Rules
**The Sentence Case Rule.** All headings, labels, buttons, and badges are sentence case. No all-caps labels, and no small label above a heading: the heading carries the meaning ("Next focus: Solution Fit").

**The One Change Format Rule.** Every change reads arrow, size, unit: "↑ 8 pts", "↓ 3", "↑ 4%", or "Same", in Booked Green or Missed Red.

## Layout

A fixed 240px navy sidebar holds the brand, a full-width "Start a call" button, and the main navigation. The content column is centered, capped at 1280px, with 40px to 48px side padding (16px on phones). The Start a call page drops the sidebar for a focused, centered layout with a "Back to dashboard" link.

Pages are built from full-width rows and equal columns on one shared gap (20px). Dashboard and Analytics tiles are ordinary cards on that same gap; there is no separate tray style. Three-column rows collapse to one column under 860px; the sidebar becomes a top bar with a menu button.

## Elevation & Depth

Depth is soft and ambient. Content cards sit on the canvas with a gentle two-layer shadow and no border; elevation is declared once. Strong, colored shadows are reserved for primary action buttons and the one dark panel, which lifts slightly more than everything else.

### Shadow Vocabulary
- **Card rest** (`0 1px 3px rgba(16, 32, 70, 0.07), 0 8px 24px -12px rgba(16, 32, 70, 0.16)`): every content card and dashboard tile.
- **Action lift** (`0 12px 26px -12px rgba(37, 99, 235, 0.8)`): large primary buttons.
- **Panel lift** (`0 24px 48px -24px rgba(19, 35, 74, 0.6)`): the dark navy call panel.
- **Focus ring** (`0 0 0 3px #eaf1ff`): focused inputs.

### Named Rules
**The One Dark Panel Rule.** At most one dark navy panel per page, and only for the moment that matters most.

## Shapes

Gently curved throughout. Buttons and inputs use small radii (8px), cards use larger ones (16px), the dark panel and hero cards use the largest (18px), and badges and filter chips are fully rounded pills. No sharp corners, no colored edge stripes.

## Components

### Buttons
- **Shape:** gently rounded (8px); large buttons up to 12 to 14px.
- **Primary:** Action Blue with white text, 34px tall by default; 44 to 62px for the main call-to-action on a page.
- **Hover / Focus:** deepens to action-blue-deep; a 2px blue focus outline for keyboard users.
- **Secondary:** white with a hairline border and ink text.
- **Text button:** blue text with no background, for Edit, Save, and View all.
- **Danger:** Missed Red, used only for Delete all calls and End call.

### Chips and badges
- **Status pills:** pill-shaped, tinted wash background with darker text of the same color (Booked Green, Follow-up Amber, Missed Red). "Meeting booked" uses a quiet gray pill so the outcomes worth noticing stand out.
- **Score badge:** score and grade together ("93 · Elite"), tinted by grade.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Card White on Cool Canvas.
- **Shadow Strategy:** Card rest (see Elevation).
- **Border:** none; the shadow alone separates the card from the canvas.
- **Internal Padding:** 26px by 28px.
- **Titles:** every card title is 17px semibold, on every page.

### Inputs / Fields
- **Style:** white, 1px Hairline border, 8px radius.
- **Focus:** border turns Action Blue with a soft 3px blue ring.
- **Secrets:** the access code field has a Show / Hide toggle.

### Navigation
- **Sidebar:** navy, 14px items with 18px line icons, 10px by 12px padding. Hover lightens the background; the active item gets a light blue tint and white text. The Start a call button sits above the nav.
- **Mobile:** the sidebar collapses to a top bar with a menu button.

### The Owner Reveal
"What [owner] was really thinking": a full-width Action Wash banner with a blue bulb chip, opening to the owner's hidden problems and concerns. It stays on the blue palette.

### The Call Panel (signature)
The "Start your call" box on the Start a call page: a dark navy panel with light text, a translucent access code field, and a large Action Blue Start call button. It is the one dark moment in the app.

## Do's and Don'ts

### Do:
- **Do** keep one primary Action Blue button per screen.
- **Do** show every number with tabular figures, and write every change the same way ("↑ 8 pts").
- **Do** keep rows and columns on the shared 20px gap, with equal-height columns in a row.
- **Do** write labels and buttons in plain sentence case.

### Don't:
- **Don't** add colored stripes or borders to cards to show category; use the icon chip and title.
- **Don't** scatter small line charts across cards; trend charts live on the Analytics page.
- **Don't** use green, amber, or red for anything except how a call or skill went.
- **Don't** add a second dark navy panel to a page.
- **Don't** use all-caps labels or a small eyebrow label above a heading.
- **Don't** add colored side borders thicker than 1px to cards, callouts, or alerts; use a tinted background.
- **Don't** use the pale Mist gray (faint) for text; it is for decoration only. Secondary text is Slate (muted).
