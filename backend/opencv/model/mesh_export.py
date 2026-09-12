"""
Stage 4b: Exporting geometry to actual files — glTF/GLB, OBJ, and GeoTIFF.

Needs trimesh (mesh export) and rasterio (GeoTIFF export), neither of which
is installed in my sandbox. Both are lazy-imported for the same reason as
depth_infer.py's torch import: keeps this module importable, and its control
flow testable via stubs, even without the real libraries present. I verified
this file by stubbing trimesh/rasterio and running the full assembly logic
end-to-end (catches wiring bugs — wrong argument order, wrong dict keys —
the same class of bug the FastAPI/CHECKPOINTS mistake was earlier). I did
NOT verify that real trimesh/rasterio behave exactly as I assumed; that's
your job once you `pip install trimesh rasterio` for real.
"""

import io
import zipfile

import numpy as np

try:
    from .mesh_geometry import HeightfieldGeometry
except ImportError:
    from mesh_geometry import HeightfieldGeometry


def assemble_textured_mesh(geometry: HeightfieldGeometry, texture_rgb: np.ndarray):
    """Build a trimesh.Trimesh from our geometry + a texture image.

    trimesh's TextureVisuals wants a PIL Image, not a raw NumPy array —
    this is the one conversion point where a BGR/RGB mixup could sneak
    back in if texture_rgb weren't already guaranteed RGB (it is, since
    everything upstream from preprocess.load_image_rgb onward stays RGB).
    """
    import trimesh
    from PIL import Image
    from trimesh.visual.texture import TextureVisuals

    pil_texture = Image.fromarray(texture_rgb)
    visual = TextureVisuals(uv=geometry.uvs, image=pil_texture)
    mesh = trimesh.Trimesh(
        vertices=geometry.vertices,
        faces=geometry.faces,
        visual=visual,
        process=False,  # don't let trimesh merge/reorder vertices — would desync our UV array from vertex indices
    )
    return mesh


def export_glb_bytes(mesh) -> bytes:
    """GLB: single self-contained binary file, texture embedded — the
    recommended format for Three.js, since the frontend fetches exactly
    one file with no separate texture/material requests."""
    return mesh.export(file_type="glb")


def export_obj_bundle(mesh) -> dict[str, bytes]:
    """OBJ is NOT a single-file format — it always needs a companion .mtl
    (material) file, and the texture image is a THIRD separate file
    referenced by relative path inside the .mtl. Returns all three as a
    dict so the caller can decide how to package them (main.py zips them
    together with the .glb and the GeoTIFF into one response).
    """
    import trimesh.exchange.obj

    export = trimesh.exchange.obj.export_obj(mesh, return_texture=True)
    bundle = {}
    if isinstance(export, tuple):
        obj_text, files = export
        bundle["mesh.obj"] = obj_text.encode("utf-8") if isinstance(obj_text, str) else obj_text
        if isinstance(files, dict):
            for name, content in files.items():
                bundle[name] = content.encode("utf-8") if isinstance(content, str) else content
    elif isinstance(export, dict):
        for name, content in export.items():
            bundle[name] = content.encode("utf-8") if isinstance(content, str) else content
    elif isinstance(export, str):
        bundle["mesh.obj"] = export.encode("utf-8")
    elif isinstance(export, bytes):
        bundle["mesh.obj"] = export
    return bundle


def export_geotiff_bytes(elevation: np.ndarray, transform=None, crs=None) -> bytes:
    """Write the calibrated absolute-elevation array as a single-band
    float32 GeoTIFF, for opening in QGIS/ArcGIS or feeding into other GIS
    tools — this is what the design doc's validation dashboard would
    compare against a reference DSM with.

    transform/crs are optional: if the source image was georeferenced
    (Stage 3's SRTM path), pass its rasterio transform/CRS so the GeoTIFF
    carries real-world coordinates. If calibration was GCP-based with no
    real geotransform, pass None for both — the file is still a valid
    single-band raster, just without a real-world coordinate anchor (GIS
    tools will show pixel coordinates instead of lon/lat).
    """
    from rasterio.io import MemoryFile
    from rasterio.transform import Affine

    h, w = elevation.shape[:2]
    profile = {
        "driver": "GTiff",
        "dtype": "float32",
        "count": 1,
        "height": h,
        "width": w,
        "transform": transform if transform is not None else Affine.identity(),
        "crs": crs,  # rasterio accepts None here for an unanchored raster
    }
    with MemoryFile() as memfile:
        with memfile.open(**profile) as dataset:
            dataset.write(elevation.astype(np.float32), 1)
        return memfile.read()


def build_mesh_zip(
    geometry: HeightfieldGeometry,
    texture_rgb: np.ndarray,
    elevation_for_geotiff: np.ndarray,
    geo_transform=None,
    geo_crs=None,
    include_obj: bool = False,
) -> bytes:
    """Assemble the full Stage 4 deliverable: always mesh.glb + dsm.tif,
    optionally mesh.obj/.mtl/texture.png too — bundled into ONE zip file so
    the Node worker makes a single request and gets everything it needs to
    upload to S3, rather than the Python service running mesh assembly
    multiple times for multiple format-specific endpoints.
    """
    mesh = assemble_textured_mesh(geometry, texture_rgb)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("mesh.glb", export_glb_bytes(mesh))
        zf.writestr("dsm.tif", export_geotiff_bytes(elevation_for_geotiff, geo_transform, geo_crs))
        if include_obj:
            for filename, content in export_obj_bundle(mesh).items():
                zf.writestr(filename, content)
    return buf.getvalue()