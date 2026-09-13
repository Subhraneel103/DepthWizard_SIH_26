"""
End-to-end verification script for DepthWizard Python Pipeline.
Supports JPG, JPEG, PNG, TIF, and TIFF.

Usage:
    uv run python test_pipeline.py [image_path]

If no image_path is provided, defaults to testing all three:
    photo.png, photo.jpg, photo.tif
"""

import sys
import time
import zipfile
from pathlib import Path

import numpy as np

# Ensure root is in sys.path
_ROOT = Path(__file__).resolve().parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from model.depth_infer import get_model, normalize_for_display, run_depth_pipeline
from model.preprocess import load_image_rgb, resize_max_side
from model.calibration import CalibrationFit, apply_calibration, fit_scale_shift, sample_at_points
from model.mesh_geometry import build_heightfield_geometry, downsample_elevation_for_mesh
from model.mesh_export import build_mesh_zip


def run_pipeline_on_image(image_path: str, model=None, model_size: str = "small", max_side: int = 1024):
    path = Path(image_path)
    if not path.exists():
        print(f"[-] File not found: {path}")
        return False

    print("=" * 70)
    print(f"[*] Testing Pipeline with: {path.name} ({path.stat().st_size / 1024 / 1024:.2f} MB)")
    print("=" * 70)

    # 1. Load Image
    print("[1/4] Loading and preprocessing image...")
    t0 = time.monotonic()
    img_rgb = load_image_rgb(str(path))
    orig_h, orig_w = img_rgb.shape[:2]
    img_rgb = resize_max_side(img_rgb, max_side=max_side)
    h, w = img_rgb.shape[:2]
    print(f"      -> Loaded {orig_w}x{orig_h}, resized to {w}x{h} in {time.monotonic() - t0:.2f}s")

    # 2. Run Depth Inference
    if model is None:
        print(f"[2/4] Loading Depth Anything V2 ({model_size})...")
        t0 = time.monotonic()
        model = get_model(model_size)
        print(f"      -> Model loaded in {time.monotonic() - t0:.2f}s")
    else:
        print(f"[2/4] Running Depth Anything V2 inference...")

    t0 = time.monotonic()
    depth_raw = run_depth_pipeline(img_rgb, model, tile_size=512, overlap=64)
    inf_time = time.monotonic() - t0
    print(f"      -> Inference finished in {inf_time:.2f}s")
    print(f"      -> Relative elevation range: [{depth_raw.min():.3f}, {depth_raw.max():.3f}]")

    # Save depth raw and visual preview
    raw_path = path.with_name(f"{path.stem}_depth_raw.npy")
    np.save(raw_path, depth_raw)
    view_path = path.with_name(f"{path.stem}_depth_view.png")
    import cv2
    cv2.imwrite(str(view_path), normalize_for_display(depth_raw))
    print(f"      -> Saved raw depth array: {raw_path.name}")
    print(f"      -> Saved depth preview PNG: {view_path.name}")

    # 3. Calibration (synthetic GCPs for end-to-end check)
    print("[3/4] Running scale & shift calibration...")
    # Sample 4 points across the image
    points = [
        (int(h * 0.2), int(w * 0.2)),
        (int(h * 0.2), int(w * 0.8)),
        (int(h * 0.8), int(w * 0.2)),
        (int(h * 0.8), int(w * 0.8)),
    ]
    sampled_rel = sample_at_points(depth_raw, points)
    # Target elevation range: 100m to 250m
    target_elevations = np.array([120.0, 180.0, 140.0, 220.0], dtype=np.float64)
    fit = fit_scale_shift(sampled_rel, target_elevations)
    print(f"      -> Fit: {fit.describe()}")
    absolute_dsm = apply_calibration(depth_raw, fit)
    abs_path = path.with_name(f"{path.stem}_absolute_dsm.npy")
    np.save(abs_path, absolute_dsm)
    print(f"      -> Saved absolute DSM: {abs_path.name} (range: [{absolute_dsm.min():.1f}m, {absolute_dsm.max():.1f}m])")

    # 4. 3D Mesh & GeoTIFF Export
    print("[4/4] Building 3D mesh (GLB + OBJ) & GeoTIFF bundle...")
    t0 = time.monotonic()
    mesh_elev = downsample_elevation_for_mesh(absolute_dsm, max_grid_size=300)
    geo = build_heightfield_geometry(mesh_elev, pixel_size_x=1.0, pixel_size_z=1.0, z_exaggeration=1.5)
    zip_bytes = build_mesh_zip(
        geo,
        img_rgb,
        elevation_for_geotiff=absolute_dsm,
        include_obj=True,
    )
    zip_path = path.with_name(f"{path.stem}_mesh_bundle.zip")
    zip_path.write_bytes(zip_bytes)
    with zipfile.ZipFile(zip_path) as z:
        contents = z.namelist()
    print(f"      -> Generated {zip_path.name} ({len(zip_bytes) / 1024 / 1024:.2f} MB) in {time.monotonic() - t0:.2f}s")
    print(f"      -> Zip archive contents: {contents}")
    print(f"      -> Mesh vertices: {len(geo.vertices):,}, triangles: {len(geo.faces):,}")
    print("\n[+] Success! All stages completed for:", path.name)
    return True


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else ["photo.png", "photo.jpg", "photo.tif"]
    
    print("\nDepthWizard Pipeline Full Verification")
    print("Testing image targets:", targets)
    
    # Load model once to share across all tests
    print("\nLoading model weights into memory...")
    model = get_model("small")
    
    passed = 0
    for target in targets:
        if run_pipeline_on_image(target, model=model):
            passed += 1
            
    print("\n" + "=" * 70)
    print(f"Pipeline verification complete: {passed}/{len(targets)} targets passed.")
    print("=" * 70)


if __name__ == "__main__":
    main()

