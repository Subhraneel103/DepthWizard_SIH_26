"""
Run GCP-based calibration on a saved relative-depth array.

Takes the .npy output of scripts/run_depth_cli.py plus a small JSON file of
ground control points (pixel position + known real-world elevation), fits
the scale+shift transform, and saves the resulting absolute-elevation DSM.

This is the calibration path that does NOT need rasterio, SRTM, or network
access — which is also why, unlike run_depth_cli.py, I was able to fully
test this end-to-end myself (see tests/test_calibration.py; this script is
just a thin CLI around functions that are already verified).

Usage:
    python3 scripts/calibrate_gcp_cli.py depth_raw.npy gcps.json

Where gcps.json looks like:
    [
      {"row": 120, "col": 340, "elevation_m": 215.5},
      {"row": 800, "col": 900, "elevation_m": 198.2},
      {"row": 50,  "col": 700, "elevation_m": 240.0}
    ]

Getting elevations for GCPs: use Google Earth (right-click a point ->
'Show elevation'), a topo map, or a GPS device with altitude. You need at
least 2 points; 4-6 spread across the image's elevation range gives a much
more trustworthy fit than 2 clustered together — see CalibrationFit's
docstring on why r_squared can look great with too few points anyway.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from backend.opencv.model.calibration import apply_calibration, fit_scale_shift, sample_at_points


def main():
    parser = argparse.ArgumentParser(description="Calibrate a relative depth map using ground control points.")
    parser.add_argument("depth_npy", type=str, help="Path to a relative-depth .npy file (from run_depth_cli.py)")
    parser.add_argument("gcps_json", type=str, help="Path to a JSON file of ground control points")
    parser.add_argument("--out", type=str, default=None, help="Output path for the absolute DSM .npy (default: <depth_npy>_absolute.npy)")
    args = parser.parse_args()

    depth_path = Path(args.depth_npy)
    relative_depth = np.load(depth_path)
    print(f"Loaded relative depth map: {relative_depth.shape}")

    gcps = json.loads(Path(args.gcps_json).read_text())
    if len(gcps) < 2:
        print(f"ERROR: need at least 2 GCPs, got {len(gcps)}", file=sys.stderr)
        sys.exit(1)

    points_rc = [(gcp["row"], gcp["col"]) for gcp in gcps]
    true_elevations = np.array([gcp["elevation_m"] for gcp in gcps], dtype=np.float64)

    try:
        relative_values = sample_at_points(relative_depth, points_rc)
    except IndexError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        print("Check that row/col in your GCP file match the depth map's actual dimensions "
              f"({relative_depth.shape[0]} rows x {relative_depth.shape[1]} cols).", file=sys.stderr)
        sys.exit(1)

    fit = fit_scale_shift(relative_values, true_elevations)
    print(f"\nCalibration fit: {fit.describe()}")
    if fit.r_squared < 0.8:
        print("WARNING: R² is low — your GCPs may be inconsistent with each other, or with the "
              "depth map (wrong row/col?). Double-check before trusting the resulting DSM.")

    absolute_dsm = apply_calibration(relative_depth, fit)

    out_path = Path(args.out) if args.out else depth_path.with_name(depth_path.stem + "_absolute.npy")
    np.save(out_path, absolute_dsm)
    print(f"\nSaved absolute DSM: {out_path}")
    print(f"Elevation range: [{absolute_dsm.min():.1f}m, {absolute_dsm.max():.1f}m]")


if __name__ == "__main__":
    main()