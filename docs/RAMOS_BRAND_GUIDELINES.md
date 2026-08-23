# RAMOS — Brand Guidelines & Visual Identity System (v1.0.1)

## Overview
**RAMOS** is a standalone, internal lead extraction and business discovery tool built for high-precision Google Maps data collection.

This document specifies the visual identity, brand personality, logo mark geometry, color palette tokens, typography, and popup UI guidelines for RAMOS v1.0.1.

---

## 1. Brand Personality & Core Values

- **Modern & Technical**: Designed as a sleek, high-efficiency engineering tool.
- **Intelligent & Bounded**: Sharp visual indicators for real-time discovery state and candidate isolation.
- **Reliable & Premium**: Dark navy surfaces with electric cyan accents and vibrant violet focus points.
- **Internal Product First**: Functional, clean, zero consumer bloat or marketing fluff.

---

## 2. Logo Concept & Geometry

The RAMOS symbol is an abstract, technical mark combining three core ideas:
1. **The Letter "R"**: Stylized, geometric stroke structure.
2. **Scanning & Radar**: Concentric focal node indicating real-time spatial discovery.
3. **Data Extraction & Connection**: Intersecting vector points highlighting canonical lead extraction.

```
       ┌─────────┐
       │   R   ● │  <- Scanner Focal Node
       │  ╱  ╲   │
       └─┴────┴──┘
```

> [!IMPORTANT]
> **Branding Boundaries**:
> - DO NOT use a literal Google Maps teardrop pin.
> - DO NOT use Sales Intel orange (`#FF6B00`) or teal (`#00A896`).
> - DO NOT copy Google Maps logo styling or colors.

---

## 3. Color Palette Tokens

The RAMOS visual language uses a deep navy dark theme with vibrant violet and electric cyan focal points.

| Token | Hex Value | CSS Variable | Purpose / Context |
| :--- | :--- | :--- | :--- |
| **Dark Navy Base** | `#0B1020` | `--bg-root` | Primary application background |
| **Surface Navy** | `#161E33` | `--bg-card` | Card & panel container surface |
| **Surface Elev** | `#1E293B` | `--bg-card-hover` | Interactive element hover background |
| **Deep Violet** | `#7C3AED` | `--primary-violet` | Primary brand accent & active states |
| **Electric Cyan** | `#06B6D4` | `--accent-cyan` | Live scan progress, status dots & highlights |
| **Bright Cyan** | `#22D3EE` | `--accent-cyan-glow` | Hover glows & active status badges |
| **Text White** | `#F8FAFC` | `--text-primary` | Main titles, headlines & value labels |
| **Text Slate** | `#94A3B8` | `--text-secondary` | Subtitles, labels & secondary text |
| **Border Dark** | `#334155` | `--border-subtle` | Card borders & input outlines |

---

## 4. Typography Hierarchy

RAMOS utilizes system UI fonts (`Inter`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `sans-serif`):

- **Header / Brand Title**: 16px, `font-weight: 700`, `letter-spacing: 0.5px` (`RAMOS`)
- **Functional Descriptor**: 11px, `font-weight: 500`, uppercase, `color: var(--accent-cyan)` (`MAPS LEAD EXTRACTOR`)
- **Card Headlines**: 11px, `font-weight: 600`, uppercase, `letter-spacing: 0.8px`
- **Body & Controls**: 13px, `font-weight: 400`
- **Status Badges**: 10px, `font-weight: 700`, uppercase, pill container

---

## 5. Icon Usage Matrix

| Icon Asset | Resolution | Context / Usage |
| :--- | :--- | :--- |
| `extension/assets/ramos-icon-16.png` | 16x16 px | Chrome favicon & small extension context menu |
| `extension/assets/ramos-icon-32.png` | 32x32 px | Chrome extension management sub-views |
| `extension/assets/ramos-icon-48.png` | 48x48 px | Chrome toolbar button & management list |
| `extension/assets/ramos-icon-128.png` | 128x128 px | Chrome Extension detail card & high-DPI displays |

---

## 6. Do's and Don'ts

### DO:
- Keep background surfaces dark navy (`#0B1020` / `#161E33`).
- Use Electric Cyan (`#06B6D4`) for live candidate indicators and status dots.
- Use Deep Violet (`#7C3AED`) for primary action buttons (**Run Discovery**).
- Maintain crisp 1px borders using `#334155`.

### DON'T:
- DON'T introduce light themes or white page backgrounds in the extension popup.
- DON'T use orange, yellow-green, or legacy Sales Intel branding elements.
- DON'T modify Google Maps DOM selectors, extraction state machines, or CSV schemas during visual styling.
