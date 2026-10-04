# Anny compact export (SizerAI Step 9E-2)

Offline tool that turns the [Anny](https://github.com/naver/anny) body model (PyTorch) into the
small binary the browser-side fitter reads: `public/models/anny/anny-compact-v1.bin` (~2 MB,
~1.8 MB gzipped). Nothing in this folder runs in the app, and no raw Anny/PyTorch asset is
copied into `src/`.

- **Pinned input:** Anny revision `d6fc027ced5c17b6b0775dee944096ade7a9ef80` (see `requirements.txt`).
- **What is exported:** mean + 20 principal components (float16) of 2,000 rest-pose Anny bodies
  sampled over adult phenotypes and 14 torso/hip/leg local changes, with 12 joint positions
  appended; triangle list; arm and left/right leg vertex masks (from skinning weights); Anny's
  waist vertex loop; a crotch vertex. Header JSON inside the file records the provenance.
- **Licences:** Anny code Apache-2.0 (NAVER); MakeHuman/MPFB2 assets CC0-1.0. The non-commercial
  SMPL-X topology is not used. Ship `public/models/anny/NOTICE.txt` with the app.
- **Determinism:** fixed seed; re-running with the same pinned versions gives the same basis
  (up to floating-point differences across platforms).

```bash
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
python export_anny_compact.py            # writes ../../public/models/anny/anny-compact-v1.bin
```

The first run takes a few minutes while Anny builds its blend-shape cache (`ANNY_CACHE_DIR`).
