"""
Pure request-handling logic for the ML service — deliberately has ZERO
FastAPI/Starlette imports.

Why: FastAPI isn't installed in my sandbox (no internet to pip install it),
so anything that imports it can't be executed here at all, only read. By
keeping all the actual logic in this file as plain functions on bytes/arrays,
main.py becomes a thin adapter (decode HTTP request -> call here -> encode
HTTP response), and everything ABOVE that thin adapter layer — image
decoding, size limits, error cases, byte encoding — is fully unit-tested
in tests/test_service.py without needing FastAPI on the path at all.
"""

import io
import time
import zipfile
from dataclasses import dataclass

import cv2
import numpy as np

from model.depth_infer import DepthModel, normalize_for_display, run_depth_pipeline
from model.mesh_export import build_mesh_zip
from model.mesh_geometry import build_heightfield_geometry, downsample_elevation_for_mesh
from model.preprocess import decode_image_bytes, resize_max_side, tile_image

MAX_UPLOAD_BYTES = 100 * 1024 * 1024  # 100MB — accommodates raw satellite rasters/GeoTIFFs as well as standard photos
TILE_SIZE = 512
TILE_OVERLAP = 64
MAX_SIDE = 2048


class InvalidImageError(ValueError):
    """Raised when the uploaded bytes can't be decoded as an image."""


class UploadTooLargeError(ValueError):
    """Raised when the upload exceeds the configured size limit."""


@dataclass
class DepthResult:
    depth: np.ndarray  # float32 (H, W) relative elevation — see depth_infer.to_relative_elevation
    width: int
    height: int
    tile_count: int
    processing_ms: int


def process_image_bytes(
    raw_bytes: bytes,
    model: DepthModel,
    max_upload_bytes: int = MAX_UPLOAD_BYTES,
) -> DepthResult:
    """The actual work: raw upload bytes in, a DepthResult out. No HTTP
    concepts anywhere in this function — that's what makes it testable
    without a running server.

    max_upload_bytes is a parameter (not just the module constant) specifically
    so tests can pass a tiny limit and deterministically trigger
    UploadTooLargeError without allocating a real 20MB buffer.
    """
    if len(raw_bytes) > max_upload_bytes:
        raise UploadTooLargeError(f"Upload is {len(raw_bytes)} bytes, max allowed is {max_upload_bytes}")

    start = time.monotonic()

    try:
        img_rgb = decode_image_bytes(raw_bytes)
    except Exception as e:
        raise InvalidImageError(str(e))

    img_rgb = resize_max_side(img_rgb, max_side=MAX_SIDE)

    depth = run_depth_pipeline(img_rgb, model, tile_size=TILE_SIZE, overlap=TILE_OVERLAP)
    # tile_image is cheap pure-NumPy slicing — recomputing it just for the
    # count is negligible next to model inference time, and keeps
    # run_depth_pipeline's return type a plain array rather than a tuple.
    tile_count = len(tile_image(img_rgb, tile_size=TILE_SIZE, overlap=TILE_OVERLAP))

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return DepthResult(
        depth=depth,
        width=img_rgb.shape[1],
        height=img_rgb.shape[0],
        tile_count=tile_count,
        processing_ms=elapsed_ms,
    )


def encode_depth_npy(depth: np.ndarray) -> bytes:
    """Serialize the raw float32 depth array — .npy, not an image format.
    Calibration needs exact float values; PNG/JPEG would clip or quantize
    them, silently corrupting the linear fit downstream."""
    buf = io.BytesIO()
    np.save(buf, depth)
    return buf.getvalue()


def encode_depth_png(depth: np.ndarray) -> bytes:
    """Encode a min-max-normalized PNG purely for human eyeballing (browser
    preview via /docs, a quick sanity check) — never feed this into
    calibration. See depth_infer.normalize_for_display's docstring for why."""
    display = normalize_for_display(depth)
    ok, buf = cv2.imencode(".png", display)
    if not ok:
        raise RuntimeError("PNG encoding failed unexpectedly")
    return buf.tobytes()


MAX_MESH_GRID_SIZE = 300  # cap vertex count at 300*300 = 90k verts, 180k triangles — renders fine in Three.js


@dataclass
class MeshResult:
    zip_bytes: bytes
    vertex_count: int
    face_count: int
    processing_ms: int


def process_mesh_request(
    elevation_bytes: bytes,
    texture_bytes: bytes,
    pixel_size_x: float = 1.0,
    pixel_size_z: float = 1.0,
    z_exaggeration: float = 1.0,
    geo_transform=None,
    geo_crs=None,
    include_obj: bool = False,
) -> MeshResult:
    """The Stage 4 equivalent of process_image_bytes: raw bytes in
    (a calibrated elevation .npy from Stage 3, and a texture image), a
    zip file out (mesh.glb + dsm.tif, optionally + OBJ files).

    elevation_bytes: a .npy file, exactly what Stage 3's calibration
    produces (float32, absolute elevation, NOT the normalized display PNG —
    see calibration.CalibrationFit's docstring on why that distinction matters).
    texture_bytes: a JPG/PNG image, typically the same photo depth was run on.
    """
    start = time.monotonic()

    elevation = np.load(io.BytesIO(elevation_bytes))
    if elevation.ndim != 2:
        raise InvalidImageError(f"Expected a 2D elevation array, got shape {elevation.shape}")

    try:
        texture_rgb = decode_image_bytes(texture_bytes)
    except Exception as e:
        raise InvalidImageError(f"Could not decode texture image bytes: {e}")

    # Downsample geometry resolution for a renderable mesh, but keep the
    # GeoTIFF at full elevation resolution — the raster format has no vertex
    # count to worry about, so there's no reason to throw away real data there.
    mesh_elevation = downsample_elevation_for_mesh(elevation, max_grid_size=MAX_MESH_GRID_SIZE)
    geometry = build_heightfield_geometry(
        mesh_elevation, pixel_size_x=pixel_size_x, pixel_size_z=pixel_size_z, z_exaggeration=z_exaggeration
    )

    zip_bytes = build_mesh_zip(
        geometry,
        texture_rgb,
        elevation_for_geotiff=elevation,  # full resolution, not the downsampled mesh version
        geo_transform=geo_transform,
        geo_crs=geo_crs,
        include_obj=include_obj,
    )

    elapsed_ms = int((time.monotonic() - start) * 1000)
    return MeshResult(
        zip_bytes=zip_bytes,
        vertex_count=len(geometry.vertices),
        face_count=len(geometry.faces),
        processing_ms=elapsed_ms,
    )