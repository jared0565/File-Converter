---
name: File Converter
description: A green and white workspace for local file conversion.
colors:
  primary: "#174c3c"
  primary-hover: "#25644b"
  neutral-bg: "#fafbf8"
  surface: "#ffffff"
  text: "#26342f"
  muted: "#64706a"
  line: "#dce2d9"
  disabled-bg: "#e5eade"
  disabled-text: "#5b6954"
  focus: "#9a6221"
  dark-page: "#121a16"
  dark-surface: "#1b2620"
  dark-text: "#e6eee8"
  dark-primary: "#9ed9b9"
  dark-action: "#236447"
typography:
  display:
    fontFamily: "Inter, sans-serif"
    fontSize: "clamp(34px, 4.7vw, 54px)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Inter, sans-serif"
    fontSize: "23px"
    fontWeight: 600
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Inter, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  workspace: "14px"
  drop-zone: "10px"
  control: "7px"
  shortcut: "5px"
spacing:
  gap: "8px"
  group: "16px"
  inset-mobile: "20px"
  inset-desktop: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  button-primary-disabled:
    backgroundColor: "{colors.disabled-bg}"
    textColor: "{colors.disabled-text}"
  workspace:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.workspace}"
---

# Design System: File Converter

## Overview

The implemented interface is a restrained green and white workspace. This document extracts the existing implementation; it does not assert a user-approved brand metaphor. The upload area and output controls carry the main visual emphasis, followed by formats and explanatory content.

## Colors

Primary green identifies actions, privacy information and headline emphasis. Neutral text, muted supporting copy, white surfaces and pale dividing lines establish the remaining hierarchy. Image format labels use brown; data format labels use blue. Errors use red text on a pale red surface.

## Typography

Inter is self-hosted in regular, medium, semibold and bold weights. Display, headline and workspace-title roles use the frontmatter hierarchy. Introductory copy is larger (15px) than explanatory copy; compact metadata ranges from 8px to 11px. The procedural heading has its own intermediate scale (38px desktop, 32px mobile). Long FAQ answers have a maximum measure (75ch).

## Layout

The main container is centered (1060px maximum including 36px side padding); header and footer use a wider container (1240px). The workspace divides upload and output into two columns (1.35fr / 1fr). At the mobile breakpoint (700px), it becomes a single column with narrower side padding (20px). The format list changes from ten columns to five; shortcuts wrap. Mobile display text uses a fixed size (37px).

## Elevation & Depth

There are no shadows. White and pale tinted surfaces, thin borders and spacing distinguish functional regions. Status messages sit within the workspace instead of floating over it.

## Shapes

The workspace has the broadest rounding, with smaller corners on upload and field controls. Borders are thin (1px); the upload target uses a dashed border. Icons use authored, unfilled SVG strokes with rounded caps and joins.

## Components

Primary buttons use green, white text and a minimum height (48px). Disabled controls use muted green-gray surfaces. Buttons and upload targets transition background color over 0.2 seconds; the upload border also transitions. CSS transitions are removed under reduced-motion preferences.

The output field is a native select with a visible label and associated format guidance. Keyboard focus uses an amber outline (3px, offset 5px). The visible upload button opens the hidden file input; the hidden input is excluded from keyboard tab order.

Navigation uses plain text links with underlined hover states. Format buttons use a segmented grid; selected and hovered formats gain a pale green background. FAQ rows use native disclosure controls. Download links share the primary action colors and allow long filenames to wrap.

## Do's and Don'ts

- Do retain visible keyboard focus and the upload control's accessible button semantics.
- Do preserve the distinction between actions, supporting text and conversion limitations.
- Do let formats and downloads wrap at narrow widths.
- Don't describe this extracted visual system as a user-supplied brand.
- Don't imply exact document layout preservation in interface copy.

Reader and library extensions inherit the workspace border, radius and green action colors. Their header is 20px (18px on mobile), with 12px guidance. Reader content uses 16px prose or 14px monospace for literal text/JSON. Document headings are 30/24/20px. PDF pages fit the available width at the standard render setting; larger renders and tables scroll inside the content region. Library rows wrap actions below metadata on mobile. Secondary controls have a 40px minimum height and retain the existing focus treatment.

The explicit dark variant uses semantic CSS tokens under `data-theme="dark"`, with native dark form controls through `color-scheme`. Page/surface/text/action colors are documented in frontmatter; muted text is #adb9b1, borders #3b4b41 and focus #e8b970. Accent text and filled action backgrounds have separate tokens to keep both readable. PDF canvases remain white and media is never filtered. The header toggle uses `aria-pressed`, a visible moon icon, and a text label above 900px.
