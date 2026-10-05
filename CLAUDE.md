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
clothing-specific scan regions, 6 (mobile-first layout), 7 (body measurement engine),
8 (measurement review and confirmation), 9B (silhouette measurements), 9C (guided automatic 360° scan),
9E-2 (Anny body-model shadow mode, developer view only), 9E-3A (real-person validation infrastructure, developer view only), 9E-3B (controlled real-person validation tooling;
no real-person data collected yet), 10 (rule-based size recommendation engine), 11 (Results and Fit Profile), 12 (final polish: README, 404 page,
Welcome-page profile link, wording review), 13 (personalized fit preference), 14 (scan quality score), 15 (reference brand sizing).

Routes: `/` Welcome → `/details` User Information (fit-flow step 1 of 4) →
`/clothing` Clothing Selection (step 2 of 4) → `/scan` Body Scan (step 3 of 4) →
`/measurements` Measurement Review (step 4 of 4) → `/results` Results → `/profile` Fit Profile (after the flow; no step
progress). Unknown paths → `NotFoundPage` (`*` route). The Welcome page shows "My Fit Profile" once a profile is saved.
`README.md` is the public project description (keep it technically honest when features change). `index.html` sets a
Content-Security-Policy `connect-src 'self' blob: data:`: the page may only connect to its own origin (blocks MediaPipe's
built-in usage logging to odml.pa.googleapis.com, which has no opt-out) — keep it when adding features; any new network
destination must be deliberate.

Body Scan status: real camera (getUserMedia, video only) with on-device lighting
and movement checks plus **MediaPipe Pose Landmarker (Full model)** running on-device
(`@mediapipe/tasks-vision`; model in `public/models/`, wasm bundled — no CDN, no
upload). Per frame: one person, framing/distance, joint visibility, orientation
(front / turned left / back / turned right, from several voting signals),
upright, arms and stance (front/back views), stillness — `assessPose` has no target angle.
Guided automatic 360° scan (Step 9C, `utils/scan360/`): the user faces the camera, then turns slowly to the left.
`bodyYaw.ts` turns the orientation votes into a continuous body angle (|cos| from shoulder width relative to the
front view's width ratio; front/back and left/right signs from the existing votes; before the front is captured
the front is recognised by the orientation classifier and defines 0°). Eight views (`views.ts`: 0°, 45°…315°, ±15°
windows; cardinal = front/left/back/right). `capture.ts` `decideFrame` accepts a frame only with a valid pose, good
light, a clear angle inside an uncaptured view's window (front first; ≥30° from captured angles), a usable outline
(`silhouette/outlineQuality.ts`: head/feet in frame, height consistent with the joints, sharp edges) and stillness,
else returns the reason; `stepViewHold` captures after `viewMinFrames` (8) over `viewHoldMs` (1 s) with per-landmark
and per-row medians, discarding holds whose angle (>12°) or outline height (>4%) drifted. Captures keep landmarks,
the measured angle and outline numbers only. `session.ts` (one capture per view, never overwritten): complete with
all 8 views, or the 4 cardinal views + turning back to face the camera; "Finish with N views" only with front + a
side view. UI: coverage ring (`ScanCoverage`), live angle, capture-quality pill, guide figure turned to the next
view, concise guidance (`scanGuidance.ts`) and voice. No timers decide views.
Scan guidance: one primary instruction shown large over the camera preview (`ScanInstruction`)
plus the status panel; optional voice guidance (`useVoiceGuidance` → `utils/voiceSchedule.ts`
scheduler → `services/speech.ts`, browser SpeechSynthesis only, prefers a male English system
voice) speaks the same instruction with settle/min-gap/repeat rules so it never repeats per
frame. Voice is output only — it never affects detection or capture. The voice on/off
preference is persisted with the other display settings.
Phones/touch tablets: while the camera is on, the scan stage becomes a full-screen view
(compact coverage ring on top, largest undistorted preview, and a bottom dock with the status /
instruction / hold progress above 48px+ controls; fixed-height status so the preview never
resizes; page behind inert and scroll-locked; landscape phones get the dock as a side column).
`viewport-fit=cover` + `env(safe-area-inset-*)` keep content clear of notches and the home
indicator. Touch devices start
with the rear camera (falls back to any camera); the screen is kept awake with the Wake Lock
API where supported. Desktop keeps the page layout.
Measurement engine (Step 7, `utils/measurement/`, pure and unit-tested):
`measureScan({ captures, region, userHeightCm })` → `MeasurementReport` (types in `types/measurement.ts`).
Lengths between joints are measured on the captures' 3D world landmarks per angle and combined across
angles (weighted median; agreement, visibility and angle coverage drive confidence): shoulder width
(joint centres), arm length, torso length (upper/full) and leg length hip→ankle (lower/full).
Girths and inseam come from the body outline (Step 9B, below). Pixels are never treated as cm: joint-length scale comes from a
calibration — `user-height` (entered height ÷ stature from a full-body front/back capture; the only one
that allows `valid`), else `pose-model-metric` (model's metre estimate, low confidence → at most
`uncertain`), else `none` (model units). Statuses: valid / uncertain / invalid (no value) / unsupported.
Measurement review (Step 8): when the scan is finished, "Review measurements" on the scan page runs
`measureCompletedScan` (`utils/measurement/fromScan.ts` → `measureScan`, region from the selected garment,
the entered height) and stores the `ScanMeasurementResult` as `scanMeasurements`, then opens
`/measurements` (`MeasurementReviewPage`). It lists every measurement with value/unit, status, confidence
level and reason. Only measurements with a value (valid/uncertain, cm) can be edited; input is validated
and kept exactly as typed (`utils/measurement/review.ts`); edits keep the engine's status/confidence and set
`manuallyEdited` (+ `measuredValue`). "Confirm Measurements" stores `ConfirmedMeasurements` as `measurements`
in the user slice (in memory only; a new scan result clears an older confirmation) — the input for size
prediction later.
Silhouette measurements (Step 9B): the Pose Landmarker runs with `outputSegmentationMasks: true` (same model). The
mask is read only inside the detection callback (`detect(video, ts, readMask)`), only while the pose is valid or in
`?poseDebug`, and turned straight into numbers by `utils/silhouette/extract.ts` (per-row edge runs seeded from the
joints, head top / floor traced along connected runs, crotch = top of the leg gap); it is never copied, stored or
uploaded. `combine.ts` takes the per-row median over the hold frames (+ width jitter) → `ScanCapture.silhouette`
(in the 360° scan a frame needs a usable outline to count; poor outlines lower confidence or make measurements
unavailable, never guessed). Every scan now
validates the full body (`SCAN_FRAMING_REGION`) so the entered height can scale each capture
(`silhouetteScale`: height ÷ outline head-top-to-floor, per capture; views whose outline height is >8% off the
median are left out). `levels.ts` finds chest / waist / hip / thigh rows on front/back outlines (arms/hands must be
clear) and reads side depth at the same height fraction; `utils/measurement/silhouetteMeasure.ts` gives girths as
ellipse perimeters (width × depth) and inseam = crotch→floor, with confidence from edge sharpness, steadiness, scale
trust, view agreement, coverage and a model factor; depth only from the true side views, and 45° views check the
elliptical cross-section (√((W cos θ)² + (D sin θ)²) vs measured width), raising or lowering confidence without
changing values. **Outline measurements are capped at `uncertain` until validated
against tape measurements of real people.** Tunables: `utils/silhouette/silhouetteConfig.ts`, `SILHOUETTE_MEASUREMENT`.
Anny shadow mode (Step 9E-2, experimental, `?poseDebug` only): `tools/anny-export/` (pinned Anny revision
d6fc027, run offline with PyTorch) writes `public/models/anny/anny-compact-v1.bin` (~2 MB: mean + 20 PCA components
of rest-pose Anny bodies incl. 12 joints, triangles, arm/leg masks, waist loop, crotch vertex; NOTICE.txt =
Apache-2.0 / CC0 attribution). `utils/anny/` (format loader, shape evaluation, exact triangle slicing + tape-like
convex-hull circumferences, Gauss–Newton fitter, mesh measurements, `scanInput` = ScanCapture outline widths → fit
input, `shadow` = reliability gate + comparison) runs in `workers/annyFit.worker.ts` via `hooks/useAnnyShadow`
(only when `?poseDebug` and the scan is finished — normal scans never download the model). Unreliable fits
(residual > 2 cm, height mismatch, out-of-range shape) are `unavailable`. All Anny measurement definitions need
anthropometric validation; results are never used for the review page, final measurements, size prediction or
saved data. The production ellipse engine is unchanged.
Validation mode (Step 9E-3A, experimental, `?poseDebug` only): `components/scan/validation/ValidationPanel` (lazy-loaded)
records an anonymous test subject (ID = letters/digits/hyphens only, tape height) with manual tape measurements
(`TapeMeasurement { name, value, unit 'cm', notes? }` for chest, waist, hip, thigh, inseam, shoulder width, arm length,
leg length; empty = not taped, never filled in; `utils/validation/groundTruth.ts` checks numbers/ranges/IDs) and, per
finished scan, a `ValidationScanAttempt` (types in `types/validation.ts`): attempt number, timestamp, clothing worn + fit,
device, camera, lighting, entered height, views, the production engine's values (`fromScan.ts`: `measureScan` with
region `full`, formulas unchanged) and the Anny shadow's values + fit info (residual, height error, worker time, views).
`compare.ts` (signed = scan − tape, abs, %; unavailable predictions get no value or error), `metrics.ts` (MAE, bias,
median/max abs, valid and unavailable counts per engine, overall and per measurement), `repeatability.ts` (scan 1 vs
each later scan, as differences — never ground truth), `export.ts` (JSON/CSV built from whitelisted fields;
`assertExportSafe` rejects landmark/outline/mask/frame/image fields, binary data and data URLs; CSV cells are
formula-escaped). Records live in `store/validationStore.ts` (memory only, not persisted). `syntheticFixture.ts` is
SYNTHETIC test data for tests only. No accuracy claims: nothing has been validated on real people yet.
Step 9E-3B (controlled real-person validation, same panel/store): standardized tape protocol + controlled scan procedure
(`definitions.ts` `protocol`, `HEIGHT_PROTOCOL`, `SCAN_PROCEDURE`; a consistency guide, not an ISO claim); thigh/arm
side required, shoulder-width/leg-length method notes required; ground truth fixed once a scan is recorded (store
`saveSubject` refuses changes; attempts never overwritten). Every attempt is recorded, `usable` or not
(`scanUsability`: unfinished scan, no / mismatched (>1 cm) entered height, or tester's reason) — unusable attempts get
no values from either engine and are excluded from metrics/repeatability but counted. Metrics are per measurement
plus circumference vs length pools (no single combined figure); `annyReliability` = availability, rejection rate and
reasons, fit/height error, worker time. Attempts also keep browser summary (`browser.ts`, never the full UA), optional
device details, Anny model-load/fit ms and `performance` (scan start→finish, first→last view, pose-model runs/s and
ms/frame sampled by `useScanPerformance`, tester observations). Labels: "REAL-WORLD VALIDATION — EXPERIMENTAL",
"These results do not yet establish production clothing-size accuracy." Anny's 2 cm gate and all engines unchanged.
Size recommendation (Step 10, `utils/sizing/`, pure and unit-tested): `recommendSize({ garment, measurements, audience? })`
→ `SizeRecommendation` (types in `types/sizing.ts`): size S–XXL, fit (Good Fit / Slightly Tight / Slightly Loose /
No Suitable Size / Insufficient Data), measurements used, alternative size at a boundary, reason, chart name. Rule-based,
deterministic — not machine learning. `sizeCharts.ts` holds generic adult body-measurement charts (contiguous S–XXL
ranges, min inclusive / max exclusive; replaceable by brand charts): T-shirt chest; shirt and blazer chest + waist; jeans
and trousers waist + hip. The primary measurement decides; the secondary sizes up when it needs a larger size; values
within 3 cm outside the chart get the end size (tight/loose), further out = `outside-range`. Missing / invalid /
unsupported / model-unit / implausible primary values → `insufficient-data` (never substituted); `uncertain` values are
used but flagged; children's sizes → `unsupported`. `fromConfirmed.ts` `recommendForConfirmed` uses the confirmed
measurements and the scanned garment (else the clothing selection); the Measurement Review page shows
`components/sizing/SizeRecommendationCard` once measurements are confirmed, plus a "View Results" link.
Results and Fit Profile (Step 11): `ResultsPage` (`/results`) shows the recommendation for the confirmed measurements
(`components/results/SizeHero` — size never invented: insufficient data shows no size — "Why this size?", measurements
used with confidence via `MeasurementList`) and Save Fit Profile / Edit Measurements (opens the review page in edit
mode via router state `{ edit: true }`) / Scan Again. Saving is only possible for a recommended size:
`utils/profile/fitProfile.ts` `buildFitProfile` → `FitProfile` (`types/profile.ts`: garment, size, fit, alternative,
chart, measuredAt / confirmedAt / savedAt, confirmed measurements with a cm value); re-saving the same scan updates it
("Update Fit Profile"). Fit slice: `saveFitProfile` (also upserts a lightweight `ScanRecord` history, newest first,
max 10, one entry per scan + garment) and `deleteFitProfile`. `ProfilePage` (`/profile`): saved size, last scan / saved
dates, saved measurements, previous results, Scan Again, View latest results, Delete Profile (two-step); empty state
with Start a scan (details page until a height is entered). `fitProfile` and `scanHistory` are persisted with the
display preferences in browser storage on this device only (numbers only; validated on load by `isFitProfile` /
`isScanRecord`; deletable). `FlowStepLayout` takes an optional `step` (none → `topbarExtra`).
Fit preference (Step 13): `FitPreference` = 'slim' | 'regular' | 'relaxed' (`types/domain.ts`), chosen on the Clothing
Selection page ("How do you like your clothes to fit?", `FIT_DEFINITIONS`; Regular preselected via `defaultFitFor`;
trousers/blazers offer Slim/Regular only) and kept in `clothingSelection.fit` (memory, survives Scan Again).
`recommendSize({ …, fitPreference })` (default Regular = unchanged behaviour) only moves between neighbouring sizes when
the deciding measurement allows it: Slim → smaller size if within `SIZING_RULES.slimReachCm` (1 cm) above it and the
other measurement fits it; Relaxed → larger size if in the top `edgeBandFraction` band. Result carries `fitPreference` +
`preferenceAdjustment`; insufficient-data / outside-range are unaffected. `fitPreferenceFor` (fromConfirmed) uses the
selection's fit only for the matching garment. Results/Profile show "Your preference"; `FitProfile.fitPreference` is
saved, and `normalizeFitProfile` loads older profiles without it as Regular.
Scan quality (Step 14, `utils/scanQuality/scanQuality.ts`, types `types/scanQuality.ts`): `calculateScanQuality({ captures,
report, userHeightCm })` → `{ score 0–100, level, factors, recommendations, cappedBecause }`, deterministic, from existing
per-capture signals only: visibility (key-joint landmark visibility, best side per pair; ×0.5 if the outline is
head/floor-clipped), stability (outline `widthJitter` → 1 − jitter / `maxWidthJitter`), coverage (0.8 × main views + 0.2
× angled views), outline (share with an outline × median edge sharpness), calibration (report calibration confidence +
per-capture `silhouetteScale` confidence). Weights 20/15/25/25/15; null factors are dropped and weights renormalised;
missing a main view caps the score at 74 (Fair). Levels ≥90 / ≥75 / ≥60. Lighting is not stored per capture, so not
scored. Computed in BodyScanPage's "Review measurements" and kept on `ScanMeasurementResult.scanQuality` (memory only,
never on the profile). Shown by `components/scanQuality/ScanQualityCard` on the review page and as a one-line
"Scan quality" note in the Results hero. Never changes measurements, sizing or the confirm/edit rules.
Reference brand sizing (Step 15, `utils/sizing/brandCharts.ts` + `recommendBrandSize.ts`): `SizingBrandId` = 'generic' |
'nike' | 'levis' | 'hm'; `BrandSizeChart { brandId, brandName, charts (partial per garment), sourceNote }` — hand-entered
reference letter-size charts, not official data, no API/scraping (`REFERENCE_CHART_DISCLAIMER`, `REFERENCE_SIZING_NOTE`).
`recommendBrandSize({ brand, garment, measurements, fitPreference })` → `BrandSizeRecommendation` (SizeRecommendation +
brand, brandName, chartAvailable): Generic = `recommendSize` exactly; a brand runs the same engine (`charts` param, same
fit-preference rules) on its chart; no chart for the garment → `unsupported`, no size, reason "Reference chart
unavailable…" (never falls back to generic). Coverage: Nike t-shirt/trousers; Levi's t-shirt/shirt/jeans/trousers; H&M all.
`recommendBrandForConfirmed` (fromConfirmed) feeds the Results page; the choice is `sizingBrand` in the user slice (memory,
default Generic) via a "Brand" card (`SegmentedControl` `segmented--block`). The review-page card stays generic.
`FitProfile.brand` is saved (`normalizeFitProfile` → 'generic' for older profiles; `isSavedFrom` compares it); SizeHero
shows a "Brand" line (`brandName` prop) and `fitLabel` override. Scan history is unchanged.
`?poseDebug` shows a developer panel (body angle, frame decision + accept/reject counts, outline quality, hold,
coverage, saved views with angles, per-view outline scale) + skeleton, plus the live outline edges, head top / floor /
crotch and the measurement levels (`&poseDelegate=CPU|GPU` forces the delegate). Camera framing: requests 4:3 (960×720 ideal) to keep the sensor's
full height, sets the minimum zoom only when the camera exposes zoom, and the
preview follows a portrait stream's shape (never cropping head/feet).
Scan regions (`utils/pose/scanRegions.ts`): every scan validates the full body (`SCAN_FRAMING_REGION`, Step 9B);
the selected clothing decides the measurement region — T-shirt/Shirt/Blazer → upper body,
Jeans/Trousers → lower body, nothing selected → full body (the upper/lower framing definitions remain available).
Each region defines framing bounds, required landmarks, edge points, posture checks, stillness
points and copy; one shared pipeline (assessPose/usePoseScan) applies it. Orientation votes only
use cues actually in the camera's view. MediaPipe detects people from the head/upper body, so a
legs-only frame can't be detected; tracking can continue once detected.
Scan session state is local to the page (no global state).
User information and the clothing selection are kept in memory only (not
persisted); height/weight display units, theme, the voice-guidance preference and the user-saved fit profile
(+ short history) are persisted.
Fit-flow pages share `layouts/FlowStepLayout` (top bar + intro column + form,
Back/Continue) and `components/form/FormCard`.

Scripts: `npm run dev`, `npm run build` (`tsc -b && vite build`), `npm run lint` (oxlint), `npm test` (Vitest,
`*.test.ts(x)` next to the modules; UI tests use jsdom + Testing Library), `npm run preview`.

```
src/
  main.tsx            entry point (imports global CSS, mounts <App />)
  App.tsx             MotionConfig + RouterProvider
  assets/             static assets imported by code
  components/         reusable UI components (SkipLink, Button, BrandLogo, StepProgress)
  components/form/    form primitives (FormField, FormCard, TextInput, SegmentedControl, ChoiceCards)
  components/icons/   custom Lucide-style icons (clothing)
  components/scan/    ScanViewport (camera + states), BodyGuideOverlay (scan frame + one 3D
                      reference mannequin), ScanStatus (+ capture progress), ScanCoverage (360° ring),
                      PoseDebugOverlay / PoseDebugPanel (?poseDebug only)
  components/scan/validation/  ValidationPanel (?poseDebug only, lazy): protocol, tape ground truth, scan records
                      (usable/unusable), metrics, repeatability, Anny reliability, export; useScanPerformance
  components/sizing/  SizeRecommendationCard (shown on the review page after confirmation)
  components/results/ SizeHero, MeasurementList, results.css (Results + Profile pages)
  components/scanQuality/  ScanQualityCard (review page)
  components/scan/mannequin/  Three.js reference mannequin: procedural geometry, shader
                      scene (renders on demand only), React wrapper (statically imported)
  layouts/            RootLayout (skip link + <main> + <Outlet />), FlowStepLayout (fit-flow steps)
  pages/              route pages (HomePage, UserInfoPage, ClothingSelectionPage, BodyScanPage,
                      MeasurementReviewPage, ResultsPage, ProfilePage, NotFoundPage)
  routes/router.tsx   route definitions (createBrowserRouter)
  routes/paths.ts     central path constants (PATHS) + WELCOME_NEXT_PATH
  store/              Zustand store (useAppStore) composed from slices/
                      (user, fit, settings); display units/theme/voice preference and the saved fit
                      profile + history are persisted (device only);
                      user slice holds scanMeasurements (engine output) and measurements (confirmed);
                      validationStore = separate in-memory store for validation records (never persisted)
  hooks/              reusable hooks (useDocumentTitle, useUserInfoForm, useClothingSelectionForm,
                      useCamera, useFrameQuality, useScan360Session, usePoseScan, useVoiceGuidance,
                      useMediaQuery, useScrollLock, useWakeLock, useAnnyShadow)
  services/           side-effect/IO modules (safe localStorage wrapper, camera,
                      frame analysis, pose/poseLandmarker = MediaPipe engine + mask reader, speech,
                      download = save a developer export locally)
  utils/              pure helpers: constants, motion presets, unit conversion,
                      user-info validation, clothing catalog + validation,
                      scan guidance, scanPreview, pose/ (landmarks, orientation,
                      validation + capture hold, config, scanRegions = clothing → body region)
  utils/scan360/      guided 360° scan: views (angles/windows), bodyYaw, capture (frame decision + view hold),
                      session (coverage reducer), trackingQuality
  utils/silhouette/   body outline from the segmentation mask: extract (per frame), combine (median profile),
                      levels (chest/waist/hip/thigh rows, side depth, angled width), outlineQuality, config;
                      testBody = synthetic mask incl. angled views (tests only)
  utils/anny/         Anny shadow model (Step 9E-2): format, model, slice, fit, measure, scanInput, shadow,
                      workerProtocol; testModel (tests only)
  utils/validation/   real-person validation (Steps 9E-3A/B): definitions (+ protocol), groundTruth, compare, metrics
                      (+ Anny reliability), repeatability, fromScan (+ usability), browser, export (+ privacy guard);
                      syntheticFixture (tests only)
  utils/sizing/       size recommendation (Step 10): sizeCharts (generic charts + rules), recommendSize (engine),
                      fromConfirmed (confirmed measurements → engine); brandCharts + recommendBrandSize (Step 15)
  utils/profile/      fit profile (Step 11): fitProfile (build, history, storage guards), format (dates, scan path)
  utils/scanQuality/  scan quality score (Step 14): calculateScanQuality, levels, weights
  workers/            annyFit.worker.ts (Anny shadow fit off the main thread)
  utils/measurement/  measurement engine: geometry, aggregate (multi-angle + confidence), calibration,
                      definitions (per-region measurements), measureScan, fromScan (scan → engine),
                      review (edit/confirm rules), silhouetteMeasure (outline girths + inseam);
                      tests + testFixtures (tests only)
  types/domain.ts     domain types (lengths in cm, weight in kg)
  types/scan.ts       scan/camera types (ScanViewId = 8 views; ScanCapture = landmarks + angle + outline numbers)
  types/pose.ts       pose landmark types
  types/measurement.ts  measurement / calibration / report types
  types/silhouette.ts   body-outline profile types (numbers only, never the mask)
  types/validation.ts   validation subject / tape measurement / scan attempt types (numbers and labels only)
  types/sizing.ts       size chart / size recommendation types
  types/profile.ts      saved fit profile / scan history types
  types/scanQuality.ts  scan quality result types
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
- Three.js (only for the 3D reference mannequin on the Body Scan page; bundled statically — a lazy chunk could be
  missing after a redeploy and crash the scan page)
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
