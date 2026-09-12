"""
Stage 4a: Heightfield mesh geometry — pure NumPy, no trimesh dependency.

Turns a 2D elevation grid into the raw ingredients of a 3D mesh: vertex
positions, triangle faces, and UV texture coordinates. Exporting that to an
actual glTF/OBJ file (mesh_export.py) needs trimesh; building the geometry
itself doesn't need anything except NumPy, so it's fully tested here.

COORDINATE CONVENTION (verified against the glTF 2.0 spec, not guessed):
  - glTF is right-handed, +Y up, and a vertex's UV origin (0,0) is the
    UPPER-LEFT corner of the texture image — same as row=0,col=0 in our
    image arrays. So: vertex.x = col, vertex.y = elevation, vertex.z = row,
    and uv = (col/(W-1), row/(H-1)) — no vertical flip needed anywhere.
    (Getting this backwards would mirror or upside-down every texture; see
    the earlier Depth Anything sign-convention bug for what that class of
    mistake looks like.)
  - Triangle winding: verified computationally (see
    tests/test_mesh_geometry.py::test_face_normals_point_upward), not
    assumed — (v00, v10, v01) and (v01, v10, v11) both give a face normal
    of (0, 1, 0) on a flat grid via the standard normal = (v1-v0)x(v2-v0)
    formula, which is what a terrain mesh viewed from above needs.
"""

from dataclasses import dataclass

import numpy as np

from .preprocess import resize_max_side


@dataclass
class HeightfieldGeometry:
    vertices: np.ndarray  # (N, 3) float32 — (x, elevation, z)
    faces: np.ndarray      # (M, 3) int64 — vertex indices, CCW winding for +Y-facing normals
    uvs: np.ndarray         # (N, 2) float32 — (u, v) in [0, 1], glTF upper-left origin


def downsample_elevation_for_mesh(elevation: np.ndarray, max_grid_size: int) -> np.ndarray:
    """Cap the elevation grid's longer side at max_grid_size before meshing.

    A full-resolution image (e.g. 2000x3000) would produce 6 million
    vertices and 12 million triangles — unusable in a browser. SRTM itself
    is only ~30m resolution, so the elevation signal rarely has real detail
    finer than a few hundred grid cells anyway; downsampling loses little
    real information while making the mesh renderable.

    Reuses preprocess.resize_max_side rather than reimplementing resizing —
    it already handles the "no-op if already smaller" and aspect-ratio
    cases correctly (and is already tested), and cv2.resize works the same
    way on a 2D float32 array as it does on a 3-channel image.
    """
    return resize_max_side(elevation, max_side=max_grid_size)


def build_heightfield_geometry(
    elevation: np.ndarray,
    pixel_size_x: float = 1.0,
    pixel_size_z: float = 1.0,
    z_exaggeration: float = 1.0,
) -> HeightfieldGeometry:
    """Build vertices/faces/UVs for a grid heightfield mesh from a 2D elevation array.

    pixel_size_x / pixel_size_z: real-world spacing between adjacent grid
    points, in meters. For a georeferenced source (Stage 3's SRTM path),
    derive these from the raster's geotransform. For GCP calibration with
    no real geotransform, 1.0 gives an arbitrary-but-consistent local scale
    — fine for visualization, not meaningful for absolute measurement.

    z_exaggeration: multiply elevation before building vertices — real
    terrain relief is often visually flat at true 1:1 scale on a screen;
    exaggerating (e.g. 2.0-3.0x) is a common, honest visualization choice
    as long as it's disclosed, not a data manipulation.
    """
    h, w = elevation.shape[:2]
    if h < 2 or w < 2:
        raise ValueError(f"Elevation grid must be at least 2x2 to form any triangles, got {h}x{w}")

    rows, cols = np.mgrid[0:h, 0:w]
    x = (cols * pixel_size_x).astype(np.float32)
    z = (rows * pixel_size_z).astype(np.float32)
    y = (elevation.astype(np.float32) * z_exaggeration)

    vertices = np.stack([x.ravel(), y.ravel(), z.ravel()], axis=1)

    u = cols.astype(np.float32) / max(w - 1, 1)
    v = rows.astype(np.float32) / max(h - 1, 1)  # no flip — see module docstring
    uvs = np.stack([u.ravel(), v.ravel()], axis=1)

    faces = _build_grid_faces(h, w)

    return HeightfieldGeometry(vertices=vertices, faces=faces, uvs=uvs)


def _build_grid_faces(h: int, w: int) -> np.ndarray:
    """Two triangles per grid quad, winding order verified in the module docstring."""
    row_idx, col_idx = np.mgrid[0 : h - 1, 0 : w - 1]
    v00 = (row_idx * w + col_idx).ravel()
    v01 = (row_idx * w + col_idx + 1).ravel()
    v10 = ((row_idx + 1) * w + col_idx).ravel()
    v11 = ((row_idx + 1) * w + col_idx + 1).ravel()

    tri_a = np.stack([v00, v10, v01], axis=1)
    tri_b = np.stack([v01, v10, v11], axis=1)
    return np.concatenate([tri_a, tri_b], axis=0).astype(np.int64)


def compute_face_normals(vertices: np.ndarray, faces: np.ndarray) -> np.ndarray:
    """Per-face normals via cross product — standard normal = (v1-v0) x (v2-v0).

    Exists mainly so the winding order can be checked by a test rather than
    trusted on faith: a terrain mesh viewed from above needs its normals
    pointing toward +Y (up), and this is the actual, computed proof that
    the winding order in _build_grid_faces achieves that, not just a claim
    in a comment.
    """
    v0 = vertices[faces[:, 0]]
    v1 = vertices[faces[:, 1]]
    v2 = vertices[faces[:, 2]]
    normals = np.cross(v1 - v0, v2 - v0)
    norms = np.linalg.norm(normals, axis=1, keepdims=True)
    norms[norms == 0] = 1.0  # degenerate (zero-area) triangles, avoid division by zero
    return normals / norms