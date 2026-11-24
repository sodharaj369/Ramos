# RAMOS — Brand Guidelines & Visual Identity System (v1.0.6)

## Overview
**RAMOS** is a high-precision, standalone Chrome extension for Google Maps Lead Extraction, Website Intelligence, and Master Lead File Deduplication.

This document specifies the refined visual identity system, geometric logo mark, color tokens, and popup UI guidelines for RAMOS v1.0.6.

---

## 1. Brand Personality & Core Values

- **Refined & Technical**: Designed with the subtle, distraction-free aesthetic of modern developer instruments (Linear, Raycast).
- **Subtle Restraint**: Replaces oversaturated "AI slop" gradients with quiet obsidian surfaces, translucent borders, and focused luminance.
- **Engineered Precision**: Crisp mathematical geometry, clean segmented controls, and tactile interactive surfaces.
- **Client-Side Autonomy**: Pure browser-native execution without consumer bloat or cloud dependencies.

---

## 2. Logo Concept & Geometry

The RAMOS symbol is an architectural monogram combining the letter **R** with a spatial radar aperture:
1. **The Letter "R"**: Clean geometric pillar, sweeping upper loop, and angled forward leg.
2. **Spatial Discovery Node**: A luminous focal beacon embedded at the apex of the loop with subtle concentric radar rings ($r=14$, $r=23$).
3. **Squircle Container**: Obsidian squircle ($r=28\text{px}$) with an inner ambient glow and delicate $1\text{px}$ highlight stroke (`rgba(255, 255, 255, 0.18)`).

```
       ┌────────────────────────┐
       │   ████   ██████    ◎   │  <- Radar Aperture Beacon
       │   ████        ██       │
       │   ████   ██████        │
       │   ████        ██       │
       │   ████         ██      │
       └────────────────────────┘
```

> [!IMPORTANT]
> **Branding Boundaries**:
> - DO NOT use a literal Google Maps teardrop pin.
> - DO NOT use oversaturated neon cyberpunk gradients or cartoon emojis (e.g. 📁).
> - DO NOT copy Google Maps logo styling or colors.

---

## 3. Color Palette Tokens

The RAMOS visual language uses a deep obsidian palette with modern indigo accents, electric sky highlights, and translucent structural borders.

| Token | Hex / RGBA Value | CSS Variable | Purpose / Context |
| :--- | :--- | :--- | :--- |
| **Obsidian Base** | `#0A0C12` | `--bg-app` | Primary application canvas |
| **Surface Card** | `#12151F` | `--bg-surface` | Card & panel container surface |
| **Surface Inset** | `#141724` | `--bg-surface-inset` | Segmented controls, inputs, and chips |
| **Surface Elev** | `#171B28` | `--bg-surface-elev` | Elevated interactive controls |
| **Modern Indigo** | `#6366F1` | `--brand-indigo` | Primary brand accent & tactile buttons |
| **Electric Sky** | `#38BDF8` | `--accent-cyan` | Scan progress, focal node & active indicators |
| **Crisp Emerald** | `#10B981` | `--accent-emerald` | Excel export, ready status & live connection |
| **Off-White Text** | `#F8FAFC` | `--text-primary` | Main titles, headlines & value labels |
| **Slate Secondary** | `#94A3B8` | `--text-secondary` | Subtitles, labels & secondary text |
| **Muted Slate** | `#64748B` | `--text-muted` | Category tags, metadata & borders |
| **Subtle Border** | `rgba(255, 255, 255, 0.08)` | `--border-card` | Card outlines & structural dividers |

---

## 4. Typography Hierarchy

RAMOS utilizes system UI fonts (`Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`):

- **Header / Brand Title**: 14px, `font-weight: 700`, `letter-spacing: -0.01em` (`RAMOS`)
- **Functional Descriptor**: 9px, `font-weight: 600`, uppercase, `letter-spacing: 0.05em` (`LEAD INTELLIGENCE`)
- **Card Headlines**: 10.5px, `font-weight: 600`, uppercase, `letter-spacing: 0.04em`, muted slate
- **Body & Controls**: 11.5px, `font-weight: 500-600`
- **Status Badges**: 9.5px, `font-weight: 600`, uppercase pill container

---

## 5. Icon Usage Matrix

| Icon Asset | Resolution | Context / Usage |
| :--- | :--- | :--- |
| `extension/assets/ramos-icon-16.png` | 16x16 px | Chrome favicon & small extension context menu |
| `extension/assets/ramos-icon-32.png` | 32x32 px | Chrome extension management & popup header |
| `extension/assets/ramos-icon-48.png` | 48x48 px | Chrome toolbar button & management list |
| `extension/assets/ramos-icon-128.png` | 128x128 px | Chrome Extension detail card & high-DPI displays |
| `extension/assets/ramos-icon.svg` | Vector | High-DPI source asset & documentation |

---

## 6. Do's and Don'ts

### DO:
- Keep background surfaces deep obsidian (`#0A0C12` / `#12151F`).
- Use crisp 1px translucent borders (`rgba(255, 255, 255, 0.08)`).
- Use tactile linear gradients with inner top bevels for primary buttons.
- Use vector SVG icons for interactive utilities (e.g. file upload dropzone).
- Maintain subtle segmented controls for multi-mode switching.

### DON'T:
- DON'T use oversaturated neon purple or cyan text on dark backgrounds.
- DON'T use flat emojis as UI icons.
- DON'T introduce light themes or white page backgrounds in the extension popup.
- DON'T modify Google Maps DOM selectors, extraction state machines, or CSV schemas during visual styling.
