"""
Stage 2: Depth inference (PyTorch / Hugging Face Transformers)

Design note — why this file has no `import torch` at the top level:
    torch and transformers are only imported LAZILY, inside HFDepthAnythingV2's
    methods. This means this whole file can be imported and its orchestration
    logic (run_depth_pipeline: tile -> predict each tile -> stitch) can be
    unit-tested on a machine with no GPU, no torch, and no internet access —
    using DummyDepthModel as a stand-in. That's exactly the environment this
    code was developed and tested in. HFDepthAnythingV2 itself is the one
    piece that needs a real environment (Colab/GPU box) to verify.

Both classes implement the same `predict(image) -> depth_map` interface,
which is also what the design doc's "multi-backbone selection" feature
needs later (swap in MiDaS/ZoeDepth without touching pipeline code).
"""

from functools import lru_cache
from typing import Protocol

import numpy as np

from .preprocess import Tile, stitch_tiles, tile_image


class DepthModel(Protocol):
    def predict(self, image: np.ndarray) -> np.ndarray:
        """image: HxWx3 uint8 RGB tile. Returns HxW float32 relative depth
        (arbitrary scale/offset — calibration happens in Stage 3, not here)."""
        ...


class DummyDepthModel:
    """Dependency-free stand-in for testing pipeline PLUMBING, not accuracy.

    Returns grayscale pixel intensity as fake 'depth'. This is obviously not
    a real depth estimate — its only job is to be a deterministic, fast,
    torch-free function with the right shape/dtype contract, so tests can
    verify tiling and stitching work correctly without needing model weights.
    Never use this for anything except tests.
    """

    def predict(self, image: np.ndarray) -> np.ndarray:
        return image.mean(axis=2).astype(np.float32)


def to_relative_elevation(inverse_depth: np.ndarray) -> np.ndarray:
    """Flip Depth Anything V2's inverse-depth convention (higher = closer)
    to ours (higher = higher elevation, i.e. farther from an overhead camera).

    Pulled out as its own function specifically so this sign convention can
    be unit-tested without loading any model — see
    tests/test_depth_infer.py::test_to_relative_elevation_flips_ordering.
    Getting this backwards flips your entire terrain upside down; a building
    would come out as a pit instead of a tower.
    """
    return -inverse_depth


class HFDepthAnythingV2:
    """The real backbone, via Hugging Face Transformers.

    Loading happens once in __init__ (downloads + initializes weights —
    several seconds, up to ~1.3GB depending on checkpoint size). Reuse one
    instance across requests; do not construct a new one per inference call.
    """

    CHECKPOINTS = {
        "small": "depth-anything/Depth-Anything-V2-Small-hf",
        "base": "depth-anything/Depth-Anything-V2-Base-hf",
        "large": "depth-anything/Depth-Anything-V2-Large-hf",
    }

    def __init__(self, size: str = "small", device: str | None = None):
        if size not in self.CHECKPOINTS:
            raise ValueError(f"size must be one of {list(self.CHECKPOINTS)}, got {size!r}")

        import torch
        from transformers import AutoImageProcessor, AutoModelForDepthEstimation

        self._torch = torch  # stashed so predict() doesn't need to re-import
        checkpoint = self.CHECKPOINTS[size]

        if device is None:
            if torch.cuda.is_available():
                device = "cuda"
            elif torch.backends.mps.is_available():  # Apple Silicon
                device = "mps"
            else:
                device = "cpu"
        self.device = device

        self.processor = AutoImageProcessor.from_pretrained(checkpoint)
        self.model = AutoModelForDepthEstimation.from_pretrained(checkpoint)
        self.model.to(self.device)
        self.model.eval()

    def predict(self, image: np.ndarray) -> np.ndarray:
        from PIL import Image

        torch = self._torch
        pil_img = Image.fromarray(image)
        inputs = self.processor(images=pil_img, return_tensors="pt")
        inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model(**inputs)
            predicted_depth = outputs.predicted_depth  # shape (1, h', w') — model's internal resolution

        # The model's internal resolution usually differs from the input tile
        # size, so resize back before this tile gets stitched with its
        # neighbors — stitch_tiles assumes each depth map matches its tile.
        resized = torch.nn.functional.interpolate(
            predicted_depth.unsqueeze(1),
            size=image.shape[:2],
            mode="bicubic",
            align_corners=False,
        )
        raw_inverse_depth = resized.squeeze().cpu().numpy().astype(np.float32)

        # Depth Anything V2 outputs INVERSE depth (disparity): higher value =
        # CLOSER to the camera. We want the opposite convention everywhere
        # downstream — higher value = higher elevation = farther from an
        # overhead/satellite camera — so we flip it here, once, at the
        # source, rather than remembering to handle it in calibration.
        return to_relative_elevation(raw_inverse_depth)


@lru_cache(maxsize=1)
def get_model(size: str = "small") -> HFDepthAnythingV2:
    """Process-wide singleton so the FastAPI service loads weights once at
    startup, not on every request. lru_cache(maxsize=1) means calling this
    twice with the same `size` returns the same instance; calling it with a
    different `size` would evict and load a new one (fine for dev, but in
    prod you'd want one instance per backbone kept alive, per the design
    doc's multi-backbone-selection feature)."""
    return HFDepthAnythingV2(size=size)


def run_depth_pipeline(
    image: np.ndarray,
    model: DepthModel,
    tile_size: int = 512,
    overlap: int = 64,
) -> np.ndarray:
    """The full Stage 2 orchestration: tile -> predict each tile -> stitch.

    This is the function that plugs into main.py's /infer-depth endpoint,
    and it's also the function the tests below exercise directly with
    DummyDepthModel — same code path either way, only the model differs.
    """
    tiles: list[Tile] = tile_image(image, tile_size=tile_size, overlap=overlap)
    depth_maps = [model.predict(t.image) for t in tiles]
    return stitch_tiles(tiles, depth_maps, output_shape=image.shape[:2])


def normalize_for_display(depth: np.ndarray) -> np.ndarray:
    """Min-max normalize a relative-elevation map to uint8 [0, 255], for
    saving a viewable PNG only.

    IMPORTANT: never feed this into the calibration stage. Calibration fits
    elevation = a * raw_value + b using the RAW float values; this rescale
    changes what `a` and `b` mean for every single image, breaking the
    "fit once per image, reuse consistently" assumption calibration relies on.
    """
    d_min, d_max = float(depth.min()), float(depth.max())
    if d_max - d_min < 1e-8:
        return np.zeros(depth.shape, dtype=np.uint8)
    normalized = (depth - d_min) / (d_max - d_min)
    return (normalized * 255).astype(np.uint8)