"""
Tests for mesh_geometry.py. Pure NumPy — no trimesh needed.
Run with: python3 tests/test_mesh_geometry.py
"""

import sys
from pathlib import Path

import numpy as np

_OPENCV_ROOT = str(Path(__file__).resolve().parent.parent.parent)
if _OPENCV_ROOT not in sys.path:
    sys.path.insert(0, _OPENCV_ROOT)

from model.mesh_geometry import (
    build_heightfield_geometry,
    compute_face_normals,
    downsample_elevation_for_mesh,
)


def test_vertex_and_face_counts():
    """A HxW grid must produce exactly H*W vertices and 2*(H-1)*(W-1)
    triangles (two per quad) — get this wrong and the mesh either has
    holes or crashes a viewer with out-of-range indices."""
    h, w = 10, 15
    elevation = np.zeros((h, w), dtype=np.float32)
    geo = build_heightfield_geometry(elevation)

    assert geo.vertices.shape == (h * w, 3)
    assert geo.faces.shape == (2 * (h - 1) * (w - 1), 3)
    assert geo.uvs.shape == (h * w, 2)
    print(f"  build_heightfield_geometry: {h}x{w} grid -> {len(geo.vertices)} vertices, {len(geo.faces)} faces")


def test_face_indices_are_in_bounds():
    """Every index in `faces` must point at a real vertex — an off-by-one
    here is the single most common heightfield-meshing bug and it doesn't
    throw an error, it just corrupts the mesh silently in whatever loads it."""
    h, w = 8, 12
    elevation = np.random.default_rng(0).uniform(0, 10, size=(h, w)).astype(np.float32)
    geo = build_heightfield_geometry(elevation)

    assert geo.faces.min() >= 0
    assert geo.faces.max() < len(geo.vertices), (
        f"face index {geo.faces.max()} out of range for {len(geo.vertices)} vertices"
    )
    print("  build_heightfield_geometry: all face indices in bounds")


def test_face_normals_point_upward():
    """THE critical correctness check: for a flat grid, every face normal
    must point toward +Y (up). This is the actual computed proof that the
    triangle winding order in _build_grid_faces is right, not a comment
    claiming it is. If this test failed, every mesh we ever export would
    render as a black, inside-out surface with backface culling on (which
    is the default in Three.js and most viewers) — an easy bug to ship and
    a confusing one to debug from the outside, since the mesh would still
    LOAD fine, just render as invisible or inverted."""
    elevation = np.zeros((5, 5), dtype=np.float32)
    geo = build_heightfield_geometry(elevation)
    normals = compute_face_normals(geo.vertices, geo.faces)

    assert np.allclose(normals[:, 1], 1.0, atol=1e-5), (
        f"expected all normals to point straight up (Y=1) on a flat grid, "
        f"got Y components ranging [{normals[:, 1].min()}, {normals[:, 1].max()}]"
    )
    assert np.allclose(normals[:, 0], 0.0, atol=1e-5)
    assert np.allclose(normals[:, 2], 0.0, atol=1e-5)
    print("  compute_face_normals: all faces point straight up on a flat grid — winding order confirmed correct")


def test_face_normals_upward_on_sloped_terrain():
    """A gentle slope's normals should still point mostly upward (positive
    Y component dominant), just tilted — not flipped or sideways."""
    h, w = 6, 6
    rows, cols = np.mgrid[0:h, 0:w]
    elevation = (cols * 0.5).astype(np.float32)  # gentle linear slope, not too steep
    geo = build_heightfield_geometry(elevation)
    normals = compute_face_normals(geo.vertices, geo.faces)

    assert (normals[:, 1] > 0.5).all(), (
        f"expected normals still predominantly upward on a gentle slope, min Y = {normals[:,1].min()}"
    )
    print("  compute_face_normals: gentle slope still produces upward-tilted normals, as expected")


def test_uv_coordinates_in_valid_range_and_correct_corners():
    """UVs must stay within [0,1], and per the glTF spec (upper-left
    origin, verified via web search, not assumed), pixel (row=0, col=0)
    must map to uv=(0,0) — the top-left of both the image array AND the
    texture space, with no flip."""
    h, w = 4, 6
    elevation = np.zeros((h, w), dtype=np.float32)
    geo = build_heightfield_geometry(elevation)

    assert geo.uvs.min() >= 0.0 and geo.uvs.max() <= 1.0

    top_left_uv = geo.uvs[0]  # vertex index 0 = (row=0, col=0)
    bottom_right_uv = geo.uvs[-1]  # last vertex = (row=h-1, col=w-1)
    assert np.allclose(top_left_uv, [0.0, 0.0]), f"expected (0,0) at top-left, got {top_left_uv}"
    assert np.allclose(bottom_right_uv, [1.0, 1.0]), f"expected (1,1) at bottom-right, got {bottom_right_uv}"
    print(f"  build_heightfield_geometry: UV(0,0) at top-left, UV(1,1) at bottom-right — matches glTF spec, no flip")


def test_z_exaggeration_scales_only_elevation():
    """z_exaggeration must scale the Y (elevation) component only — X/Z
    ground-plane spacing must stay exactly the same, or the mesh's
    horizontal proportions would distort along with the height."""
    elevation = np.array([[0.0, 2.0], [4.0, 6.0]], dtype=np.float32)
    geo_1x = build_heightfield_geometry(elevation, z_exaggeration=1.0)
    geo_3x = build_heightfield_geometry(elevation, z_exaggeration=3.0)

    assert np.allclose(geo_3x.vertices[:, 1], geo_1x.vertices[:, 1] * 3.0)
    assert np.allclose(geo_3x.vertices[:, 0], geo_1x.vertices[:, 0])  # X unchanged
    assert np.allclose(geo_3x.vertices[:, 2], geo_1x.vertices[:, 2])  # Z unchanged
    print("  build_heightfield_geometry: z_exaggeration scales elevation only, not ground-plane spacing")


def test_pixel_size_scales_ground_plane_correctly():
    """A pixel_size of 2.0 should make adjacent grid points 2.0 units
    apart in world space, not 1.0 — this is what turns 'pixel spacing'
    into 'meters of real-world spacing' when derived from a geotransform."""
    elevation = np.zeros((3, 3), dtype=np.float32)
    geo = build_heightfield_geometry(elevation, pixel_size_x=2.0, pixel_size_z=5.0)

    # vertex 0 = (row0,col0) = (x=0, z=0); vertex 1 = (row0,col1) = (x=2, z=0)
    assert np.isclose(geo.vertices[1, 0] - geo.vertices[0, 0], 2.0)
    # vertex at (row1,col0) = index 3 (since w=3) = (x=0, z=5)
    assert np.isclose(geo.vertices[3, 2] - geo.vertices[0, 2], 5.0)
    print("  build_heightfield_geometry: pixel_size_x/z correctly scale ground-plane spacing")


def test_rejects_too_small_grid():
    try:
        build_heightfield_geometry(np.zeros((1, 5), dtype=np.float32))
        assert False, "should reject a grid with fewer than 2 rows"
    except ValueError:
        print("  build_heightfield_geometry: correctly rejects a too-small grid")


def test_downsample_elevation_reuses_resize_max_side_correctly():
    """Confirms downsample_elevation_for_mesh actually shrinks an oversized
    grid, is a no-op on an already-small one, and preserves float32 dtype
    (a resize that silently upcasts/downcasts dtype would corrupt elevation
    values, not just resolution)."""
    large = np.random.default_rng(1).uniform(0, 100, size=(2000, 1500)).astype(np.float32)
    small = downsample_elevation_for_mesh(large, max_grid_size=200)
    assert max(small.shape) == 200
    assert small.dtype == np.float32

    already_small = np.zeros((50, 60), dtype=np.float32)
    unchanged = downsample_elevation_for_mesh(already_small, max_grid_size=200)
    assert unchanged.shape == already_small.shape
    print(f"  downsample_elevation_for_mesh: 2000x1500 -> {small.shape}, already-small grid left unchanged")


def run_all():
    tests = [
        test_vertex_and_face_counts,
        test_face_indices_are_in_bounds,
        test_face_normals_point_upward,
        test_face_normals_upward_on_sloped_terrain,
        test_uv_coordinates_in_valid_range_and_correct_corners,
        test_z_exaggeration_scales_only_elevation,
        test_pixel_size_scales_ground_plane_correctly,
        test_rejects_too_small_grid,
        test_downsample_elevation_reuses_resize_max_side_correctly,
    ]
    print(f"Running {len(tests)} tests...\n")
    for fn in tests:
        fn()
    print("\nAll tests passed.")


if __name__ == "__main__":
    run_all()