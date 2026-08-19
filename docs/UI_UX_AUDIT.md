# UI / UX Audit Summary

Status: AUDITED Baseline (v1.0.16)
> [!NOTE]
> **NO UI POLISH HAS BEEN PERFORMED YET.**
> This document records the current visual and user experience state of the Sales Intel web application.

---

## 1. Page-by-Page Audit

### A. Dashboard (`/dashboard` or `/`)
- **Route**: `src/routes/_authenticated/dashboard.tsx`
- **Purpose**: Key metrics dashboard showing total leads, verified leads, recent discovery jobs, and activity overview.
- **Current UI State**: Modern card-based layout using Radix primitives and lucide-react icons. Displays summary counters and quick action shortcuts.
- **Audited Observations**: Layout is functional and clean. Empty states render gracefully when no leads exist.

### B. Lead Finder (`/finder`)
- **Route**: `src/routes/_authenticated/finder.tsx`
- **Purpose**: Primary starting point for lead discovery.
- **Current UI State**: Tabbed view allowing selection between Chrome Extension discovery instructions and optional server scraper triggers.
- **Audited Observations**: Extension pairing status is prominently displayed. Step-by-step guidance directs user to Google Maps.

### C. Lead Management Datatable (`/leads`)
- **Route**: `src/routes/_authenticated/leads.index.tsx`
- **Purpose**: Core lead view for searching, filtering, exporting, and managing discovered leads.
- **Current UI State**: Features search bar, date range presets (Today, Yesterday, 7D, 30D), email status dropdowns, boolean filter toggles, sorting options, and pagination controls.
- **Audited Observations**: Status badges (`valid` = green, `invalid` = red, `risky` = yellow, `unverified` = gray) accurately reflect lead status.

### D. Lead Detail View (`/leads/$id`)
- **Route**: `src/routes/_authenticated/leads.$id.tsx`
- **Purpose**: Full profile view of an individual lead.
- **Current UI State**: Displays business identity, contact metadata, Google Maps rating/reviews, interactive attribute list, and audit history timeline (`lead_history`).
- **Audited Observations**: Clean information hierarchy with back navigation to `/leads`.

### E. Background Jobs (`/jobs`)
- **Route**: `src/routes/_authenticated/jobs.tsx`
- **Purpose**: Inspection view for queued, running, completed, and failed background jobs.
- **Current UI State**: Real-time progress bars (`@radix-ui/react-progress`), status indicators, error message popups, and retry controls.
- **Audited Observations**: Progress updates smoothly as jobs complete.

### F. Settings & Connections (`/settings`)
- **Route**: `src/routes/_authenticated/settings.tsx`
- **Purpose**: Integrations and setup page for Chrome Extension connection and email verifier health.
- **Current UI State**: Status cards for Extension connection (**Connect Extension** button, token sync indicator) and service health indicators.
- **Audited Observations**: Connect workflow operates seamlessly via window messaging.

---

## 2. Global Styling & UI System

- **Design System**: Vanilla CSS (`src/styles.css`) + Tailwind CSS v4 (`@tailwindcss/vite`).
- **Component Primitives**: Shadcn / Radix UI component wrappers (`src/components/ui/`).
- **Icons**: Lucide Icons (`lucide-react`).
- **Notification Toasts**: Sonner toast library (`sonner`).
