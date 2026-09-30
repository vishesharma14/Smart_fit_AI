# CLAUDE.md — SizerAI Project Instructions

This file is the permanent source of development rules for the SizerAI project.
Read it before starting any task in this repository and follow it for all work.

---

## 1. Product

- **Name:** SizerAI
- **Tagline:** "Perfect Fit. Powered by AI."
- **Concept:** An AI-powered fashion-tech application that helps users find the right clothing size.

### Long-term product flow (vision only)

```
Welcome
→ User Information
→ Clothing Selection
→ Professional Body Scan
→ Body Measurements
→ AI Size Prediction
→ Results
→ Save Fit Profile
→ Profile / Scan History
→ Shopping Search
→ Size-aware Shopping
```

This is the long-term vision. **Do not implement any of these features unless the
current step explicitly asks for it.**

---

## 2. Current Repository State

Step 1 (application foundation) and Step 2 (Welcome page) are complete. The project
is a Vite + React + TypeScript app with a single route (`/`, the Welcome page). The
Welcome page's Start button stays unavailable until `WELCOME_NEXT_PATH` in
`src/routes/paths.ts` points to a real route.

Scripts: `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint), `npm run preview`.

```
src/
  main.tsx            entry point (imports global CSS, mounts <App />)
  App.tsx             MotionConfig + RouterProvider
  assets/             static assets imported by code
  components/         reusable UI components (SkipLink, Button, BrandLogo)
  layouts/            route layouts (RootLayout: skip link + <main> + <Outlet />)
  pages/              route pages (HomePage: Welcome page)
  routes/router.tsx   route definitions (createBrowserRouter)
  routes/paths.ts     central path constants + WELCOME_NEXT_PATH
  store/              Zustand store (useAppStore) composed from slices/
                      (user, fit, settings); only units/theme are persisted
  hooks/              reusable hooks (useDocumentTitle)
  services/           side-effect/IO modules (safe localStorage wrapper)
  utils/              pure helpers and constants
  types/domain.ts     domain types (lengths in cm, weight in kg)
  styles/             tokens.css (design tokens) + global.css (reset/base)
```

> Keep this section accurate when the project structure changes significantly.

---

## 3. Tech Stack

Intended stack:

- React
- TypeScript
- Vite
- React Router
- Zustand (state management)
- Framer Motion (animation)
- Custom CSS (no UI framework unless explicitly approved)
- Lucide React (icons)

If the repository already contains a working setup, use the existing project choices
unless there is a strong technical reason to change them. Explain any such reason
before changing it.

---

## 4. Development Rules

1. Always inspect existing code before modifying it.
2. Never unnecessarily delete, rewrite or recreate working code.
3. Work in small controlled steps.
4. Implement ONLY the feature explicitly requested in the current step.
5. Never automatically continue to future steps.
6. Preserve existing functionality while adding new functionality.
7. Prefer reusable components over duplicated code.
8. Keep UI, business logic, state management and services reasonably separated.
9. Use TypeScript properly (avoid `any`, type props, state and service boundaries).
10. Avoid unnecessary dependencies.
11. Never hardcode secrets, API keys or credentials.
12. Never create fake AI functionality and present it as real.
13. Never present mock measurements, fake scan results or simulated predictions as real results.
14. If a requested AI/body-scanning capability has technical limitations, explain the limitation before implementation.
15. Prioritize privacy when handling camera/body data.
16. Do not permanently store raw camera images or videos unless explicitly implemented and justified.
17. Keep the application responsive for desktop, tablet and mobile.
18. Maintain accessibility where practical.
19. Run the appropriate tests/build checks after meaningful changes.
20. Run `npm run build` after major implementation steps and fix errors introduced by the changes.
21. Keep the Git repository clean and use meaningful commits/checkpoints after completed major steps.
22. Do not modify unrelated features while fixing a specific issue.

---

## 5. Development Workflow

For every task:

1. Understand the requested step.
2. Inspect the relevant existing files.
3. Explain the implementation approach briefly if the task is complex.
4. Modify only the necessary files.
5. Reuse existing components where possible.
6. Run validation/build checks.
7. Fix errors introduced by the implementation.
8. Report exactly what changed.
9. Stop and wait for the next instruction.

**Never silently implement future features.**

---

## 6. Design Direction

SizerAI should feel like a premium commercial AI fashion-tech product.

Use:

- deep navy/black foundation
- subtle purple/cyan/blue accents
- sophisticated gradients
- premium typography
- modern rounded surfaces
- carefully used glassmorphism
- subtle glow effects
- smooth Framer Motion animations
- excellent spacing and visual hierarchy
- responsive layouts
- clean, professional interface

Avoid:

- generic college-project UI
- excessive gradients
- excessive glowing effects
- excessive animations
- clutter
- unnecessary 3D elements
- fake AI visualizations presented as functionality

---

## 7. Body Scanning Rule (Technical Honesty)

The future body scanning system must be technically honest.

Before implementing it, analyze and document:

- browser camera APIs
- pose detection
- body landmark detection
- full-body detection
- multi-angle scanning
- measurement estimation
- calibration
- lighting
- camera distance
- privacy
- device performance
- realistic accuracy limitations

Requirements:

- Never generate random or placeholder measurements and present them as real.
- A successful scan may only be shown when the implemented detection pipeline
  actually determines that the required conditions are satisfied.
- Clearly communicate estimation uncertainty to the user.
- Process camera frames locally where possible; do not upload or persist raw
  images/video without explicit, justified implementation and user consent.

---

## 8. Git / Repository

- The GitHub repository `smart_size_AI` is the source of truth.
- Do not create unnecessary repositories.
- Do not push secrets (use environment variables and keep `.env` files out of Git).
- Keep changes organized into logical, meaningful commits.
