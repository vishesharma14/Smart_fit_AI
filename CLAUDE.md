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

Completed steps: 1 (application foundation), 2 (Welcome page), 3 (User Information),
4 (Clothing Selection), 5 (Body Scan foundation), Phase A (real on-device pose detection),
clothing-specific scan regions.

Routes: `/` Welcome → `/details` User Information (fit-flow step 1 of 4) →
`/clothing` Clothing Selection (step 2 of 4) → `/scan` Body Scan (step 3 of 4).

Body Scan status: real camera (getUserMedia, video only) with on-device lighting
and movement checks plus **MediaPipe Pose Landmarker (Full model)** running on-device
(`@mediapipe/tasks-vision`; model in `public/models/`, wasm bundled — no CDN, no
upload). Per frame: one person, framing/distance, joint visibility, orientation
(front / turned left / back / turned right, from several voting signals),
upright, arms and stance, stillness. An angle is auto-captured only after the pose
stays valid for `captureHoldMs` (1.5 s) and `captureMinFrames` consecutive frames
(`utils/pose/poseConfig.ts`); the capture keeps averaged landmarks only, never
images. **No measurements, size prediction or size charts exist yet.**
`?poseDebug` shows a developer panel + skeleton (`&poseDelegate=CPU|GPU` forces
the delegate). Camera framing: requests 4:3 (960×720 ideal) to keep the sensor's
full height, sets the minimum zoom only when the camera exposes zoom, and the
preview follows a portrait stream's shape (never cropping head/feet).
Scan regions (`utils/pose/scanRegions.ts`): the selected clothing decides the validated region —
T-shirt/Shirt/Blazer → upper body (face to just below the hips, feet not required),
Jeans/Trousers → lower body (waist to feet, head not required), nothing selected → full body.
Each region defines framing bounds, required landmarks, edge points, posture checks, stillness
points and copy; one shared pipeline (assessPose/usePoseScan) applies it. Orientation votes only
use cues actually in the camera's view. MediaPipe detects people from the head/upper body, so a
legs-only frame can't be detected; tracking can continue once detected.
Scan session state is local to the page (no global state).
User information and the clothing selection are kept in memory only (not
persisted); height/weight display units and theme are persisted.
Fit-flow pages share `layouts/FlowStepLayout` (top bar + intro column + form,
Back/Continue) and `components/form/FormCard`.

Scripts: `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint), `npm run preview`.

```
src/
  main.tsx            entry point (imports global CSS, mounts <App />)
  App.tsx             MotionConfig + RouterProvider
  assets/             static assets imported by code
  components/         reusable UI components (SkipLink, Button, BrandLogo, StepProgress)
  components/form/    form primitives (FormField, FormCard, TextInput, SegmentedControl, ChoiceCards)
  components/icons/   custom Lucide-style icons (clothing)
  components/scan/    ScanViewport (camera + states), BodyGuideOverlay (scan frame + one 3D
                      reference mannequin), ScanStatus (+ capture progress), ScanPhaseProgress,
                      PoseDebugOverlay / PoseDebugPanel (?poseDebug only)
  components/scan/mannequin/  Three.js reference mannequin: procedural geometry, shader
                      scene (renders on demand only), lazily loaded React wrapper
  layouts/            RootLayout (skip link + <main> + <Outlet />), FlowStepLayout (fit-flow steps)
  pages/              route pages (HomePage, UserInfoPage, ClothingSelectionPage, BodyScanPage)
  routes/router.tsx   route definitions (createBrowserRouter)
  routes/paths.ts     central path constants (PATHS) + WELCOME_NEXT_PATH
  store/              Zustand store (useAppStore) composed from slices/
                      (user, fit, settings); only display units/theme are persisted
  hooks/              reusable hooks (useDocumentTitle, useUserInfoForm, useClothingSelectionForm,
                      useCamera, useFrameQuality, useScanSession, usePoseScan)
  services/           side-effect/IO modules (safe localStorage wrapper, camera,
                      frame analysis, pose/poseLandmarker = MediaPipe engine)
  utils/              pure helpers: constants, motion presets, unit conversion,
                      user-info validation, clothing catalog + validation,
                      scan phases + scan guidance, scanPreview, pose/ (landmarks, orientation,
                      validation + capture hold, config, scanRegions = clothing → body region)
  types/domain.ts     domain types (lengths in cm, weight in kg)
  types/scan.ts       scan/camera types (ScanCapture = landmark snapshot)
  types/pose.ts       pose landmark types
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
- Three.js (only for the 3D reference mannequin on the Body Scan page; lazy-loaded)
- @mediapipe/tasks-vision (on-device pose detection on the Body Scan page; lazy-loaded)

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
