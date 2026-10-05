# SizerAI

**Perfect Fit. Powered by AI.** SizerAI is a web app that estimates body measurements from a guided, on-device
camera scan and turns them into a clothing size recommendation.

It runs entirely in the browser: pose detection and body-outline segmentation happen on your device, and no camera
frames are uploaded. Measurements are estimates, and the size comes from a transparent comparison with a generic size
chart — an assistive recommendation, not a tailor's measurement.

## Key features

- **Guided fit flow**: your details → clothing selection (T-shirt, shirt, blazer, jeans, trousers) → body scan →
  measurement review → results → fit profile.
- **Guided automatic 360° body scan**: stand in view and turn slowly; the app detects your body angle and captures
  eight views (front, sides, back and the 45° views in between) automatically when you hold still, with on-screen and
  optional voice guidance. It checks lighting, framing, posture and stillness before capturing.
- **Measurement review**: every measurement shows its value, status (valid / uncertain / unavailable), confidence and
  reason. You can correct values you know; edits are marked as yours.
- **Size recommendation**: recommended size (S–XXL), fit (Good Fit / Slightly Tight / Slightly Loose), the
  measurements used, a neighbouring size at a boundary, and a plain-language "Why this size?".
- **Fit profile**: save your result on this device, see your saved measurements and previous results, scan again or
  delete it.
- **Responsive**: designed mobile-first (full-screen scan view on phones and tablets) and for desktop.

## Technology

React 19 · TypeScript · Vite · React Router · Zustand · Framer Motion · custom CSS · Lucide icons ·
Three.js (3D reference figure on the scan page) · MediaPipe Tasks Vision (Pose Landmarker) · Vitest + Testing Library ·
oxlint.

## How the body scan works

1. The camera stream (`getUserMedia`, video only) is analysed frame by frame in the browser.
2. **MediaPipe Pose Landmarker (Full model)** runs on-device — the model and WebAssembly runtime are served with the
   app, not from a CDN — and returns 33 body landmarks plus a person segmentation mask.
3. Each frame is checked: one person, full body in frame, joints visible, upright posture, arms clear of the body,
   good light and stillness. The body angle is estimated continuously from the pose.
4. When the body is held steady inside one of eight angle windows, a view is captured: the median landmarks over the
   hold and the **body outline as numbers** (edge positions per image row). The segmentation mask itself is read only
   inside the detection step and never stored.
5. The scan completes with all eight views, or the four main views plus turning back to the front.

## Measurement pipeline

- **Scale**: pixels are never treated as centimetres. The height you enter scales each view (entered height ÷ the
  outline's head-to-floor height); joint lengths use the pose model's 3D landmarks scaled by the same height.
- **Lengths** (shoulder width, arm length, torso length, leg length) are measured between joints on the 3D landmarks
  and combined across views (weighted median; agreement, visibility and coverage drive confidence).
- **Circumferences** (chest, waist, hip, thigh) are found at body levels on the front/back outline and the matching
  depth on the side outline, then estimated as an **ellipse perimeter** (width × depth). The 45° views check that
  elliptical assumption and adjust confidence. **Inseam** is crotch-to-floor on the outline.
- Each measurement gets a status and confidence. Outline-based measurements (circumferences and inseam) are always
  marked **uncertain**, because they have not yet been validated against tape measurements of real people.
  Missing evidence makes a measurement unavailable — values are never guessed.

## Scan quality score

After a scan, the Measurement Review page shows an informational **Scan Quality** score (0–100; Excellent ≥ 90,
Good ≥ 75, Fair ≥ 60, else Poor) with its factors and tips for the weak ones. It is computed on the device from
signals the scan already records for each captured view — no extra model:

- **Body visibility**: the pose model's visibility of shoulders, hips, knees and ankles; lower when the outline is cut
  off at the head or feet.
- **Pose stability**: how steady the body outline stayed over each capture hold.
- **View coverage**: the four main views and the four angled views.
- **Outline quality**: share of views with a usable outline and its edge sharpness.
- **Scale calibration**: how reliably the views could be scaled with the entered height (it cannot tell whether the
  entered height itself is right).

Weights are 20 / 15 / 25 / 25 / 15 %; factors without data are left out. A scan missing one of the four main views is
capped at Fair. Lighting is checked live before each capture but not recorded, so it is not scored. The score never
changes the measurements or the size, and it is kept only for the current session.

## Size recommendation

`recommendSize({ garment, measurements })` is a small, deterministic, rule-based function (no machine learning):

- Each garment has a chart of **body-measurement ranges** for S, M, L, XL and XXL (`src/utils/sizing/sizeCharts.ts`).
  T-shirts are sized by chest; shirts and blazers by chest, checked against waist; jeans and trousers by waist,
  checked against hip.
- The primary measurement picks the size; if the secondary one needs a larger size, the larger size is chosen so the
  garment fits in both places.
- Fit status comes from where the measurement sits within the size's range; a neighbouring size is suggested at a
  boundary.
- **Fit preference** (Slim / Regular / Relaxed, chosen with the garment; Regular by default) only decides between
  neighbouring sizes, and only where the measurements allow it: Slim takes the smaller size when the deciding
  measurement is less than 1 cm above it (and the other measurement fits it too); Relaxed takes the larger size when
  the measurement is in the top 20% of its size. Regular is the plain chart comparison. The preference never changes
  the measurements, an Insufficient Data result or a "no suitable size" result.
- If a required measurement is missing, invalid or implausible, the result is **Insufficient Data** — no size is
  shown. Uncertain measurements are used but flagged.

The charts are **generic adult reference ranges, not any brand's chart**, kept in one module so real brand charts can
replace them.

### Reference brand sizing

On the Results page, **Brand → "Use reference brand sizing"** offers Generic (default — the chart above, unchanged),
Nike, Levi's and H&M. `recommendBrandSize({ brand, garment, measurements, fitPreference })` applies the same rules and
the same fit-preference logic to that brand's chart (`src/utils/sizing/brandCharts.ts`).

- The brand charts are **small hand-entered reference datasets**, not official brand data and **not live brand APIs**:
  nothing is scraped or fetched. *Reference size chart — actual sizing may vary by product and region.*
- Only garments with a reference chart are covered (Nike: T-shirts and trousers; Levi's: T-shirts, shirts, jeans and
  trousers; H&M: all five). For any other brand + garment the result is **Reference chart unavailable** — no size, and
  the generic chart is never substituted.
- A saved fit profile remembers which chart its size came from (older profiles load as Generic).

## Privacy

- Camera frames, photos, video and segmentation masks are processed in the browser and are **not uploaded or
  saved**. For each captured view only landmark positions and outline edge positions (numbers) are kept, in memory.
- Your details, scan results and unsaved measurements stay in memory for the session.
- When you choose **Save Fit Profile**, the profile (garment, size, fit, measurements and dates — numbers only) and a
  short list of previous results are stored in this browser's local storage on this device, along with display
  preferences. You can delete the profile from the Profile page. There is no backend and no account.
- The app and the pose model are served from wherever the app is hosted; the app itself calls no third-party
  services. A Content-Security-Policy (`connect-src 'self' blob: data:` in `index.html`) restricts network
  connections to the app's own origin — this also blocks the usage-statistics logging built into the MediaPipe
  library, which has no setting to turn it off. Optional voice guidance uses the browser's built-in speech synthesis: depending on the browser and the
  voice it provides, the spoken instruction text (e.g. "Turn slowly to your left") may be synthesised by the browser
  vendor's online voice service. No body data is spoken.

## Testing

```bash
npm test        # Vitest: unit tests for the measurement, outline, scan, sizing and profile logic, plus UI tests (jsdom)
npm run lint    # oxlint
npm run build   # TypeScript check + production build
```

The measurement and sizing logic is pure and covered by unit tests using synthetic, test-only fixtures (a rendered
test body with known dimensions). UI flows (review, confirm, edit, results, save, profile, navigation) have
Testing Library tests. The full journey has also been checked in Chromium at 1440, 768, 390 and 360 px.

## Local setup

Requirements: Node.js 20.19+.

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

The camera needs a secure context: `localhost` works; on a phone, open the app over HTTPS.

**Deployment**: the build is a static single-page app (`dist/`). Any static host works (e.g. Vercel, Netlify); configure
it to serve `index.html` for all routes so deep links such as `/results` load correctly. No environment variables or
secrets are needed.

## Developer tools

- `?poseDebug` on the scan page shows a developer panel (detection values, outline overlay, capture decisions).
- In that mode only, an **experimental "Anny" body-model shadow fit** runs in a Web Worker and is compared with the
  production estimates, alongside a validation panel for recording manual tape measurements against scans. Anny is
  **not** used for the measurements, sizes or anything the user sees outside this developer mode. Its compact model
  (`public/models/anny/`, Apache-2.0 / CC0 attribution in `NOTICE.txt`) is downloaded only in that mode;
  `tools/anny-export/` contains the offline export script.

## Limitations

- Body measurements are **estimates** from a phone or laptop camera — not tailor-level or medical measurements.
  Outline-based circumferences and inseam have not yet been validated against real-person tape measurements.
- Accuracy depends on fitted clothing, good lighting, the full body being visible and an accurately entered height.
  Loose clothing makes the outline larger than the body.
- Size charts are generic or hand-entered brand references; real brand sizing differs by product line, cut and
  region. Treat the result as an assistive recommendation and check the brand's own chart.
- Only adult sizes (S–XXL); children's sizes are not supported, and inseam does not produce a length size. Tailored
  trousers and blazers offer Slim and Regular fit only.
- The fit profile is stored only in this browser on this device.

## Future improvements

- Official, maintained brand size charts (and length sizes such as inseam).
- Larger real-person validation of the measurements against tape measurements.
- Improved body-model fitting for circumferences.
