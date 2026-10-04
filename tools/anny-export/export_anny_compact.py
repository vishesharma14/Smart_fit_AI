"""Exports a compact, browser-ready shape basis of the Anny body model (SizerAI Step 9E-2).

Anny (NAVER LABS Europe) is a PyTorch model; it cannot run in the browser. This script runs it
offline and writes only what the TypeScript fitter needs:

  * a linear shape basis (mean + K principal components, float16) of rest-pose Anny bodies sampled
    over adult phenotypes and a few torso/leg local changes, with 12 joint positions appended to
    every sample so joints follow the same coefficients,
  * the triangle list, arm / left-leg / right-leg vertex masks (from skinning weights),
  * the waist vertex loop (Anny's own anthropometry definition) and a crotch vertex.

Output: public/models/anny/anny-compact-v1.bin (see the header JSON inside for provenance).
Licences: Anny code Apache-2.0; MakeHuman (MPFB2) assets CC0-1.0. The non-commercial SMPL-X
topology is NOT used.

Run (Python >= 3.10):
    pip install -r requirements.txt
    python export_anny_compact.py [--out ../../public/models/anny/anny-compact-v1.bin]
"""
import argparse, json, struct, subprocess, sys
from pathlib import Path

import numpy as np
import torch
import anny
from anny.anthropometry import Anthropometry

ANNY_COMMIT = "d6fc027ced5c17b6b0775dee944096ade7a9ef80"
SEED = 20261004
N_SAMPLES = 2000
K = 20
JOINTS = {  # SizerAI name -> Anny bone whose head is that joint
    "shoulderL": "upperarm01.L", "shoulderR": "upperarm01.R",
    "elbowL": "lowerarm01.L", "elbowR": "lowerarm01.R",
    "wristL": "wrist.L", "wristR": "wrist.R",
    "hipL": "upperleg01.L", "hipR": "upperleg01.R",
    "kneeL": "lowerleg01.L", "kneeR": "lowerleg01.R",
    "ankleL": "foot.L", "ankleR": "foot.R",
}
LOCAL_CHANGES = [  # torso / hip / leg changes that matter for clothing sizes
    "breast-volume-vert-up", "buttocks-volume-incr", "hip-scale-horiz-incr", "hip-scale-depth-incr",
    "measure-thigh-circ-incr", "stomach-pregnant-incr", "stomach-tone-incr", "measure-underbust-circ-incr",
    "torso-scale-horiz-incr", "torso-scale-depth-incr", "measure-waisttohip-dist-incr",
    "measure-shoulder-dist-incr", "measure-hips-circ-incr", "torso-vshape-incr",
]
ARM_BONE_WORDS = ("upperarm", "lowerarm", "wrist", "finger", "metacarpal", "clavicle", "shoulder")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "public/models/anny/anny-compact-v1.bin"))
    args = ap.parse_args()
    torch.manual_seed(SEED)
    rng = np.random.default_rng(SEED)

    model = anny.Anny(local_changes="default").to(dtype=torch.float32)
    labels = list(model.bone_labels)
    missing = [c for c in LOCAL_CHANGES if c not in model.local_change_labels]
    if missing:
        sys.exit(f"local changes not found in this Anny version: {missing}")
    joint_ids = [labels.index(b) for b in JOINTS.values()]

    def sample(n: int) -> np.ndarray:
        ph = {k: torch.tensor(rng.uniform(0.15, 0.85, n), dtype=torch.float32) for k in model.phenotype_labels}
        ph["age"] = torch.tensor(rng.uniform(0.45, 0.9, n), dtype=torch.float32)  # adults
        lc = {k: torch.tensor(rng.uniform(-0.6, 0.6, n), dtype=torch.float32) for k in LOCAL_CHANGES}
        pose = torch.eye(4)[None, None].repeat(n, model.bone_count, 1, 1)
        with torch.no_grad():
            out = model(pose_parameters=pose, phenotype_kwargs=ph, local_changes_kwargs=lc)
        verts = out["rest_vertices"].numpy()
        joints = out["rest_bone_heads"].numpy()[:, joint_ids]
        return np.concatenate([verts, joints], axis=1).reshape(n, -1)

    X = np.concatenate([sample(100) for _ in range(N_SAMPLES // 100)])
    mean = X.mean(0)
    _, S, Vt = np.linalg.svd(X - mean, full_matrices=False)
    sd = S[:K] / np.sqrt(len(X) - 1)
    energy = float(np.sum(S[:K] ** 2) / np.sum(S ** 2))
    basis = Vt[:K]

    V = model.template_vertices.shape[0]
    faces = model.faces.numpy().astype(np.uint16)
    W = model.vertex_bone_weights.numpy()
    I = model.vertex_bone_indices.numpy()
    def mask_for(pred) -> np.ndarray:
        bones = [i for i, l in enumerate(labels) if pred(l.lower())]
        return ((W * np.isin(I, bones)).sum(1) > 0.5).astype(np.uint8)
    arm = mask_for(lambda l: any(w in l for w in ARM_BONE_WORDS))
    leg_l = mask_for(lambda l: l.endswith(".l") and any(w in l for w in ("upperleg", "lowerleg", "foot", "toe")))
    leg_r = mask_for(lambda l: l.endswith(".r") and any(w in l for w in ("upperleg", "lowerleg", "foot", "toe")))
    waist = np.array(Anthropometry(model).waist_vertex_indices, dtype=np.uint16)

    # Crotch: lowest vertex near the mid-sagittal plane between knee and hip-joint height (mean body).
    mv = mean[: V * 3].reshape(V, 3)
    mj = mean[V * 3:].reshape(len(JOINTS), 3)
    knee_z = mj[list(JOINTS).index("kneeL"), 2]
    hip_z = mj[list(JOINTS).index("hipL"), 2]
    cand = np.where((np.abs(mv[:, 0]) < 0.01) & (mv[:, 2] > knee_z) & (mv[:, 2] < hip_z) & (arm == 0))[0]
    crotch = int(cand[np.argmin(mv[cand, 2])])

    arrays = [
        ("mean", mean.astype(np.float32)),
        ("basis", basis.astype(np.float16)),
        ("sd", sd.astype(np.float32)),
        ("faces", faces.reshape(-1)),
        ("armMask", arm), ("leftLegMask", leg_l), ("rightLegMask", leg_r),
        ("waistLoop", waist),
    ]
    header = {
        "format": "sizerai-anny-compact", "version": 1,
        "vertexCount": int(V), "faceCount": int(faces.shape[0]), "components": K,
        "joints": list(JOINTS), "crotchVertex": crotch,
        "units": "metres", "axes": "x lateral, y depth (front = -y), z up", "pose": "Anny rest pose",
        "explainedVariance": round(energy, 6),
        "provenance": {
            "anny": f"https://github.com/naver/anny@{ANNY_COMMIT}", "torch": torch.__version__,
            "seed": SEED, "samples": N_SAMPLES, "localChanges": LOCAL_CHANGES,
            "phenotypeRange": "uniform 0.15-0.85 (age 0.45-0.9)", "localChangeRange": "uniform -0.6..0.6",
        },
        "licence": "Anny code Apache-2.0 (NAVER Corp.); MakeHuman/MPFB2 assets CC0-1.0. See NOTICE.txt.",
        "arrays": [],
    }
    offset = 0
    for name, arr in arrays:
        offset = (offset + 7) // 8 * 8
        header["arrays"].append({"name": name, "dtype": str(arr.dtype), "offset": offset, "length": int(arr.size)})
        offset += arr.nbytes
    hjson = json.dumps(header).encode("utf-8")
    hjson += b" " * ((8 - (8 + len(hjson)) % 8) % 8)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("wb") as f:
        f.write(b"ANNY" + struct.pack("<I", len(hjson)) + hjson)
        base = f.tell()
        for (name, arr), meta in zip(arrays, header["arrays"]):
            f.write(b"\0" * (base + meta["offset"] - f.tell()))
            f.write(arr.tobytes())
    print(f"wrote {out} ({out.stat().st_size / 1e6:.2f} MB), K={K}, explained variance {energy:.5f}, crotch vertex {crotch}")


if __name__ == "__main__":
    main()
