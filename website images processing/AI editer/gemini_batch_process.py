#!/usr/bin/env python3
"""Gemini-only batch image editing pipeline for Shopify product images."""

from __future__ import annotations

import argparse
import base64
import gc
import hashlib
import json
import logging
import mimetypes
import os
import sys
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import import_module
from importlib.metadata import PackageNotFoundError, version
from io import BytesIO
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import errors, types
from PIL import Image, ImageChops, ImageColor, ImageDraw, ImageFilter, UnidentifiedImageError


DEFAULT_MODEL = "gemini-3.1-flash-image"
PRO_MODEL = "gemini-3-pro-image"
FINAL_BACKGROUND_HEX = "#EDEBE8"
PROCESSING_MANIFEST_FILE = "processing_manifest.json"
PENDING_TASKS_LOG_FILE = "pending_tasks_log.json"
BATCH_JOBS_MANIFEST_FILE = "batch_jobs_manifest.json"
BATCH_PREPARE_DIR = "batch_jobs"
INLINE_BATCH_SIZE_LIMIT_BYTES = 15 * 1024 * 1024
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ROLE_REFERENCES = {
    "front": "front.webp",
    "back": "back.webp",
    "top": "top.webp",
}
TOP_KEYWORDS = (
    "top-down",
    "top_down",
    "topdown",
    "close-up",
    "close_up",
    "closeup",
    "detail",
    "macro",
    "close",
    "top",
)
BILLING_MARKERS = (
    "monthly spending cap",
    "spend cap",
    "no available credits",
    "too many requests",
    "quota",
    "billing",
)
RETRY_CODES = {429, 500, 503, 504}
DEFAULT_BACKOFF_SECONDS = [30, 90, 180]
MODEL_PROFILES = {
    "flash_image": {
        "label": "Gemini 3.1 Flash Image",
        "model_id": DEFAULT_MODEL,
        "quality": "good",
        "speed": "fast",
        "estimated_standard_cost_inr_per_image": 7.0,
        "description": "Recommended for bulk ecommerce image editing. Faster and cheaper.",
    },
    "pro_image": {
        "label": "Gemini 3 Pro Image",
        "model_id": PRO_MODEL,
        "quality": "best",
        "speed": "slower",
        "estimated_standard_cost_inr_per_image": 14.0,
        "description": "Higher-quality image model. Use for premium/critical products.",
    },
}
MODEL_PROFILE_ALIASES = {
    "gemini_flash_image_standard": "flash_image",
    "gemini_flash_image_batch": "flash_image",
    "gemini flash image standard": "flash_image",
    "gemini flash image batch": "flash_image",
    "1": "flash_image",
    "2": "pro_image",
    "flash_image": "flash_image",
    "flash image": "flash_image",
    "pro_image": "pro_image",
    "pro image": "pro_image",
    "gemini flash image": "flash_image",
    "gemini 3.1 flash image": "flash_image",
    "gemini 3 flash image": "flash_image",
    "flash": "flash_image",
    "gemini pro image": "pro_image",
    "gemini 3 pro image": "pro_image",
    "pro": "pro_image",
}
API_MODE_ALIASES = {
    "1": "standard",
    "2": "batch",
    "standard": "standard",
    "standard api": "standard",
    "batch": "batch",
    "batch api": "batch",
}
EDIT_PROMPT_TEMPLATE = """You are editing an ecommerce apparel product image.

Images:

1. REFERENCE IMAGE: use to copy background style, lighting direction, framing, product centering, pose/alignment, and clean Shopify presentation.
2. INPUT IMAGE: the absolute source of truth for the actual product.

Your task:
Improve the INPUT IMAGE so it becomes a clean premium Shopify product photo while preserving the real product exactly, and matching the reference image presentation perfectly.

Critical rules:

* The INPUT IMAGE product is the absolute source of truth for brand, graphics, logos, and color.
* You must actively shape and align the garment's silhouette, shoulders, sleeve angles, and bottom hem to match the REFERENCE IMAGE exactly. The output must align perfectly with the REFERENCE IMAGE's geometry and pose.
* Clean and attend to the sleeves: straighten them, match the sleeve angles of the REFERENCE IMAGE, and make them clean, flat, and symmetrical.
* Remove all wrinkles, creases, waves, and fold lines at the bottom of the garment and along the hem. Flatten the bottom hem so it is completely straight and clean, matching the flat lay style of the REFERENCE IMAGE.
* Keep the exact garment identity, seams, collar line, neckline, and realistic fabric texture from the INPUT IMAGE.
* Preserve exact logo, print, graphic, embroidery, label, and brand tag placement and scale. Do not enlarge, shrink, move, redraw, reinterpret, or restyle any print, logo, or graphic.
* Do not invent missing details or change the product design in any way.
* Do not add text, watermark, graphics, props, hanger, mannequin, body, hand, table, tag, sticker, box, pedestal, rectangle, or extra object.
* Do not add any grey bar, grey rectangle, shadow block, platform, base, or label area below the product.
* Do not copy garment details (such as fabric texture, print graphics, or logos) from the REFERENCE IMAGE, but you MUST copy its pose, layout, alignment, and geometry.
* Clean the background and improve presentation without creatively reconstructing the product.
* Do not make it look AI-generated.

Allowed improvements:

* clean background
* mildly improve lighting and white balance
* keep the product centered enough for later cropping
* make only minimal presentation corrections that do not alter the product

Output requirements:

* Return only the edited product image.
* Use a plain solid ecommerce background with exact target background color #EDEBE8.
* No pure white background.
* No grey gradient.
* No colored cast.
* No textured background.
* No shadows in the background.
* Only a soft natural product grounding shadow under the garment.
* No text overlay.
* No watermark.
* No extra object.
* No grey rectangle below product.
* No pedestal or platform.

Product preservation mode:

* Treat this as a preservation-first cleanup task, not a creative generation task.
* If uncertain, keep the product exactly as shown in the INPUT IMAGE."""

CATALOG_RETOUCH_APPENDIX = """

Catalog retouch mode:

* Perform premium ecommerce catalogue retouching while keeping the exact same T-shirt.
* Preserve the exact chest graphic, logo, print, text, label, and tag details.
* Preserve garment color as white or off-white.
* Preserve collar, sleeves, hem, seams, and overall proportions.
* Remove visible wrinkles and harsh creases.
* Smooth the fabric naturally without making it look plastic.
* Flatten the T-shirt into a clean catalogue-style flat lay.
* Straighten the hem and sleeves slightly.
* Improve lighting to match the reference image.
* Use the REFERENCE IMAGE only for catalogue style, lighting, background, scale, and framing.
* Use a plain solid ecommerce background with exact target background color #EDEBE8.
* No pure white background, no grey gradient, no colored cast, and no textured background.
* Keep only a soft natural product grounding shadow under the garment.
* Do not invent artwork.
* Do not alter, redraw, or restyle the graphic.
* Do not change the product into another brand or another product.
* Keep retouching limited to wrinkle removal, fabric flattening, lighting, and presentation improvements."""

GHOST_CATALOG_APPENDIX = """

Ghost catalog mode:

* Create a premium ghost-product ecommerce image suitable for luxury catalog and high-end Shopify presentation.
* The INPUT IMAGE is the absolute truth for product identity, chest graphic, logo, print, text, garment color, tag, label, and fabric identity.
* The REFERENCE IMAGE is the absolute truth for ghost-product presentation, especially shoulder slope, sleeve angle, sleeve opening shape, collar position, hem straightness, product scale, centering, background tone, and soft shadow style.
* Match the reference silhouette closely, especially shoulders, sleeves, collar, and hem.
* Reduce wrinkles significantly and smooth fabric naturally while keeping realistic cotton texture.
* Keep the exact chest graphic, logo, print, and text placement and proportions accurate.
* Keep label and tag visible if they are visible in the source.
* Use a plain solid ecommerce background with exact target background color #EDEBE8.
* No pure white background, no grey gradient, no colored cast, and no textured background.
* Keep only a soft natural product grounding shadow under the garment.
* Avoid plastic or artificial smoothing.
* Avoid changing the product into another garment or brand.
* Avoid distorting, redrawing, moving, enlarging, or shrinking the artwork.
* Avoid cropping the product.

Priority order:
1. Preserve product identity and artwork exactly.
2. Match reference silhouette, shoulders, sleeves, collar, and hem.
3. Remove wrinkles and improve premium ghost-catalog appearance.
4. Match background, framing, scale, and shadow."""

GHOST_PROMPT_STRENGTH_APPENDIX = {
    "conservative": """

Ghost prompt strength: conservative

* Apply only minor wrinkle removal.
* Apply mild silhouette correction.
* Favor highest product preservation over silhouette correction.""",
    "balanced": """

Ghost prompt strength: balanced

* Apply strong wrinkle reduction.
* Apply strong reference silhouette matching.
* Keep artwork and product identity exact.
* This is the recommended balance between premium ghost-catalog retouching and product accuracy.""",
    "aggressive": """

Ghost prompt strength: aggressive

* Apply maximum ghost-catalog improvement.
* Strongly correct shoulders, sleeves, collar, and hem toward the reference silhouette.
* Remove wrinkles aggressively while preserving realistic fabric texture.
* Preserve artwork and product identity exactly even during stronger silhouette correction.""",
}

GHOST_RETRY_APPENDIX = """

Correction instruction:

* The previous output did not match the reference shoulders and sleeves closely enough.
* Correct the garment silhouette closer to the reference, especially shoulders, sleeves, collar, and hem, while preserving artwork exactly.
* Do not distort or redraw the print, logo, label, or garment identity."""

MISSING_TOP_PROMPT_TEMPLATE = f"""You are generating a top/neck-focused ecommerce ghost-product image.

Source images:

* FRONT/BACK PRODUCT PHOTOS: truth for garment identity, color, logo/graphic, collar type, fabric, and construction.
* TOP REFERENCE IMAGE: truth for crop, angle, layout, neckline framing, and presentation style.

Your task:

* First infer the garment type from the available product photos.
* Create a top/neck-detail ecommerce product image, not a full front product image.
* Create a neckline/upper-chest detail image only. This is NOT a front product photo.
* Do not show the full garment.
* Do not show the bottom hem.
* Do not show the full body of the T-shirt.
* Replicate the provided top reference image's crop, angle, framing, neckline composition, and canvas placement.
* Use the product source images only to preserve garment identity, collar type, fabric color, logo/graphic, label, and construction.
* The output must look like the reference top-detail image adapted to this exact product.
* Crop should focus on neckline, collar, label area, upper shoulders, and upper chest only.
* The garment must occupy the same type of crop as references/top.webp.
* Do not show the full garment.
* Do not show the full hem.
* Do not create a normal front product image.
* Generate a top/neck-focused ecommerce ghost-product image.
* Match the layout and framing of references/top.webp.
* Preserve the actual product identity.
* Preserve garment color.
* Preserve collar and neck structure based on the detected garment type.
* Preserve visible branding, logo, and graphic if it should appear in the top crop.
* Use exact background color {FINAL_BACKGROUND_HEX}.
* Use soft natural shadow only if needed.
* If the source is round neck, keep round neck.
* If polo, shirt, jacket, sweater, hoodie, or sweatshirt, preserve that actual collar and construction.
* Avoid inventing wrong collars, buttons, zippers, labels, logos, graphics, or stitching.
* Avoid changing a round neck into polo or shirt, or polo into round neck.
* Avoid fake graphics or hallucinated text.
* Avoid cropping too tightly unless the top reference requires it.

Output requirements:

* Return only the edited product image.
* Plain solid ecommerce background with exact target background color {FINAL_BACKGROUND_HEX}.
* No pure white background.
* No grey gradient.
* No colored cast.
* No textured background.
* No background shadows.
* Only a soft natural product grounding shadow under the garment."""


class BatchProcessError(Exception):
    """Base error for pipeline failures."""


class MissingApiKeyError(BatchProcessError):
    """Raised when no Gemini API key is available."""


class BillingCapError(BatchProcessError):
    """Raised when Gemini billing or spend cap blocks processing."""


@dataclass
class JobRecord:
    product_folder: str
    role: str | None
    input_file: str
    reference_file: str | None
    resized_input_file: str | None
    resized_reference_file: str | None
    output_file: str | None
    status: str
    error: str | None
    model: str
    started_at: str
    finished_at: str | None = None
    detected_bbox: list[int] | None = None
    rembg_succeeded: bool | None = None
    artifacts_removed: bool | None = None
    final_product_scale: float | None = None
    quality_gate_passed: bool | None = None
    estimated_cost_inr: float | None = None
    gemini_calls_made: int = 0
    retries_used: int = 0
    reference_mismatch_score: float | None = None
    reference_mismatch_threshold: float | None = None
    reference_mismatch_warning: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "product_folder": self.product_folder,
            "role": self.role,
            "input_file": self.input_file,
            "reference_file": self.reference_file,
            "resized_input_file": self.resized_input_file,
            "resized_reference_file": self.resized_reference_file,
            "output_file": self.output_file,
            "status": self.status,
            "error": self.error,
            "model": self.model,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "detected_bbox": self.detected_bbox,
            "rembg_succeeded": self.rembg_succeeded,
            "artifacts_removed": self.artifacts_removed,
            "final_product_scale": self.final_product_scale,
            "quality_gate_passed": self.quality_gate_passed,
            "estimated_cost_inr": self.estimated_cost_inr,
            "gemini_calls_made": self.gemini_calls_made,
            "retries_used": self.retries_used,
            "reference_mismatch_score": self.reference_mismatch_score,
            "reference_mismatch_threshold": self.reference_mismatch_threshold,
            "reference_mismatch_warning": self.reference_mismatch_warning,
        }


@dataclass
class CleanupResult:
    image: Image.Image
    bbox: tuple[int, int, int, int]
    rembg_succeeded: bool
    artifacts_removed: bool
    final_scale: float
    debug_pre_cleanup: Image.Image | None = None
    debug_mask: Image.Image | None = None
    debug_bbox: Image.Image | None = None
    raw_bbox: tuple[int, int, int, int] | None = None


class BillingCapStop(BillingCapError):
    """Raised to stop the batch while preserving the current job record."""

    def __init__(self, message: str, record: JobRecord) -> None:
        super().__init__(message)
        self.record = record


_REMBG_SESSION: object | None = None
_REMBG_REMOVE: Any | None = None
_REMBG_PROVIDERS: list[str] | None = None
_REMBG_DEVICE_LABEL = "CPU"
_ONNXRUNTIME_VERSION = "not installed"
_ONNXRUNTIME_AVAILABLE_PROVIDERS: list[str] = []


@dataclass
class BatchPayloadBuildResult:
    payload_type: str
    task_count: int
    request_size_bytes: int
    image_data_included: bool
    reference_image_included: bool
    output_config_included: bool
    tasks_preview: list[dict[str, Any]]
    payload_preview: dict[str, Any]
    validation_report: dict[str, Any]
    inline_requests: list[dict[str, Any]]
    jsonl_lines: list[dict[str, Any]]
    prepared_assets: list[dict[str, Any]]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def format_elapsed_since(started_at: str | None) -> str:
    started_dt = parse_iso_datetime(started_at)
    if started_dt is None:
        return "unknown"
    elapsed = datetime.now(timezone.utc) - started_dt
    total_seconds = max(0, int(elapsed.total_seconds()))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours > 0:
        return f"{hours}h {minutes}m {seconds}s"
    if minutes > 0:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def format_elapsed_between(started_at: str | None, ended_at: str | None) -> str:
    started_dt = parse_iso_datetime(started_at)
    ended_dt = parse_iso_datetime(ended_at) or datetime.now(timezone.utc)
    if started_dt is None:
        return "unknown"
    elapsed = ended_dt - started_dt
    total_seconds = max(0, int(elapsed.total_seconds()))
    hours, remainder = divmod(total_seconds, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours > 0:
        return f"{hours}h {minutes}m {seconds}s"
    if minutes > 0:
        return f"{minutes}m {seconds}s"
    return f"{seconds}s"


def stringify_sdk_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(key): stringify_sdk_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [stringify_sdk_value(item) for item in value]
    if hasattr(value, "model_dump"):
        try:
            return value.model_dump(mode="json")
        except Exception:
            return str(value)
    if hasattr(value, "value"):
        inner = getattr(value, "value")
        if isinstance(inner, str):
            return inner
    return str(value)


def serialize_sdk_object(value: Any) -> dict[str, Any]:
    if value is None:
        return {}
    if hasattr(value, "model_dump"):
        try:
            dumped = value.model_dump(mode="json")
            if isinstance(dumped, dict):
                return dumped
        except Exception:
            pass
    if isinstance(value, dict):
        return value
    payload: dict[str, Any] = {}
    for name in dir(value):
        if name.startswith("_"):
            continue
        try:
            attr = getattr(value, name)
        except Exception:
            continue
        if callable(attr):
            continue
        payload[name] = stringify_sdk_value(attr)
    return payload


def normalize_batch_state_name(state: Any) -> str:
    raw = stringify_sdk_value(state)
    text = str(raw or "").strip()
    if not text:
        return "UNKNOWN"
    if "." in text:
        text = text.split(".")[-1]
    return text.upper()


def is_terminal_batch_state(state: str) -> bool:
    return state in {"JOB_STATE_SUCCEEDED", "JOB_STATE_FAILED", "JOB_STATE_EXPIRED", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED", "JOB_STATE_CANCELLED"}


def is_active_batch_state(state: str) -> bool:
    return state in {"JOB_STATE_PENDING", "JOB_STATE_RUNNING", "PENDING", "RUNNING"}


def detect_mime_type(path: Path) -> str | None:
    guessed, _ = mimetypes.guess_type(path.name)
    if guessed:
        return guessed
    suffix = path.suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return None


def configure_logging() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")


def parse_bool(value: str) -> bool:
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y", "on"}:
        return True
    if lowered in {"0", "false", "no", "n", "off"}:
        return False
    raise argparse.ArgumentTypeError(f"Invalid boolean value: {value}")


def normalize_model_profile_name(value: str) -> str | None:
    normalized = " ".join(value.strip().lower().replace("-", " ").replace("_", " ").split())
    return MODEL_PROFILE_ALIASES.get(normalized)


def normalize_api_mode(value: str) -> str | None:
    normalized = " ".join(value.strip().lower().replace("-", " ").replace("_", " ").split())
    return API_MODE_ALIASES.get(normalized)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Batch-edit product images with the Gemini image API."
    )
    parser.add_argument("--references", default="references")
    parser.add_argument("--input", default="input")
    parser.add_argument("--output", default="results")
    parser.add_argument("--cache", default="resized_cache")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--work-size", type=int, default=1024)
    parser.add_argument("--max-input-side", type=int, default=1024)
    parser.add_argument("--final-size", type=int, default=1600)
    parser.add_argument("--bg-color", default=FINAL_BACKGROUND_HEX)
    parser.add_argument("--quality", type=int, default=95)
    parser.add_argument("--retries", type=int, default=0)
    parser.add_argument("--sleep-between", type=int, default=30)
    parser.add_argument("--neutralize-cast", type=parse_bool, default=True)
    parser.add_argument("--postprocess-segment", type=parse_bool, default=True)
    parser.add_argument("--safe-mode", type=parse_bool, default=True)
    parser.add_argument("--use-rembg", type=parse_bool, default=True)
    parser.add_argument("--use-gpu-if-available", type=parse_bool, default=True)
    parser.add_argument("--product-preservation-mode", type=parse_bool, default=True)
    parser.add_argument("--catalog-retouch-mode", type=parse_bool, default=False)
    parser.add_argument("--ghost-catalog-mode", type=parse_bool, default=False)
    parser.add_argument("--ghost-prompt-strength", choices=["conservative", "balanced", "aggressive"], default="balanced")
    parser.add_argument("--force-reprocess", type=parse_bool, default=False)
    parser.add_argument("--gemini-retry-count", type=int, default=0)
    parser.add_argument("--reject-if-reference-mismatch", type=parse_bool, default=True)
    parser.add_argument("--stop-on-gemini-quota-error", type=parse_bool, default=False)
    parser.add_argument("--only-missing", type=parse_bool, default=False)
    parser.add_argument("--max-cost-per-image-inr", type=float, default=10.0)
    parser.add_argument("--estimated-gemini-call-cost-inr", type=float, default=7.0)
    parser.add_argument("--disable-retries-if-cost-cap", type=parse_bool, default=True)
    parser.add_argument("--cost-guard", type=parse_bool, default=True)
    parser.add_argument("--dry-run-cost", type=parse_bool, default=False)
    parser.add_argument("--generate-missing-top", type=parse_bool, default=True)
    parser.add_argument("--top-generation-mode", choices=["reference-guided"], default="reference-guided")
    parser.add_argument("--top-reference", default="references/top.webp")
    parser.add_argument("--reference-mismatch-mode", choices=["strict", "balanced", "warn-only"], default="balanced")
    parser.add_argument("--front-reference-mismatch-threshold", type=float, default=0.45)
    parser.add_argument("--back-reference-mismatch-threshold", type=float, default=0.50)
    parser.add_argument("--top-reference-mismatch-threshold", type=float, default=0.65)
    parser.add_argument("--use-processing-manifest", type=parse_bool, default=True)
    parser.add_argument("--only-unprocessed-products", type=parse_bool, default=True)
    parser.add_argument("--reset-processing-manifest", type=parse_bool, default=False)
    parser.add_argument("--only-product-folder", default=None)
    parser.add_argument("--skip-artifact-cleanup", type=parse_bool, default=None)
    parser.add_argument("--save-debug", type=parse_bool, default=True)
    parser.add_argument("--reload-rembg-each-image", type=parse_bool, default=False)
    parser.add_argument("--sleep-between-images", type=int, default=2)
    parser.add_argument("--max-images-this-run", type=int, default=0)
    parser.add_argument("--fail-on-bad-bbox", type=parse_bool, default=True)
    parser.add_argument("--only-image", default=None)
    parser.add_argument("--only-output-role", choices=["front", "back", "top", "all"], default="all")
    parser.add_argument("--force-generate-top", type=parse_bool, default=False)
    parser.add_argument("--pause-top-processing", type=parse_bool, default=True)
    parser.add_argument("--api-mode", choices=["standard", "batch"], default="standard")
    parser.add_argument("--model-profile", default="flash_image")
    parser.add_argument("--interactive-config", type=parse_bool, default=True)
    parser.add_argument("--yes", type=parse_bool, default=False)
    parser.add_argument("--batch-action", choices=["prepare", "submit", "poll", "download", "postprocess", "run", "inspect", "validate", "selftest"], default="run")
    parser.add_argument("--batch-id", default=None)
    parser.add_argument("--batch-input-mode", choices=["auto", "inline", "file"], default="auto")
    parser.add_argument("--force-new-batch-job", type=parse_bool, default=False)
    parser.add_argument("--standard-estimated-cost-inr", type=float, default=7.0)
    parser.add_argument("--batch-cost-multiplier", type=float, default=0.5)
    parser.add_argument("--product-scale", type=float, default=0.836)
    parser.add_argument("--top-product-scale", type=float, default=0.902)
    parser.add_argument("--vertical-center", type=float, default=0.47)
    parser.add_argument("--safe-padding", type=float, default=0.08)
    parser.add_argument("--use-pro-model", type=parse_bool, default=False)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def validate_args(args: argparse.Namespace) -> list[str]:
    errors_list: list[str] = []
    if args.work_size <= 0:
        errors_list.append("--work-size must be greater than 0.")
    if args.final_size <= 0:
        errors_list.append("--final-size must be greater than 0.")
    if args.max_input_side <= 0:
        errors_list.append("--max-input-side must be greater than 0.")
    if not 1 <= args.quality <= 100:
        errors_list.append("--quality must be between 1 and 100.")
    if args.retries < 0:
        errors_list.append("--retries must be 0 or greater.")
    if args.gemini_retry_count < 0 or args.gemini_retry_count > 3:
        errors_list.append("--gemini-retry-count must be between 0 and 3.")
    if args.max_cost_per_image_inr < 0:
        errors_list.append("--max-cost-per-image-inr must be 0 or greater.")
    if args.estimated_gemini_call_cost_inr < 0:
        errors_list.append("--estimated-gemini-call-cost-inr must be 0 or greater.")
    if args.standard_estimated_cost_inr < 0:
        errors_list.append("--standard-estimated-cost-inr must be 0 or greater.")
    if args.batch_cost_multiplier < 0:
        errors_list.append("--batch-cost-multiplier must be 0 or greater.")
    if args.batch_id is not None and not args.batch_id.strip():
        errors_list.append("--batch-id must not be empty when provided.")
    normalized_profile = normalize_model_profile_name(args.model_profile)
    if normalized_profile is None:
        errors_list.append("--model-profile must be a supported profile or backward-compatible alias.")
    else:
        args.model_profile = normalized_profile
    if args.front_reference_mismatch_threshold < 0:
        errors_list.append("--front-reference-mismatch-threshold must be 0 or greater.")
    if args.back_reference_mismatch_threshold < 0:
        errors_list.append("--back-reference-mismatch-threshold must be 0 or greater.")
    if args.top_reference_mismatch_threshold < 0:
        errors_list.append("--top-reference-mismatch-threshold must be 0 or greater.")
    if args.sleep_between < 0:
        errors_list.append("--sleep-between must be 0 or greater.")
    if args.sleep_between_images < 0:
        errors_list.append("--sleep-between-images must be 0 or greater.")
    if args.max_images_this_run < 0:
        errors_list.append("--max-images-this-run must be 0 or greater.")
    if not 0.55 <= args.product_scale <= 0.95:
        errors_list.append("--product-scale must be between 0.55 and 0.95.")
    if not 0.55 <= args.top_product_scale <= 0.95:
        errors_list.append("--top-product-scale must be between 0.55 and 0.95.")
    if not 0.35 <= args.vertical_center <= 0.6:
        errors_list.append("--vertical-center must be between 0.35 and 0.6.")
    if not 0 <= args.safe_padding <= 0.2:
        errors_list.append("--safe-padding must be between 0 and 0.2.")
    return errors_list


def ensure_directories(paths: list[Path]) -> None:
    for path in paths:
        path.mkdir(parents=True, exist_ok=True)


def load_api_key() -> str:
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise MissingApiKeyError(
            "Missing GEMINI_API_KEY. Add it to .env or export GEMINI_API_KEY in your environment."
        )
    return api_key


def effective_model(args: argparse.Namespace, profile: dict[str, Any]) -> str:
    if args.use_pro_model:
        raise BatchProcessError("--use-pro-model is not allowed. Use --model-profile pro_image instead.")
    if args.model != profile["model_id"]:
        raise BatchProcessError(
            f"Selected model profile requires {profile['model_id']}. Requested model {args.model!r} is not allowed."
        )
    return profile["model_id"]


def selected_model_profile(args: argparse.Namespace) -> dict[str, Any]:
    profile_name = normalize_model_profile_name(args.model_profile or "")
    if profile_name is None:
        raise BatchProcessError(f"Unknown model profile: {args.model_profile!r}")
    profile = MODEL_PROFILES[profile_name]
    return {"name": profile_name, **profile}


def selected_standard_cost_per_image(args: argparse.Namespace, profile: dict[str, Any]) -> float:
    if profile["name"] == "flash_image" and args.standard_estimated_cost_inr != 7.0:
        return args.standard_estimated_cost_inr
    return float(profile["estimated_standard_cost_inr_per_image"])


def selected_batch_cost_per_image(args: argparse.Namespace, profile: dict[str, Any]) -> float:
    return selected_standard_cost_per_image(args, profile) * args.batch_cost_multiplier


def selected_api_time(profile: dict[str, Any], api_mode: str) -> str:
    if api_mode == "standard":
        return "immediate, one image at a time"
    return "async, target within 24 hours"


def can_verify_pro_model_availability() -> bool:
    return False


def batch_support_verification(profile: dict[str, Any]) -> bool | None:
    if profile["name"] == "flash_image":
        return True
    return None


def is_supported_image(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS


def iter_product_folders(input_root: Path):
    for product_dir in sorted(path for path in input_root.iterdir() if path.is_dir()):
        yield product_dir


def iter_product_images(product_dir: Path):
    for path in sorted(product_dir.iterdir()):
        if is_supported_image(path):
            yield path


def load_processing_manifest(manifest_path: Path, reset: bool) -> dict[str, Any]:
    if reset:
        logging.warning("Resetting processing manifest state at %s", manifest_path.as_posix())
        return {}
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logging.warning("Failed to read processing manifest %s: %s", manifest_path.as_posix(), exc)
        return {}


def save_processing_manifest(manifest_path: Path, manifest: dict[str, Any]) -> None:
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def load_json_file(path: Path, reset: bool = False) -> dict[str, Any]:
    if reset:
        return {}
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logging.warning("Failed to read %s: %s", path.as_posix(), exc)
        return {}


def save_json_file(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
    except OSError as exc:
        logging.warning("Failed to write %s: %s", path.as_posix(), exc)


def reset_rembg_session() -> None:
    global _REMBG_SESSION, _REMBG_REMOVE
    _REMBG_SESSION = None
    _REMBG_REMOVE = None


def safe_clear_accelerator_cache() -> None:
    try:
        torch_module = import_module("torch")
    except ImportError:
        return
    try:
        cuda = getattr(torch_module, "cuda", None)
        if cuda is not None and callable(getattr(cuda, "is_available", None)) and cuda.is_available():
            empty_cache = getattr(cuda, "empty_cache", None)
            if callable(empty_cache):
                empty_cache()
    except Exception:
        return


def post_image_memory_cleanup(
    product_folder: str,
    image_label: str,
    reload_rembg_each_image: bool,
) -> None:
    if reload_rembg_each_image:
        reset_rembg_session()
    safe_clear_accelerator_cache()
    gc.collect()
    logging.info("memory cleanup done for %s/%s", product_folder, image_label)


def product_input_fingerprint(product_dir: Path) -> tuple[str, list[dict[str, Any]]]:
    files_payload: list[dict[str, Any]] = []
    for image_path in iter_product_images(product_dir):
        stat = image_path.stat()
        files_payload.append(
            {
                "name": image_path.name,
                "size": stat.st_size,
                "mtime_ns": stat.st_mtime_ns,
            }
        )
    serialized = json.dumps(files_payload, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return digest, files_payload


def expected_outputs_for_product(
    product_dir: Path,
    output_root: Path,
    generate_missing_top: bool,
    pause_top_processing: bool = False,
) -> list[str]:
    expected = []
    for image_path in iter_product_images(product_dir):
        role = detect_role(image_path.name)
        if pause_top_processing and role == "top":
            continue
        expected.append((output_root / product_dir.name / image_path.name).as_posix())
    has_top = any(detect_role(image_path.name) == "top" for image_path in iter_product_images(product_dir))
    if generate_missing_top and not pause_top_processing and not has_top:
        expected.append((output_root / product_dir.name / "top.jpg").as_posix())
    return expected


def should_generate_missing_top(
    product_images: list[Path],
    generate_missing_top: bool,
    only_image: str | None,
    only_output_role: str,
    force_generate_top: bool,
    pause_top_processing: bool,
) -> bool:
    if not generate_missing_top:
        return False
    if pause_top_processing:
        return False
    if only_output_role not in {"all", "top"}:
        return False
    if force_generate_top:
        return True
    has_top = any(detect_role(image_path.name) == "top" for image_path in product_images)
    if has_top:
        return False
    if only_image is None:
        return True
    return detect_role(only_image) == "top"


def output_path_for_input(output_root: Path, product_dir: Path, image_path: Path) -> Path:
    return output_root / product_dir.name / image_path.name


def compute_pending_reason(
    role_output_path: Path,
    fingerprint_changed: bool,
    previous_entry: dict[str, Any] | None,
    role: str,
) -> str:
    if fingerprint_changed:
        return "input_changed"
    if previous_entry is not None:
        output_status_per_role = previous_entry.get("output_status_per_role", {})
        previous_role_status = output_status_per_role.get(role)
        if previous_role_status == "failed" or role_output_path.as_posix() in previous_entry.get("failed_outputs", []):
            return "previous_failure"
        if previous_entry.get("status") == "partial":
            return "manifest_partial"
    return "missing_output"


def preflight_scan(
    args: argparse.Namespace,
    input_root: Path,
    output_root: Path,
    references_dir: Path,
    processing_manifest: dict[str, Any],
    pending_tasks_log_path: Path,
    profile: dict[str, Any],
) -> dict[str, Any]:
    product_folders = list(iter_product_folders(input_root))
    if args.only_product_folder:
        product_folders = [product_dir for product_dir in product_folders if product_dir.name == args.only_product_folder]

    pending_tasks: list[dict[str, Any]] = []
    skipped_folders: list[dict[str, Any]] = []
    product_summaries: list[dict[str, Any]] = []
    pending_front = 0
    pending_back = 0

    for product_dir in product_folders:
        product_images = list(iter_product_images(product_dir))
        fingerprint, input_files = product_input_fingerprint(product_dir)
        previous_entry = processing_manifest.get(product_dir.name, {}) if args.use_processing_manifest else {}
        previous_fingerprint = previous_entry.get("input_fingerprint")
        fingerprint_changed = previous_fingerprint not in {None, fingerprint}
        front_input = next((path for path in product_images if detect_role(path.name) == "front"), None)
        back_input = next((path for path in product_images if detect_role(path.name) == "back"), None)
        front_output_path = output_path_for_input(output_root, product_dir, front_input) if front_input else None
        back_output_path = output_path_for_input(output_root, product_dir, back_input) if back_input else None
        front_output_exists = bool(front_output_path and front_output_path.exists())
        back_output_exists = bool(back_output_path and back_output_path.exists())
        expected_outputs = expected_outputs_for_product(
            product_dir,
            output_root,
            generate_missing_top=args.generate_missing_top,
            pause_top_processing=args.pause_top_processing,
        )
        output_status_per_role = dict(previous_entry.get("output_status_per_role", {}))
        successful_outputs = set(previous_entry.get("successful_outputs", []))
        manifest_success = (
            previous_entry.get("status") == "success"
            and previous_entry.get("input_fingerprint") == fingerprint
            and front_output_path is not None
            and back_output_path is not None
            and front_output_path.as_posix() in successful_outputs
            and back_output_path.as_posix() in successful_outputs
            and front_output_exists
            and back_output_exists
        )

        if front_input is None or back_input is None:
            reason = "missing_front_input" if front_input is None else "missing_back_input"
            skipped_folders.append({"product_folder": product_dir.name, "reason": reason})
        elif manifest_success:
            logging.info("Skipping %s: front/back complete", product_dir.name)
            skipped_folders.append(
                {
                    "product_folder": product_dir.name,
                    "reason": "manifest_success_fingerprint_unchanged",
                }
            )
        elif (not args.use_processing_manifest) and front_output_exists and back_output_exists and not fingerprint_changed:
            logging.info("Skipping %s: front/back complete", product_dir.name)
            skipped_folders.append(
                {
                    "product_folder": product_dir.name,
                    "reason": "front_back_complete",
                }
            )
        else:
            for role, image_path, reference_name in (
                ("front", front_input, ROLE_REFERENCES["front"]),
                ("back", back_input, ROLE_REFERENCES["back"]),
            ):
                if image_path is None:
                    continue
                if args.only_output_role != "all" and role != args.only_output_role:
                    continue
                if args.only_image and image_path.name.casefold() != args.only_image.casefold():
                    continue
                output_path = output_path_for_input(output_root, product_dir, image_path)
                output_exists = output_path.exists()
                if output_exists and not args.force_reprocess and args.only_missing:
                    continue
                if output_exists and not args.force_reprocess and not fingerprint_changed:
                    continue
                pending_reason = compute_pending_reason(output_path, fingerprint_changed, previous_entry, role)
                pending_tasks.append(
                    {
                        "product_folder": product_dir.name,
                        "role": role,
                        "input_file_path": image_path.as_posix(),
                        "reference_file_path": (references_dir / reference_name).as_posix(),
                        "expected_output_path": output_path.as_posix(),
                        "reason_pending": pending_reason,
                    }
                )
                logging.info("%s: pending %s", product_dir.name, role)
                if role == "front":
                    pending_front += 1
                else:
                    pending_back += 1
                output_status_per_role[role] = "missing"

        if args.pause_top_processing:
            output_status_per_role["top"] = "paused_top_processing"

        product_summaries.append(
            {
                "product_folder": product_dir.name,
                "input_fingerprint": fingerprint,
                "input_files": input_files,
                "front_input_found": front_input is not None,
                "back_input_found": back_input is not None,
                "top_processing_paused": args.pause_top_processing,
                "expected_outputs": expected_outputs,
                "front_output_found": front_output_exists,
                "back_output_found": back_output_exists,
                "manifest_success_fingerprint_unchanged": manifest_success,
                "output_status_per_role": output_status_per_role,
            }
        )

        standard_cost_per_image = MODEL_PROFILES["flash_image"]["estimated_standard_cost_inr_per_image"]
        batch_cost_per_image = standard_cost_per_image * args.batch_cost_multiplier
    pending_log = {
        "scan_timestamp": utc_now(),
        "total_product_folders_scanned": len(product_folders),
        "top_processing_paused": args.pause_top_processing,
        "selected_completion_rule": "front_back_only",
        "pending_tasks": pending_tasks,
        "skipped_folders": skipped_folders,
        "estimated_standard_api_cost": round(len(pending_tasks) * standard_cost_per_image, 2),
        "estimated_batch_api_cost": round(len(pending_tasks) * batch_cost_per_image, 2),
        "estimated_standard_completion_time": f"~{len(pending_tasks) * int(profile.get('estimated_seconds_per_image', 90))} seconds",
        "estimated_batch_completion_time": "asynchronous, target within 24 hours",
        "pending_front_outputs": pending_front,
        "pending_back_outputs": pending_back,
        "total_pending_outputs": len(pending_tasks),
        "products": product_summaries,
    }
    save_json_file(pending_tasks_log_path, pending_log)
    return pending_log


def update_product_manifest_entry(
    manifest: dict[str, Any],
    product_dir: Path,
    fingerprint: str,
    input_files: list[dict[str, Any]],
    expected_outputs: list[str],
    records: list[JobRecord],
    selected_model_profile: str | None = None,
    selected_api_mode: str | None = None,
    pause_top_processing: bool = False,
) -> dict[str, Any]:
    successful_outputs = [output for output in expected_outputs if Path(output).exists()]
    failed_outputs = [
        record.output_file
        for record in records
        if record.status in {"failed", "failed_reference_mismatch", "failed_generated_top_layout"} and record.output_file
    ]
    skipped_outputs = [
        record.output_file
        for record in records
        if record.status in {"skipped", "skipped_only_missing", "skipped_cost_cap", "skipped_unknown_role", "skipped_reference_missing"} and record.output_file
    ]
    failure_reasons = {
        record.output_file: record.error
        for record in records
        if record.status in {"failed", "failed_reference_mismatch", "failed_generated_top_layout", "skipped_cost_cap"} and record.output_file and record.error
    }
    warnings = {
        record.output_file: record.reference_mismatch_warning
        for record in records
        if record.output_file and record.reference_mismatch_warning
    }
    missing_outputs = [output for output in expected_outputs if output not in successful_outputs and not Path(output).exists()]
    output_status_per_role = {
        "front": "missing",
        "back": "missing",
        "top": "paused_top_processing" if pause_top_processing else "missing",
    }
    for output in expected_outputs:
        output_name = Path(output).name
        role = detect_role(output_name)
        if role is None:
            continue
        if output in successful_outputs:
            output_status_per_role[role] = "success"
        elif output in failed_outputs:
            output_status_per_role[role] = "failed"
        elif output in skipped_outputs:
            output_status_per_role[role] = "skipped"
        else:
            output_status_per_role[role] = "missing"
    if len(successful_outputs) == len(expected_outputs):
        status = "success"
    elif successful_outputs:
        status = "partial"
    elif failed_outputs:
        status = "failed"
    else:
        status = "pending"
    entry = {
        "product_folder": product_dir.name,
        "input_fingerprint": fingerprint,
        "input_files": input_files,
        "front_input_found": any(detect_role(file_info["name"]) == "front" for file_info in input_files),
        "back_input_found": any(detect_role(file_info["name"]) == "back" for file_info in input_files),
        "top_processing_paused": pause_top_processing,
        "expected_outputs": expected_outputs,
        "successful_outputs": successful_outputs,
        "missing_outputs": missing_outputs,
        "failed_outputs": failed_outputs,
        "skipped_outputs": skipped_outputs,
        "output_status_per_role": output_status_per_role,
        "status": status,
        "last_processed_timestamp": utc_now(),
        "gemini_standard_calls_used": sum(record.gemini_calls_made for record in records),
        "batch_task_count_used": 0,
        "estimated_cost_inr": round(sum(record.estimated_cost_inr or 0.0 for record in records), 2),
        "failure_reasons": failure_reasons,
        "warnings": warnings,
        "selected_model_profile": selected_model_profile,
        "selected_api_mode": selected_api_mode,
    }
    entry["paused_top_processing"] = pause_top_processing
    manifest[product_dir.name] = entry
    return entry


def log_product_folder_summary(
    total_product_folders: int,
    total_output_tasks_discovered: int,
    processed_this_run: int,
    skipped_existing: int,
    skipped_successful_folders: int,
    skipped_cost_cap: int,
    processed_folders: int,
    successful_folders: int,
    partial_folders: int,
    failed_folders: int,
    total_images_generated: int,
    total_gemini_calls_used: int,
    estimated_total_spend: float,
    manifest_path: Path,
) -> None:
    logging.info("Product folder summary:")
    logging.info("total product folders found: %s", total_product_folders)
    logging.info("total output tasks discovered: %s", total_output_tasks_discovered)
    logging.info("processed this run: %s", processed_this_run)
    logging.info("skipped existing: %s", skipped_existing)
    logging.info("skipped already successful folders: %s", skipped_successful_folders)
    logging.info("skipped cost cap: %s", skipped_cost_cap)
    logging.info("processed folders: %s", processed_folders)
    logging.info("successful folders: %s", successful_folders)
    logging.info("partial folders: %s", partial_folders)
    logging.info("failed folders: %s", failed_folders)
    logging.info("total images generated: %s", total_images_generated)
    logging.info("total Gemini calls used: %s", total_gemini_calls_used)
    logging.info("estimated total spend: INR %.2f", estimated_total_spend)
    logging.info("manifest path: %s", manifest_path.as_posix())


def detect_role(filename: str) -> str | None:
    lowered = filename.lower()
    if "front" in lowered:
        return "front"
    if "back" in lowered:
        return "back"
    if any(keyword in lowered for keyword in TOP_KEYWORDS):
        return "top"
    return None


def build_reference_path(references_dir: Path, role: str) -> Path:
    return references_dir / ROLE_REFERENCES[role]


def mild_neutralize_cast(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    if not pixels:
        return rgb

    mean_r = sum(pixel[0] for pixel in pixels) / len(pixels)
    mean_g = sum(pixel[1] for pixel in pixels) / len(pixels)
    mean_b = sum(pixel[2] for pixel in pixels) / len(pixels)
    mean_all = (mean_r + mean_g + mean_b) / 3.0

    def safe_factor(channel_mean: float) -> float:
        if channel_mean <= 0:
            return 1.0
        raw = mean_all / channel_mean
        blended = 1.0 + (raw - 1.0) * 0.35
        return max(0.9, min(1.1, blended))

    r_factor = safe_factor(mean_r)
    g_factor = safe_factor(mean_g)
    b_factor = safe_factor(mean_b)

    if mean_r + mean_b > mean_g * 2.12:
        g_factor = min(1.12, g_factor + 0.03)
        r_factor = max(0.92, r_factor - 0.02)
        b_factor = max(0.92, b_factor - 0.02)

    corrected = Image.new("RGB", rgb.size)
    source = rgb.load()
    target = corrected.load()
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = source[x, y]
            target[x, y] = (
                max(0, min(255, int(round(r * r_factor)))),
                max(0, min(255, int(round(g * g_factor)))),
                max(0, min(255, int(round(b * b_factor)))),
            )
    return corrected


def fit_image_to_square(
    source_path: Path,
    destination_path: Path,
    size: int,
    bg_rgb: tuple[int, int, int],
    neutralize_cast: bool,
) -> None:
    prepared: Image.Image | None = None
    corrected: Image.Image | None = None
    canvas: Image.Image | None = None
    try:
        with Image.open(source_path) as image:
            prepared = image.convert("RGBA")
            if neutralize_cast:
                corrected = mild_neutralize_cast(prepared)
                prepared = corrected.convert("RGBA")
                if "A" in image.getbands():
                    prepared.putalpha(image.getchannel("A"))
            prepared.thumbnail((size, size), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (size, size), (*bg_rgb, 255))
            x = (size - prepared.width) // 2
            y = (size - prepared.height) // 2
            canvas.alpha_composite(prepared, (x, y))
            destination_path.parent.mkdir(parents=True, exist_ok=True)
            canvas.save(destination_path, format="PNG")
    except (UnidentifiedImageError, OSError) as exc:
        raise BatchProcessError(f"Failed to preprocess image {source_path}: {exc}") from exc
    finally:
        if corrected is not None:
            corrected.close()
        if prepared is not None:
            prepared.close()
        if canvas is not None:
            canvas.close()


def build_prompt(
    product_preservation_mode: bool,
    catalog_retouch_mode: bool,
    ghost_catalog_mode: bool,
    ghost_prompt_strength: str,
    retry_feedback: bool = False,
) -> str:
    base_prompt = EDIT_PROMPT_TEMPLATE
    if not product_preservation_mode:
        base_prompt = EDIT_PROMPT_TEMPLATE.replace(
        "Product preservation mode:\n\n* Treat this as a preservation-first cleanup task, not a creative generation task.\n* If uncertain, keep the product exactly as shown in the INPUT IMAGE.",
        "",
        ).strip()
    if catalog_retouch_mode:
        base_prompt = f"{base_prompt.rstrip()}{CATALOG_RETOUCH_APPENDIX}"
    if ghost_catalog_mode:
        base_prompt = f"{base_prompt.rstrip()}{GHOST_CATALOG_APPENDIX}{GHOST_PROMPT_STRENGTH_APPENDIX[ghost_prompt_strength]}"
    if retry_feedback:
        base_prompt = f"{base_prompt.rstrip()}{GHOST_RETRY_APPENDIX}"
    return base_prompt


def backoff_schedule(retries: int) -> list[int]:
    schedule: list[int] = []
    for index in range(retries):
        if index < len(DEFAULT_BACKOFF_SECONDS):
            schedule.append(DEFAULT_BACKOFF_SECONDS[index])
        else:
            schedule.append(DEFAULT_BACKOFF_SECONDS[-1] * (2 ** (index - len(DEFAULT_BACKOFF_SECONDS) + 1)))
    return schedule


def api_error_message(exc: Exception) -> str:
    message = getattr(exc, "message", None)
    if isinstance(message, str) and message.strip():
        return message.strip()
    return str(exc).strip()


def api_error_code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)
    if isinstance(code, int):
        return code
    if isinstance(code, str) and code.isdigit():
        return int(code)
    return None


def installed_package_version(package_name: str) -> str | None:
    try:
        return version(package_name)
    except PackageNotFoundError:
        return None


def safe_close_image(image: Any) -> None:
    if image is not None and hasattr(image, "close"):
        image.close()


def ensure_pil_image(image_obj: Any, context: str) -> Image.Image:
    if isinstance(image_obj, Image.Image):
        return image_obj

    candidates = [
        getattr(image_obj, "image_bytes", None),
        getattr(image_obj, "data", None),
    ]
    inline_data = getattr(image_obj, "inline_data", None)
    if inline_data is not None:
        candidates.append(getattr(inline_data, "data", None))
        candidates.append(getattr(inline_data, "image_bytes", None))

    for candidate in candidates:
        if isinstance(candidate, memoryview):
            candidate = candidate.tobytes()
        if isinstance(candidate, bytearray):
            candidate = bytes(candidate)
        if isinstance(candidate, bytes) and candidate:
            try:
                with Image.open(BytesIO(candidate)) as decoded:
                    return decoded.convert("RGBA")
            except Exception as exc:
                raise BatchProcessError(f"Failed to decode {context} into a PIL image: {exc}") from exc

    raise BatchProcessError(f"{context} is not a PIL image and did not expose decodable image bytes.")


def save_debug_image(image: Any, destination: Path) -> None:
    if isinstance(image, Path):
        with Image.open(image) as source_image:
            destination.parent.mkdir(parents=True, exist_ok=True)
            source_image.save(destination, format="PNG")
        return

    pil_image = ensure_pil_image(image, f"debug image for {destination.name}")
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        pil_image.save(destination, format="PNG")
    finally:
        if pil_image is not image:
            safe_close_image(pil_image)


def save_debug_image_safe(image: Any, destination: Path) -> None:
    try:
        save_debug_image(image, destination)
    except Exception as exc:
        logging.warning("Debug save failed for %s: %s", destination.as_posix(), exc)


def debug_directory(debug_root: Path, relative_path: Path) -> Path:
    return debug_root / relative_path.parent / relative_path.stem


def attempt_debug_directory(debug_root: Path, relative_path: Path, attempt_index: int) -> Path:
    return debug_directory(debug_root, relative_path) / f"attempt-{attempt_index}"


def draw_bbox_debug(image: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    debug = image.convert("RGBA").copy()
    draw = ImageDraw.Draw(debug)
    draw.rectangle(bbox, outline=(255, 0, 0, 255), width=4)
    return debug


def bbox_touches_all_edges(bbox: tuple[int, int, int, int], size: tuple[int, int]) -> bool:
    min_x, min_y, max_x, max_y = bbox
    width, height = size
    edge_margin_x = max(2, int(width * 0.01))
    edge_margin_y = max(2, int(height * 0.01))
    return (
        min_x <= edge_margin_x
        and min_y <= edge_margin_y
        and max_x >= width - edge_margin_x
        and max_y >= height - edge_margin_y
    )


def validate_bbox(
    bbox: tuple[int, int, int, int],
    image_size: tuple[int, int],
) -> str | None:
    min_x, min_y, max_x, max_y = bbox
    width, height = image_size
    bbox_width = max_x - min_x
    bbox_height = max_y - min_y
    bbox_area_ratio = (bbox_width * bbox_height) / max(1, width * height)

    if bbox == (0, 0, width, height):
        return "Bad bbox detected. Final output skipped."
    if bbox_touches_all_edges(bbox, image_size):
        return "Bad bbox detected. Final output skipped."
    if bbox_width < int(width * 0.2) or bbox_height < int(height * 0.2):
        return "Bad bbox detected. Final output skipped."
    if bbox_area_ratio > 0.92 or bbox_area_ratio < 0.08:
        return "Bad bbox detected. Final output skipped."
    return None


def mask_bbox(mask: Image.Image) -> tuple[int, int, int, int] | None:
    bbox = mask.getbbox()
    if bbox is None:
        return None
    return bbox


def measure_mask_widths(mask: Image.Image, sample_points: tuple[float, ...]) -> list[float]:
    binary = mask.convert("L")
    width, height = binary.size
    pixels = binary.load()
    widths: list[float] = []
    for ratio in sample_points:
        y = min(height - 1, max(0, int(round((height - 1) * ratio))))
        xs = [x for x in range(width) if pixels[x, y] > 0]
        if not xs:
            widths.append(0.0)
        else:
            widths.append((max(xs) - min(xs) + 1) / max(1, width))
    return widths


def generate_analysis_mask(
    image: Image.Image,
    bg_rgb: tuple[int, int, int],
    use_rembg: bool,
) -> tuple[Image.Image, bool]:
    if use_rembg:
        mask, rembg_succeeded = build_mask_with_rembg(image)
        if mask is not None:
            return mask, rembg_succeeded
    return build_mask_from_background_difference(image, bg_rgb), False


def reference_mismatch_report(
    output_mask: Image.Image,
    reference_mask: Image.Image,
    output_bbox: tuple[int, int, int, int],
    reference_bbox: tuple[int, int, int, int],
    output_scale: float,
) -> dict[str, Any]:
    sample_points = (0.14, 0.24, 0.36, 0.52, 0.72)
    output_widths = measure_mask_widths(output_mask, sample_points)
    reference_widths = measure_mask_widths(reference_mask, sample_points)

    output_w = max(1, output_bbox[2] - output_bbox[0])
    output_h = max(1, output_bbox[3] - output_bbox[1])
    reference_w = max(1, reference_bbox[2] - reference_bbox[0])
    reference_h = max(1, reference_bbox[3] - reference_bbox[1])
    output_aspect = output_w / output_h
    reference_aspect = reference_w / reference_h
    aspect_delta = abs(output_aspect - reference_aspect)
    width_delta = sum(abs(a - b) for a, b in zip(output_widths, reference_widths)) / max(1, len(sample_points))
    collar_position_delta = abs((output_bbox[1] / output_mask.height) - (reference_bbox[1] / reference_mask.height))
    scale_delta = abs(output_scale - max(reference_w / reference_mask.width, reference_h / reference_mask.height))

    mismatch_score = (
        aspect_delta * 2.5
        + width_delta * 3.5
        + collar_position_delta * 2.0
        + scale_delta * 1.5
    )
    return {
        "bbox": list(output_bbox),
        "reference_bbox": list(reference_bbox),
        "bbox_aspect_ratio": round(output_aspect, 4),
        "reference_aspect_ratio": round(reference_aspect, 4),
        "output_width_profile": [round(value, 4) for value in output_widths],
        "reference_width_profile": [round(value, 4) for value in reference_widths],
        "collar_position_delta": round(collar_position_delta, 4),
        "aspect_delta": round(aspect_delta, 4),
        "width_profile_delta": round(width_delta, 4),
        "scale_delta": round(scale_delta, 4),
        "reference_mismatch_score": round(mismatch_score, 4),
    }


def save_quality_report(report_path: Path, payload: dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def update_results_quality_report(output_root: Path, product_folder: str, payload: dict[str, Any]) -> None:
    report_path = output_root / product_folder / "quality_report.json"
    existing: dict[str, Any]
    try:
        existing = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    except (OSError, json.JSONDecodeError):
        existing = {}
    reports = existing.get("reports", [])
    reports = [report for report in reports if report.get("filename") != payload.get("filename")]
    reports.append(payload)
    existing["reports"] = reports
    save_quality_report(report_path, existing)


def image_non_background_ratio(image: Image.Image, bg_rgb: tuple[int, int, int]) -> float:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    active = 0
    total = max(1, rgb.width * rgb.height)
    for y in range(rgb.height):
        for x in range(rgb.width):
            r, g, b = pixels[x, y]
            if max(abs(r - bg_rgb[0]), abs(g - bg_rgb[1]), abs(b - bg_rgb[2])) >= 12:
                active += 1
    return active / total


def validate_final_output(
    image: Image.Image,
    bbox: tuple[int, int, int, int],
    bbox_image_size: tuple[int, int],
    final_scale: float,
    bg_rgb: tuple[int, int, int],
    fail_on_bad_bbox: bool,
) -> str | None:
    bbox_error = validate_bbox(bbox, bbox_image_size)
    if bbox_error and fail_on_bad_bbox:
        return bbox_error
    min_x, min_y, max_x, max_y = bbox
    bbox_center_x = (min_x + max_x) / 2.0
    bbox_center_y = (min_y + max_y) / 2.0
    width, height = bbox_image_size
    if abs((bbox_center_x / max(1, width)) - 0.5) > 0.2:
        return "Quality gate failed. Final output skipped."
    if abs((bbox_center_y / max(1, height)) - 0.5) > 0.24:
        return "Quality gate failed. Final output skipped."
    if not 0.45 <= final_scale <= 0.9:
        return "Quality gate failed. Final output skipped."
    non_background_ratio = image_non_background_ratio(image, bg_rgb)
    if non_background_ratio < 0.03 or non_background_ratio > 0.7:
        return "Quality gate failed. Final output skipped."
    return None


def reference_threshold_for_role(
    role: str,
    front_threshold: float,
    back_threshold: float,
    top_threshold: float,
) -> float:
    if role == "front":
        return front_threshold
    if role == "back":
        return back_threshold
    return top_threshold


def log_reference_match_decision(
    product_folder: str,
    image_filename: str,
    role: str,
    reference_file: str,
    mismatch_report: dict[str, Any],
    threshold: float,
    mode: str,
    accepted: bool,
    reason: str | None,
) -> None:
    logging.info(
        "[product=%s image=%s role=%s] reference-match reference=%s output_bbox=%s reference_bbox=%s output_aspect=%s reference_aspect=%s mismatch_score=%s threshold=%s mode=%s accepted=%s reason=%s",
        product_folder,
        image_filename,
        role,
        reference_file,
        mismatch_report["bbox"],
        mismatch_report["reference_bbox"],
        mismatch_report["bbox_aspect_ratio"],
        mismatch_report["reference_aspect_ratio"],
        mismatch_report["reference_mismatch_score"],
        threshold,
        mode,
        accepted,
        reason,
    )


def assess_reference_match(
    mismatch_report: dict[str, Any],
    reject_if_reference_mismatch: bool,
    role: str,
    mode: str,
    threshold: float,
    is_generated_top: bool,
) -> tuple[str | None, str | None]:
    if not reject_if_reference_mismatch or mode == "warn-only":
        return None, (
            "reference_mismatch_warning"
            if mismatch_report["reference_mismatch_score"] > threshold
            else None
        )

    score = mismatch_report["reference_mismatch_score"]
    extreme_multiplier = 1.35 if is_generated_top or role == "top" else 1.15
    moderate_multiplier = 0.85 if is_generated_top or role == "top" else 0.75
    moderate_reason = "reference_mismatch_warning" if score > threshold * moderate_multiplier else None

    if mode == "strict":
        if (
            score > threshold
            or mismatch_report["aspect_delta"] > (0.28 if role == "top" else 0.22)
            or mismatch_report["width_profile_delta"] > (0.24 if role == "top" else 0.18)
        ):
            return "failed_reference_mismatch", None
        return None, moderate_reason

    if (
        score > threshold * extreme_multiplier
        or mismatch_report["aspect_delta"] > (0.38 if role == "top" else 0.28)
        or mismatch_report["width_profile_delta"] > (0.34 if role == "top" else 0.24)
        or (not is_generated_top and mismatch_report["collar_position_delta"] > 0.18)
    ):
        return "failed_reference_mismatch", None
    return None, moderate_reason


def validate_generated_top_layout(
    output_bbox: tuple[int, int, int, int],
    reference_bbox: tuple[int, int, int, int],
    image_size: tuple[int, int],
    reference_image_size: tuple[int, int],
) -> tuple[str | None, dict[str, Any]]:
    width, height = image_size
    ref_width, ref_height = reference_image_size
    bbox_height_ratio = (output_bbox[3] - output_bbox[1]) / max(1, height)
    bbox_bottom_ratio = output_bbox[3] / max(1, height)
    bbox_top_ratio = output_bbox[1] / max(1, height)
    ref_bbox_height_ratio = (reference_bbox[3] - reference_bbox[1]) / max(1, ref_height)
    ref_bbox_bottom_ratio = reference_bbox[3] / max(1, ref_height)
    full_garment_detected = bbox_height_ratio > max(0.78, ref_bbox_height_ratio + 0.22)
    hem_visible = bbox_bottom_ratio > max(0.88, ref_bbox_bottom_ratio + 0.14)
    neckline_crop_passed = bbox_top_ratio <= min(0.25, max(0.12, (reference_bbox[1] / max(1, ref_height)) + 0.08))
    front_layout_like = bbox_bottom_ratio > 0.9 and bbox_height_ratio > 0.7
    flags = {
        "full_garment_detected": full_garment_detected,
        "hem_visible": hem_visible,
        "neckline_crop_passed": neckline_crop_passed,
        "front_layout_like": front_layout_like,
        "bbox_height_ratio": round(bbox_height_ratio, 4),
        "reference_bbox_height_ratio": round(ref_bbox_height_ratio, 4),
        "bbox_bottom_ratio": round(bbox_bottom_ratio, 4),
        "reference_bbox_bottom_ratio": round(ref_bbox_bottom_ratio, 4),
    }
    if full_garment_detected or hem_visible or front_layout_like or not neckline_crop_passed:
        return "failed_generated_top_layout", flags
    return None, flags


def is_billing_cap_error(message: str) -> bool:
    lowered = message.lower()
    return any(marker in lowered for marker in BILLING_MARKERS)


def is_retryable_error(exc: Exception) -> bool:
    code = api_error_code(exc)
    if code in RETRY_CODES:
        return True
    message = api_error_message(exc).lower()
    return "resource_exhausted" in message or "rate limit" in message


def extract_generated_image(response: Any) -> Image.Image:
    parts = getattr(response, "parts", None)
    if parts is None:
        candidates = getattr(response, "candidates", None) or []
        if candidates:
            content = getattr(candidates[0], "content", None)
            parts = getattr(content, "parts", None)

    if not parts:
        raise BatchProcessError("Gemini response did not contain any parts.")

    for part in parts:
        inline_data = getattr(part, "inline_data", None)
        if inline_data is not None or getattr(part, "image_bytes", None) is not None or getattr(part, "data", None) is not None:
            try:
                return ensure_pil_image(part, "Gemini image response")
            except Exception as exc:  # pragma: no cover - SDK-specific conversion path
                raise BatchProcessError(f"Failed to decode Gemini image response: {exc}") from exc

    raise BatchProcessError("Gemini response did not contain an edited image.")


def call_gemini_with_retries(
    client: genai.Client,
    model: str,
    prompt: str,
    reference_image_path: Path,
    input_image_path: Path,
    retries: int,
) -> tuple[Image.Image, int]:
    return call_gemini_with_retries_multi(
        client=client,
        model=model,
        prompt=prompt,
        reference_image_path=reference_image_path,
        input_image_paths=[input_image_path],
        retries=retries,
    )


def call_gemini_with_retries_multi(
    client: genai.Client,
    model: str,
    prompt: str,
    reference_image_path: Path,
    input_image_paths: list[Path],
    retries: int,
) -> tuple[Image.Image, int]:
    schedule = backoff_schedule(retries)
    attempt = 0
    api_calls_made = 0

    while True:
        try:
            api_calls_made += 1
            with Image.open(reference_image_path) as reference_image:
                opened_inputs = [Image.open(path) for path in input_image_paths]
                try:
                    response = client.models.generate_content(
                        model=model,
                        contents=[prompt, reference_image, *opened_inputs],
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                            candidate_count=1,
                            temperature=0,
                            seed=0,
                        ),
                    )
                finally:
                    for opened_input in opened_inputs:
                        opened_input.close()
            return extract_generated_image(response), api_calls_made
        except errors.APIError as exc:
            message = api_error_message(exc)
            if is_billing_cap_error(message):
                raise BillingCapError(
                    "Gemini billing/spend cap exceeded. Fix AI Studio billing/spend cap and rerun."
                ) from exc

            if attempt >= retries or not is_retryable_error(exc):
                raise BatchProcessError(f"Gemini API error: {message}") from exc

            wait_seconds = schedule[attempt]
            logging.warning(
                "Gemini API retryable error (attempt %s/%s): %s. Waiting %ss.",
                attempt + 1,
                retries + 1,
                message,
                wait_seconds,
            )
            time.sleep(wait_seconds)
            attempt += 1
        except Exception as exc:
            raise BatchProcessError(f"Unexpected Gemini error: {api_error_message(exc)}") from exc


def configure_rembg_execution(use_gpu_if_available: bool) -> None:
    global _REMBG_PROVIDERS, _REMBG_DEVICE_LABEL, _ONNXRUNTIME_VERSION, _ONNXRUNTIME_AVAILABLE_PROVIDERS
    _REMBG_PROVIDERS = None
    _REMBG_DEVICE_LABEL = "CPU"
    _ONNXRUNTIME_VERSION = installed_package_version("onnxruntime") or installed_package_version("onnxruntime-gpu") or "not installed"
    onnxruntime_cpu_version = installed_package_version("onnxruntime")
    onnxruntime_gpu_version = installed_package_version("onnxruntime-gpu")
    _ONNXRUNTIME_AVAILABLE_PROVIDERS = []

    logging.info("Python version: %s", sys.version.replace("\n", " "))
    logging.info("onnxruntime version: %s", _ONNXRUNTIME_VERSION)
    logging.info(
        "onnxruntime package state: onnxruntime=%s, onnxruntime-gpu=%s",
        onnxruntime_cpu_version or "not installed",
        onnxruntime_gpu_version or "not installed",
    )

    if onnxruntime_cpu_version and onnxruntime_gpu_version:
        logging.warning("Both onnxruntime and onnxruntime-gpu are installed. Only one should be installed in this environment.")
        logging.warning("Recommended GPU fix commands:")
        logging.warning("./.venv/bin/pip uninstall -y onnxruntime onnxruntime-gpu")
        logging.warning("./.venv/bin/pip install --upgrade pip")
        logging.warning("./.venv/bin/pip install onnxruntime-gpu rembg")

    if not use_gpu_if_available:
        logging.info("available ONNX providers: []")
        logging.info("CUDAExecutionProvider available: no")
        logging.info("rembg execution: CPU (GPU disabled by option)")
        logging.info("runtime execution mode: CPU")
        return

    try:
        ort = import_module("onnxruntime")
    except ImportError:
        logging.info("available ONNX providers: []")
        logging.info("CUDAExecutionProvider available: no")
        logging.info("rembg execution: CPU (onnxruntime not available)")
        logging.info("runtime execution mode: CPU")
        logging.warning(
            "GPU detected by system may exist, but ONNX Runtime CUDAExecutionProvider is not available in this environment. Falling back to CPU."
        )
        logging.warning("Recommended GPU fix commands:")
        logging.warning("./.venv/bin/pip uninstall -y onnxruntime onnxruntime-gpu")
        logging.warning("./.venv/bin/pip install --upgrade pip")
        logging.warning("./.venv/bin/pip install onnxruntime-gpu rembg")
        return

    try:
        available_providers = ort.get_available_providers()
    except Exception as exc:
        logging.info("available ONNX providers: unavailable (%s)", exc)
        logging.info("CUDAExecutionProvider available: no")
        logging.info("rembg execution: CPU (provider check failed: %s)", exc)
        logging.info("runtime execution mode: CPU")
        logging.warning(
            "GPU detected by system may exist, but ONNX Runtime CUDAExecutionProvider is not available in this environment. Falling back to CPU."
        )
        return

    _ONNXRUNTIME_AVAILABLE_PROVIDERS = list(available_providers)
    logging.info("available ONNX providers: %s", available_providers)

    if "CUDAExecutionProvider" in available_providers:
        _REMBG_PROVIDERS = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        _REMBG_DEVICE_LABEL = "GPU"
        logging.info("CUDAExecutionProvider available: yes")
    else:
        logging.info("CUDAExecutionProvider available: no")
        logging.info("rembg execution: CPU (CUDAExecutionProvider not available)")
        logging.info("runtime execution mode: CPU")
        logging.warning(
            "GPU detected by system may exist, but ONNX Runtime CUDAExecutionProvider is not available in this environment. Falling back to CPU."
        )
        logging.warning("Recommended GPU fix commands:")
        logging.warning("./.venv/bin/pip uninstall -y onnxruntime onnxruntime-gpu")
        logging.warning("./.venv/bin/pip install --upgrade pip")
        logging.warning("./.venv/bin/pip install onnxruntime-gpu rembg")
        logging.warning("# If you want CPU-only instead:")
        logging.warning("./.venv/bin/pip uninstall -y onnxruntime onnxruntime-gpu")
        logging.warning("./.venv/bin/pip install onnxruntime rembg")
        return

    logging.info("rembg execution: GPU")
    logging.info("runtime execution mode: GPU")


def get_rembg_session() -> object | None:
    global _REMBG_SESSION, _REMBG_REMOVE
    if _REMBG_SESSION is not None:
        return _REMBG_SESSION
    try:
        rembg_module = import_module("rembg")
    except ImportError:
        return None
    _REMBG_REMOVE = getattr(rembg_module, "remove", None)
    new_session = getattr(rembg_module, "new_session", None)
    if new_session is None:
        return None
    try:
        if _REMBG_PROVIDERS is not None:
            _REMBG_SESSION = new_session(providers=_REMBG_PROVIDERS)
        else:
            _REMBG_SESSION = new_session()
    except Exception as exc:
        logging.warning("rembg session fallback to CPU: %s", exc)
        _REMBG_SESSION = new_session()
    return _REMBG_SESSION


def extract_alpha_image(result: Any) -> Image.Image:
    if isinstance(result, bytes):
        with Image.open(BytesIO(result)) as image:
            return image.convert("RGBA")
    return ensure_pil_image(result, "rembg output")


def build_mask_with_rembg(image: Image.Image) -> tuple[Image.Image | None, bool]:
    session = get_rembg_session()
    if session is None or _REMBG_REMOVE is None:
        return None, False
    rgba: Image.Image | None = None
    try:
        result = _REMBG_REMOVE(image.convert("RGBA"), session=session)
        rgba = extract_alpha_image(result)
        alpha = rgba.getchannel("A")
        mask = alpha.point(lambda value: 255 if value >= 20 else 0, mode="L")
        return mask, True
    except Exception:
        return None, False
    finally:
        if rgba is not None:
            rgba.close()


def build_mask_from_background_difference(
    image: Image.Image,
    bg_rgb: tuple[int, int, int],
) -> Image.Image:
    rgb = image.convert("RGB")
    bg = Image.new("RGB", rgb.size, bg_rgb)
    diff = ImageChops.difference(rgb, bg)
    edge_map = rgb.convert("L").filter(ImageFilter.FIND_EDGES)
    mask = Image.new("L", rgb.size, 0)
    diff_pixels = diff.load()
    edge_pixels = edge_map.load()
    mask_pixels = mask.load()
    center_x = rgb.width / 2.0
    center_y = rgb.height / 2.0
    max_distance = max(1.0, (center_x**2 + center_y**2) ** 0.5)
    for y in range(diff.height):
        for x in range(diff.width):
            r, g, b = diff_pixels[x, y]
            magnitude = max(r, g, b)
            edge_strength = edge_pixels[x, y]
            distance = ((x - center_x) ** 2 + (y - center_y) ** 2) ** 0.5
            centered = 1.0 - min(1.0, distance / max_distance)
            if magnitude >= 12 or (centered >= 0.28 and edge_strength >= 14):
                mask_pixels[x, y] = 255
    mask = mask.filter(ImageFilter.MedianFilter(size=3))
    return mask


def connected_components(mask: Image.Image) -> list[dict[str, Any]]:
    binary = mask.convert("L")
    width, height = binary.size
    pixels = binary.load()
    visited = [[False] * width for _ in range(height)]
    components: list[dict[str, Any]] = []

    for y in range(height):
        for x in range(width):
            if visited[y][x] or pixels[x, y] == 0:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[y][x] = True
            area = 0
            min_x = max_x = x
            min_y = max_y = y
            coords: list[tuple[int, int]] = []

            while queue:
                cx, cy = queue.popleft()
                coords.append((cx, cy))
                area += 1
                min_x = min(min_x, cx)
                max_x = max(max_x, cx)
                min_y = min(min_y, cy)
                max_y = max(max_y, cy)

                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < width and 0 <= ny < height and not visited[ny][nx] and pixels[nx, ny] != 0:
                        visited[ny][nx] = True
                        queue.append((nx, ny))

            components.append(
                {
                    "area": area,
                    "bbox": (min_x, min_y, max_x + 1, max_y + 1),
                    "coords": coords,
                }
            )
    return components


def filter_components(
    components: list[dict[str, Any]],
    image_size: tuple[int, int],
    skip_artifact_cleanup: bool,
) -> tuple[list[dict[str, Any]], bool]:
    if not components:
        return [], False
    if skip_artifact_cleanup:
        return components, False

    width, height = image_size
    primary = max(components, key=lambda component: component["area"])
    kept = [primary]
    artifacts_removed = len(components) > 1

    for component in components:
        if component is primary:
            continue
        min_x, min_y, max_x, max_y = component["bbox"]
        comp_width = max_x - min_x
        comp_height = max_y - min_y
        primary_min_x, primary_min_y, primary_max_x, primary_max_y = primary["bbox"]
        gap_below = min_y - primary_max_y
        area_ratio = component["area"] / max(1, primary["area"])
        horizontal_ratio = comp_width / max(1, comp_height)

        is_far_below = gap_below > int(height * 0.02)
        is_flat_bar = horizontal_ratio >= 2.4 and comp_height <= int(height * 0.12)
        is_small = area_ratio < 0.12
        overlaps_horizontally = not (max_x < primary_min_x or min_x > primary_max_x)

        if not ((is_far_below and is_flat_bar) or is_small or (is_far_below and overlaps_horizontally)):
            kept.append(component)

    artifacts_removed = artifacts_removed and len(kept) < len(components)
    return kept, artifacts_removed


def render_mask_from_components(size: tuple[int, int], components: list[dict[str, Any]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    pixels = mask.load()
    for component in components:
        for x, y in component["coords"]:
            pixels[x, y] = 255
    return mask


def padded_bbox(
    bbox: tuple[int, int, int, int],
    size: tuple[int, int],
    safe_padding: float,
) -> tuple[int, int, int, int]:
    min_x, min_y, max_x, max_y = bbox
    width = max_x - min_x
    height = max_y - min_y
    pad_x = max(2, int(round(width * safe_padding)))
    pad_y = max(2, int(round(height * safe_padding)))
    full_width, full_height = size
    return (
        max(0, min_x - pad_x),
        max(0, min_y - pad_y),
        min(full_width, max_x + pad_x),
        min(full_height, max_y + pad_y),
    )


def crop_with_mask(image: Image.Image, mask: Image.Image, bbox: tuple[int, int, int, int]) -> Image.Image:
    cropped_image = image.convert("RGBA").crop(bbox)
    cropped_mask = mask.crop(bbox)
    isolated = Image.new("RGBA", cropped_image.size, (0, 0, 0, 0))
    isolated.paste(cropped_image, (0, 0), cropped_mask)
    return isolated


def apply_final_cast_fix_if_needed(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    pixels = list(rgb.getdata())
    if not pixels:
        return image

    mean_r = sum(pixel[0] for pixel in pixels) / len(pixels)
    mean_g = sum(pixel[1] for pixel in pixels) / len(pixels)
    mean_b = sum(pixel[2] for pixel in pixels) / len(pixels)

    if mean_r + mean_b <= mean_g * 2.08:
        return image

    corrected = Image.new("RGBA", image.size)
    source = image.convert("RGBA").load()
    target = corrected.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = source[x, y]
            target[x, y] = (
                max(0, min(255, int(round(r * 0.97)))),
                max(0, min(255, int(round(g * 1.04)))),
                max(0, min(255, int(round(b * 0.97)))),
                a,
            )
    return corrected


def compose_shopify_canvas(
    isolated_product: Image.Image,
    role: str,
    final_size: int,
    bg_rgb: tuple[int, int, int],
    product_scale: float,
    top_product_scale: float,
    vertical_center: float,
) -> tuple[Image.Image, float]:
    target_scale = top_product_scale if role == "top" else product_scale
    target_side = max(1, int(round(final_size * target_scale)))

    product = isolated_product.copy()
    w, h = product.size
    scale_factor = target_side / max(1, max(w, h))
    new_w = max(1, int(round(w * scale_factor)))
    new_h = max(1, int(round(h * scale_factor)))
    resized_product = product.resize((new_w, new_h), Image.Resampling.LANCZOS)
    product.close()
    product = resized_product

    canvas = Image.new("RGBA", (final_size, final_size), (*bg_rgb, 255))
    x = (final_size - product.width) // 2
    center_y = int(round(final_size * vertical_center))
    y = center_y - product.height // 2
    y = max(0, min(final_size - product.height, y))
    canvas.alpha_composite(product, (x, y))
    scale_used = max(product.width / final_size, product.height / final_size)
    return canvas, scale_used


def postprocess_gemini_output(
    edited_image: Image.Image,
    role: str,
    final_size: int,
    bg_rgb: tuple[int, int, int],
    product_scale: float,
    top_product_scale: float,
    vertical_center: float,
    safe_padding: float,
    postprocess_segment: bool,
    use_rembg: bool,
    skip_artifact_cleanup: bool,
) -> CleanupResult:
    pil_edited_image = ensure_pil_image(edited_image, "Gemini edited image")
    base_image = pil_edited_image.convert("RGBA")
    mask: Image.Image | None = None
    clean_mask: Image.Image | None = None
    isolated: Image.Image | None = None
    debug_pre_cleanup: Image.Image | None = None
    debug_mask: Image.Image | None = None
    debug_bbox: Image.Image | None = None

    try:
        rembg_succeeded = False
        if postprocess_segment and use_rembg:
            mask, rembg_succeeded = build_mask_with_rembg(base_image)

        if mask is None:
            mask = build_mask_from_background_difference(base_image, bg_rgb)

        debug_pre_cleanup = base_image.copy()
        debug_mask = mask.copy()

        components = connected_components(mask)
        if not components:
            raise BatchProcessError("Could not detect a garment region in Gemini output.")

        kept_components, artifacts_removed = filter_components(
            components,
            base_image.size,
            skip_artifact_cleanup=skip_artifact_cleanup,
        )
        clean_mask = render_mask_from_components(base_image.size, kept_components)
        bbox = clean_mask.getbbox()
        if bbox is None:
            raise BatchProcessError("Garment mask became empty after artifact cleanup.")

        expanded_bbox = padded_bbox(bbox, base_image.size, safe_padding)
        debug_bbox = draw_bbox_debug(base_image, expanded_bbox)
        isolated = crop_with_mask(base_image, clean_mask, expanded_bbox)
        corrected_isolated = apply_final_cast_fix_if_needed(isolated)
        if corrected_isolated is not isolated:
            isolated.close()
            isolated = corrected_isolated
        final_canvas, scale_used = compose_shopify_canvas(
            isolated_product=isolated,
            role=role,
            final_size=final_size,
            bg_rgb=bg_rgb,
            product_scale=product_scale,
            top_product_scale=top_product_scale,
            vertical_center=vertical_center,
        )
        return CleanupResult(
            image=final_canvas,
            bbox=expanded_bbox,
            rembg_succeeded=rembg_succeeded,
            artifacts_removed=artifacts_removed,
            final_scale=scale_used,
            debug_pre_cleanup=debug_pre_cleanup,
            debug_mask=debug_mask,
            debug_bbox=debug_bbox,
            raw_bbox=bbox,
        )
    finally:
        safe_close_image(isolated)
        safe_close_image(clean_mask)
        safe_close_image(mask)
        safe_close_image(base_image)
        if pil_edited_image is not edited_image:
            safe_close_image(pil_edited_image)


def save_final_image(
    source_image: Image.Image,
    output_path: Path,
    quality: int,
) -> None:
    extension = output_path.suffix.lower()
    try:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        if extension in {".jpg", ".jpeg"}:
            source_image.convert("RGB").save(
                output_path,
                format="JPEG",
                quality=quality,
                optimize=True,
            )
        elif extension == ".webp":
            source_image.save(output_path, format="WEBP", quality=quality, method=6)
        elif extension == ".png":
            source_image.save(output_path, format="PNG", optimize=True)
        else:
            raise BatchProcessError(f"Unsupported output extension: {extension}")
    except OSError as exc:
        raise BatchProcessError(f"Failed to write final image {output_path}: {exc}") from exc


def write_process_log(log_path: Path, records: list[JobRecord]) -> None:
    payload = [record.as_dict() for record in records]
    log_path.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def log_batch_summary(records: list[JobRecord], total_images_discovered: int) -> None:
    successful = sum(1 for record in records if record.status == "success")
    failed = sum(1 for record in records if record.status in {"failed", "failed_reference_mismatch", "failed_generated_top_layout"})
    skipped_existing = sum(1 for record in records if record.status == "skipped")
    skipped_only_missing = sum(1 for record in records if record.status == "skipped_only_missing")
    skipped_cost_cap = sum(1 for record in records if record.status == "skipped_cost_cap")
    spend_records = [
        record for record in records if record.status not in {"skipped", "skipped_only_missing"}
    ]
    estimated_total_spend = sum(record.estimated_cost_inr or 0.0 for record in spend_records)
    estimated_average_spend = (
        estimated_total_spend / len(spend_records) if spend_records else 0.0
    )
    gemini_calls_made = sum(record.gemini_calls_made for record in records)
    retries_used = sum(record.retries_used for record in records)
    estimated_attempts = gemini_calls_made
    final_model_used = DEFAULT_MODEL
    logging.info("Batch summary:")
    logging.info("total images found: %s", total_images_discovered)
    logging.info("processed successfully: %s", successful)
    logging.info("skipped existing: %s", skipped_existing)
    logging.info("skipped only-missing: %s", skipped_only_missing)
    logging.info("failed: %s", failed)
    logging.info("skipped cost cap: %s", skipped_cost_cap)
    logging.info("Gemini calls made: %s", gemini_calls_made)
    logging.info("retries used: %s", retries_used)
    logging.info("final model used: %s", final_model_used)
    logging.info("Gemini calls this run: %s", gemini_calls_made)
    logging.info("Estimated image-generation attempts this run: %s", estimated_attempts)
    logging.info("estimated total spend: INR %.2f", estimated_total_spend)
    logging.info("estimated average spend per image: INR %.2f", estimated_average_spend)
    for record in records:
        if record.estimated_cost_inr is not None:
            logging.info("estimated spend per image: %s -> INR %.2f", record.input_file, record.estimated_cost_inr)
        if record.status in {"failed", "failed_reference_mismatch", "failed_generated_top_layout"}:
            logging.info("failure: %s -> %s", record.input_file, record.error or "unknown error")


def planned_cost_details(
    gemini_retry_count: int,
    estimated_gemini_call_cost_inr: float,
    max_cost_per_image_inr: float,
    disable_retries_if_cost_cap: bool,
) -> tuple[int, int, float, bool]:
    planned_calls = 1 + gemini_retry_count
    allowed_calls = planned_calls
    adjusted = False
    if estimated_gemini_call_cost_inr > 0:
        max_allowed_calls = int(max_cost_per_image_inr // estimated_gemini_call_cost_inr)
    else:
        max_allowed_calls = planned_calls
    if disable_retries_if_cost_cap and allowed_calls > max_allowed_calls:
        allowed_calls = max_allowed_calls
        adjusted = True
    estimated_total_cost = estimated_gemini_call_cost_inr * allowed_calls
    effective_retry_count = max(0, allowed_calls - 1)
    return allowed_calls, effective_retry_count, estimated_total_cost, adjusted


def print_preflight_summary(args: argparse.Namespace, pending_log: dict[str, Any]) -> None:
    logging.info("safe mode active: %s", "yes" if args.safe_mode else "no")
    logging.info("top processing paused: %s", "yes" if pending_log["top_processing_paused"] else "no")
    logging.info("model profiles available: %s", ", ".join(sorted(MODEL_PROFILES)))
    logging.info("API modes available: standard, batch")
    logging.info("Pending outputs:")
    logging.info("Product folders scanned: %s", pending_log["total_product_folders_scanned"])
    logging.info("Pending front outputs: %s", pending_log["pending_front_outputs"])
    logging.info("Pending back outputs: %s", pending_log["pending_back_outputs"])
    logging.info("Top processing paused: %s", "yes" if pending_log["top_processing_paused"] else "no")
    logging.info("Total pending outputs: %s", pending_log["total_pending_outputs"])
    logging.info("Estimated Standard API cost: INR %.2f", pending_log["estimated_standard_api_cost"])
    logging.info("Estimated Batch API cost: INR %.2f", pending_log["estimated_batch_api_cost"])
    logging.info("Estimated Standard API time: %s", pending_log["estimated_standard_completion_time"])
    logging.info("Estimated Batch API time: %s", pending_log["estimated_batch_completion_time"])


def print_selected_run_summary(
    pending_log: dict[str, Any],
    profile: dict[str, Any],
    api_mode: str,
    estimated_cost_per_image: float,
) -> None:
    total_pending = pending_log["total_pending_outputs"]
    logging.info("Selected model profile: %s", profile["name"])
    logging.info("Selected model ID: %s", profile["model_id"])
    logging.info("Selected API mode: %s", api_mode)
    logging.info("Top processing paused: %s", "yes" if pending_log["top_processing_paused"] else "no")
    logging.info("Pending front images: %s", pending_log["pending_front_outputs"])
    logging.info("Pending back images: %s", pending_log["pending_back_outputs"])
    logging.info("Total pending images: %s", total_pending)
    logging.info("Estimated cost per image: ₹%.2f", estimated_cost_per_image)
    logging.info("Estimated total cost: ₹%.2f", total_pending * estimated_cost_per_image)
    logging.info("Estimated time: %s", selected_api_time(profile, api_mode))


def confirm_processing_mode(
    args: argparse.Namespace,
    pending_log: dict[str, Any],
) -> tuple[str | None, str | None, bool]:
    if args.yes:
        print_preflight_summary(args, pending_log)
        return args.model_profile, args.api_mode, True
    if not args.interactive_config:
        print_preflight_summary(args, pending_log)
        return args.model_profile, args.api_mode, True

    print_preflight_summary(args, pending_log)
    print("Choose model/profile:")
    print("1. Gemini 3.1 Flash Image")
    print("   Profile: flash_image")
    print(f"   Model ID: {DEFAULT_MODEL}")
    print("   Estimated standard cost: ₹7/image")
    print("   Best for: bulk processing")
    print("")
    print("2. Gemini 3 Pro Image")
    print("   Profile: pro_image")
    print(f"   Model ID: {PRO_MODEL}")
    print("   Estimated standard cost: ₹14/image")
    print("   Best for: highest quality")
    print("")
    print("Press Enter for recommended: 1")
    raw_profile_choice = input("Enter choice [1/2/profile name]: ").strip()
    selected_profile = normalize_model_profile_name(raw_profile_choice) if raw_profile_choice else "flash_image"
    if selected_profile is None:
        print("Invalid model/profile. Exiting safely.")
        return None, None, False
    if selected_profile == "pro_image" and not can_verify_pro_model_availability():
        print("Warning: gemini-3-pro-image availability could not be verified in the current SDK/API.")
        retry_profile_choice = input("Choose another model/profile? [flash_image/pro_image]: ").strip()
        if retry_profile_choice:
            normalized_retry = normalize_model_profile_name(retry_profile_choice)
            if normalized_retry is None:
                print("Invalid model/profile. Exiting safely.")
                return None, None, False
            selected_profile = normalized_retry

    print("Choose processing mode:")
    print("1. Standard API")
    selected_profile_payload = {"name": selected_profile, **MODEL_PROFILES[selected_profile]}
    print(f"   Estimated cost: ₹{selected_standard_cost_per_image(args, selected_profile_payload):.2f}/image")
    print("   Estimated time: immediate, one image at a time")
    print("")
    print("2. Batch API")
    print(f"   Estimated cost: ₹{selected_batch_cost_per_image(args, selected_profile_payload):.2f}/image")
    print("   Estimated time: async, target within 24 hours")
    print("")
    print("Press Enter for recommended: 2")
    raw_mode_choice = input("Enter choice [1/2/standard/batch]: ").strip()
    selected_mode = normalize_api_mode(raw_mode_choice) if raw_mode_choice else "batch"
    if selected_mode not in {"standard", "batch"}:
        print("Invalid API mode. Exiting safely.")
        return None, None, False
    if selected_mode == "batch":
        batch_support = batch_support_verification(selected_profile_payload)
        if batch_support is None:
            proceed_batch = input("Batch support for this model could not be verified. Continue? [y/N] ").strip().lower()
            if proceed_batch not in {"y", "yes"}:
                return None, None, False
    estimated_cost_per_image = (
        selected_standard_cost_per_image(args, selected_profile_payload)
        if selected_mode == "standard"
        else selected_batch_cost_per_image(args, selected_profile_payload)
    )
    print("")
    print(f"Selected model: {selected_profile_payload['label']}")
    print(f"Selected model ID: {selected_profile_payload['model_id']}")
    print(f"Selected API mode: {selected_mode}")
    print(f"Pending front images: {pending_log['pending_front_outputs']}")
    print(f"Pending back images: {pending_log['pending_back_outputs']}")
    print(f"Total pending images: {pending_log['total_pending_outputs']}")
    print(f"Estimated cost per image: ₹{estimated_cost_per_image:.2f}")
    print(f"Estimated total cost: ₹{pending_log['total_pending_outputs'] * estimated_cost_per_image:.2f}")
    print(f"Estimated time: {selected_api_time(selected_profile_payload, selected_mode)}")
    proceed = input("Proceed with automatically selected pending images? [y/N]: ").strip().lower()
    return selected_profile, selected_mode, proceed in {"y", "yes"}


def pending_task_fingerprint(pending_tasks: list[dict[str, Any]]) -> str:
    serialized = json.dumps(pending_tasks, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def batch_config_fingerprint(args: argparse.Namespace, profile: dict[str, Any]) -> str:
    payload = {
        "api_mode": args.api_mode,
        "model_profile": profile["name"],
        "model_id": profile["model_id"],
        "ghost_catalog_mode": args.ghost_catalog_mode,
        "ghost_prompt_strength": args.ghost_prompt_strength,
        "pause_top_processing": args.pause_top_processing,
        "background": FINAL_BACKGROUND_HEX,
        "work_size": min(args.work_size, args.max_input_side),
        "final_size": args.final_size,
    }
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def load_batch_jobs_manifest(path: Path) -> dict[str, Any]:
    return load_json_file(path)


def save_batch_jobs_manifest(path: Path, payload: dict[str, Any]) -> None:
    save_json_file(path, payload)


def existing_batch_job_for_fingerprints(
    manifest: dict[str, Any],
    task_fingerprint: str,
    config_fingerprint: str,
) -> dict[str, Any] | None:
    for job in manifest.get("jobs", []):
        status = normalize_batch_state_name(job.get("status"))
        if (
            job.get("task_fingerprint") == task_fingerprint
            and job.get("config_fingerprint") == config_fingerprint
            and (
                job.get("status") in {"prepared", "submitted", "running"}
                or is_active_batch_state(status)
                or status in {"JOB_STATE_SUCCEEDED", "SUCCEEDED"}
            )
            and not job.get("expired")
            and not job.get("failed")
        ):
            return job
    return None


def build_batch_prepare_paths(batch_prepare_dir: Path, task_fingerprint: str) -> tuple[Path, Path]:
    jsonl_path = batch_prepare_dir / f"{task_fingerprint}.jsonl"
    meta_path = batch_prepare_dir / f"{task_fingerprint}.json"
    return jsonl_path, meta_path


def build_batch_task_prompt(args: argparse.Namespace) -> str:
    return build_prompt(
        product_preservation_mode=args.product_preservation_mode,
        catalog_retouch_mode=args.catalog_retouch_mode,
        ghost_catalog_mode=args.ghost_catalog_mode,
        ghost_prompt_strength=args.ghost_prompt_strength,
        retry_feedback=False,
    )


def latest_batch_job_from_manifest(manifest: dict[str, Any]) -> dict[str, Any] | None:
    jobs = manifest.get("jobs", [])
    if not jobs:
        return None
    return max(
        jobs,
        key=lambda item: (
            item.get("created_at") or "",
            item.get("last_checked_at") or "",
            item.get("job_id") or "",
        ),
    )


def find_batch_job_in_manifest(manifest: dict[str, Any], batch_id: str | None) -> dict[str, Any] | None:
    if batch_id:
        for job in manifest.get("jobs", []):
            if job.get("job_id") == batch_id:
                return job
        return None
    return latest_batch_job_from_manifest(manifest)


def batch_job_storage_stem(job_id: str) -> str:
    return job_id.replace("/", "_")


def build_batch_control_status(job_id: str, batch_job: Any) -> dict[str, Any]:
    metadata = serialize_sdk_object(batch_job)
    state = normalize_batch_state_name(getattr(batch_job, "state", metadata.get("state")))
    create_time = metadata.get("create_time") or metadata.get("createTime")
    update_time = metadata.get("update_time") or metadata.get("updateTime")
    end_time = metadata.get("end_time") or metadata.get("endTime")
    error_payload = metadata.get("error") or metadata.get("status")
    return {
        "job_id": job_id,
        "state": state,
        "create_time": create_time,
        "update_time": update_time,
        "end_time": end_time,
        "elapsed_time": format_elapsed_between(create_time, end_time or update_time),
        "error_or_status": stringify_sdk_value(error_payload),
        "metadata": metadata,
    }


def print_batch_job_status(status: dict[str, Any]) -> None:
    print(f"job id: {status['job_id']}")
    print(f"state: {status['state']}")
    print(f"created time: {status['create_time'] or 'unknown'}")
    print(f"updated time: {status['update_time'] or 'unknown'}")
    print(f"elapsed time: {status['elapsed_time']}")


def next_action_for_batch_state(state: str) -> str:
    if state in {"JOB_STATE_EXPIRED", "EXPIRED"}:
        return "Validation must pass before submitting a new batch job for these pending tasks."
    if state in {"JOB_STATE_FAILED", "FAILED", "JOB_STATE_CANCELLED", "CANCELLED"}:
        return "Inspect the job metadata, fix validation or payload issues, then submit a new batch job."
    if state in {"JOB_STATE_SUCCEEDED", "SUCCEEDED"}:
        return "Batch completed. Use --batch-action download if you need saved metadata."
    return "Batch is still active. Poll again later or inspect the full metadata."


def mark_batch_tasks_pending_recovery(
    processing_manifest: dict[str, Any],
    included_tasks: list[dict[str, Any]],
) -> None:
    if not processing_manifest:
        return
    tasks_by_product: dict[str, list[dict[str, Any]]] = {}
    for task in included_tasks:
        tasks_by_product.setdefault(task.get("product_folder", ""), []).append(task)

    for product_name, tasks in tasks_by_product.items():
        if not product_name or product_name not in processing_manifest:
            continue
        entry = dict(processing_manifest.get(product_name, {}))
        successful_outputs = set(entry.get("successful_outputs", []))
        missing_outputs = set(entry.get("missing_outputs", []))
        failed_outputs = set(entry.get("failed_outputs", []))
        output_status_per_role = dict(entry.get("output_status_per_role", {}))
        failure_reasons = dict(entry.get("failure_reasons", {}))
        for task in tasks:
            expected_output_path = task.get("expected_output_path")
            role = task.get("role")
            if expected_output_path:
                successful_outputs.discard(expected_output_path)
                missing_outputs.add(expected_output_path)
                failed_outputs.discard(expected_output_path)
            if role:
                output_status_per_role[role] = "missing"
                failure_reasons[role] = "batch_recovery_pending"
        entry["successful_outputs"] = sorted(successful_outputs)
        entry["missing_outputs"] = sorted(missing_outputs)
        entry["failed_outputs"] = sorted(failed_outputs)
        entry["output_status_per_role"] = output_status_per_role
        entry["failure_reasons"] = failure_reasons
        if entry["successful_outputs"]:
            entry["status"] = "partial"
        else:
            entry["status"] = "pending"
        entry["last_processed_timestamp"] = utc_now()
        processing_manifest[product_name] = entry


def update_manifest_job_state(
    jobs_manifest: dict[str, Any],
    job_entry: dict[str, Any],
    status: dict[str, Any],
) -> None:
    state = status["state"]
    job_entry["status"] = state
    job_entry["last_checked_at"] = utc_now()
    job_entry["state_terminal"] = is_terminal_batch_state(state)
    job_entry["state_active"] = is_active_batch_state(state)
    job_entry["create_time"] = status["create_time"]
    job_entry["update_time"] = status["update_time"]
    job_entry["end_time"] = status["end_time"]
    job_entry["error_or_status"] = status["error_or_status"]
    if state in {"JOB_STATE_EXPIRED", "EXPIRED"}:
        job_entry["expired"] = True
    elif state in {"JOB_STATE_FAILED", "FAILED", "JOB_STATE_CANCELLED", "CANCELLED"}:
        job_entry["failed"] = True
    elif state in {"JOB_STATE_SUCCEEDED", "SUCCEEDED"}:
        job_entry["succeeded"] = True


def build_batch_asset_path(batch_prepare_dir: Path, task_fingerprint: str, product_folder: str, role: str, kind: str, source_path: Path) -> Path:
    safe_name = source_path.stem.replace(" ", "_")
    return batch_prepare_dir / "assets" / task_fingerprint / product_folder / f"{role}_{kind}_{safe_name}.jpg"


def prepare_batch_image_asset(
    source_path: Path,
    destination_path: Path,
    work_size: int,
    bg_rgb: tuple[int, int, int],
    neutralize_cast: bool,
) -> tuple[Path, str, bytes]:
    fit_image_to_square(
        source_path=source_path,
        destination_path=destination_path,
        size=work_size,
        bg_rgb=bg_rgb,
        neutralize_cast=neutralize_cast,
    )
    with Image.open(destination_path) as prepared_image:
        rgb_image = prepared_image.convert("RGB")
        buffer = BytesIO()
        rgb_image.save(buffer, format="JPEG", quality=92, optimize=True)
        return destination_path, "image/jpeg", buffer.getvalue()


def build_batch_request_contents(prompt: str, reference_mime: str, reference_b64: str, input_mime: str, input_b64: str) -> list[dict[str, Any]]:
    return [
        {
            "role": "user",
            "parts": [
                {"text": prompt},
                {"inline_data": {"mime_type": reference_mime, "data": reference_b64}},
                {"inline_data": {"mime_type": input_mime, "data": input_b64}},
            ],
        }
    ]


def choose_batch_input_mode(request_size_bytes: int, requested_mode: str) -> str:
    if requested_mode == "inline":
        return "inline"
    if requested_mode == "file":
        return "file"
    if request_size_bytes < INLINE_BATCH_SIZE_LIMIT_BYTES:
        return "inline"
    return "file"


def build_batch_payload(
    args: argparse.Namespace,
    pending_log: dict[str, Any],
    batch_prepare_dir: Path,
    profile: dict[str, Any],
    bg_rgb: tuple[int, int, int],
) -> BatchPayloadBuildResult:
    pending_tasks = pending_log.get("pending_tasks", [])
    task_fingerprint = pending_task_fingerprint(pending_tasks)
    prompt_text = build_batch_task_prompt(args)
    work_size = min(args.work_size, args.max_input_side)
    validation_items: list[dict[str, Any]] = []
    tasks_preview: list[dict[str, Any]] = []
    inline_requests: list[dict[str, Any]] = []
    jsonl_lines: list[dict[str, Any]] = []
    prepared_assets: list[dict[str, Any]] = []
    request_size_bytes = 0
    validation_failed = False

    for task in pending_tasks:
        product_folder = task["product_folder"]
        role = task["role"]
        input_path = Path(task["input_file_path"])
        reference_path = Path(task["reference_file_path"])
        output_path = Path(task["expected_output_path"])
        product_dir = Path(args.input) / product_folder
        input_mime = detect_mime_type(input_path)
        reference_mime = detect_mime_type(reference_path)
        input_asset_path = build_batch_asset_path(batch_prepare_dir, task_fingerprint, product_folder, role, "input", input_path)
        reference_asset_path = build_batch_asset_path(batch_prepare_dir, task_fingerprint, product_folder, role, "reference", reference_path)
        item_report = {
            "product_folder": product_folder,
            "role": role,
            "checks": {
                "product_folder_exists": product_dir.exists(),
                "role_front_back_only": role in {"front", "back"},
                "input_image_exists": input_path.exists(),
                "reference_image_exists": reference_path.exists(),
                "input_mime_type_exists": input_mime is not None,
                "reference_mime_type_exists": reference_mime is not None,
                "prompt_exists": bool(prompt_text.strip()),
                "output_path_exists": bool(output_path.parent.as_posix()),
            },
            "errors": [],
        }

        input_bytes = b""
        reference_bytes = b""
        if item_report["checks"]["input_image_exists"] and item_report["checks"]["reference_image_exists"]:
            try:
                _, input_mime, input_bytes = prepare_batch_image_asset(
                    input_path,
                    input_asset_path,
                    work_size,
                    bg_rgb,
                    neutralize_cast=args.neutralize_cast,
                )
                _, reference_mime, reference_bytes = prepare_batch_image_asset(
                    reference_path,
                    reference_asset_path,
                    work_size,
                    bg_rgb,
                    neutralize_cast=False,
                )
                prepared_assets.extend(
                    [
                        {"kind": "input", "path": input_asset_path.as_posix(), "mime_type": input_mime, "bytes": len(input_bytes)},
                        {"kind": "reference", "path": reference_asset_path.as_posix(), "mime_type": reference_mime, "bytes": len(reference_bytes)},
                    ]
                )
            except BatchProcessError as exc:
                item_report["errors"].append(str(exc))

        input_b64 = base64.b64encode(input_bytes).decode("ascii") if input_bytes else ""
        reference_b64 = base64.b64encode(reference_bytes).decode("ascii") if reference_bytes else ""
        contents = build_batch_request_contents(prompt_text, reference_mime or "", reference_b64, input_mime or "", input_b64)
        request_config = {
            "response_modalities": ["IMAGE"],
            "candidate_count": 1,
            "temperature": 0,
            "seed": 0,
        }
        request_record = {
            "contents": contents,
            "config": request_config,
            "metadata": {
                "product_folder": product_folder,
                "role": role,
                "input_file_path": task["input_file_path"],
                "reference_file_path": task["reference_file_path"],
                "expected_output_path": task["expected_output_path"],
                "background_color": FINAL_BACKGROUND_HEX,
            },
        }

        item_report["checks"]["image_data_included"] = bool(input_bytes)
        item_report["checks"]["reference_image_included"] = bool(reference_bytes)
        item_report["checks"]["actual_image_bytes_or_file_reference_included"] = bool(input_bytes and reference_bytes)
        item_report["checks"]["not_local_file_path_only"] = "input_image_path" not in request_record and "reference_image_path" not in request_record
        item_report["checks"]["image_generation_output_config_present"] = True
        item_report["checks"]["response_modality_matches_standard_api"] = request_config["response_modalities"] == ["IMAGE"]

        for check_name, passed in item_report["checks"].items():
            if not passed:
                item_report["errors"].append(f"failed:{check_name}")

        item_report["valid"] = not item_report["errors"]
        if not item_report["valid"]:
            validation_failed = True

        preview_task = {
            "product_folder": product_folder,
            "role": role,
            "input_file_path": task["input_file_path"],
            "reference_file_path": task["reference_file_path"],
            "prepared_input_asset": input_asset_path.as_posix(),
            "prepared_reference_asset": reference_asset_path.as_posix(),
            "expected_output_path": task["expected_output_path"],
            "model_id": profile["model_id"],
            "background_color": FINAL_BACKGROUND_HEX,
            "payload_image_transport": "inline",
            "input_mime_type": input_mime,
            "reference_mime_type": reference_mime,
            "input_bytes": len(input_bytes),
            "reference_bytes": len(reference_bytes),
        }
        tasks_preview.append(preview_task)
        inline_requests.append(request_record)
        jsonl_lines.append(request_record)
        validation_items.append(item_report)
        request_size_bytes += len(json.dumps(request_record, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))

    payload_type = choose_batch_input_mode(request_size_bytes, args.batch_input_mode)
    payload_preview = {
        "model": profile["model_id"],
        "src": {
            "inlined_requests": inline_requests if payload_type == "inline" else [],
            "jsonl_request_count": len(jsonl_lines) if payload_type == "file" else 0,
        },
        "config": {
            "display_name": f"shopify-image-batch-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
        },
    }
    validation_report = {
        "validated_at": utc_now(),
        "batch_input_mode_requested": args.batch_input_mode,
        "batch_payload_type_selected": payload_type,
        "batch_request_size_bytes": request_size_bytes,
        "batch_task_count": len(pending_tasks),
        "image_data_included": all(item["checks"].get("image_data_included") for item in validation_items) if validation_items else False,
        "reference_image_included": all(item["checks"].get("reference_image_included") for item in validation_items) if validation_items else False,
        "image_output_config_included": all(item["checks"].get("image_generation_output_config_present") for item in validation_items) if validation_items else False,
        "valid": bool(pending_tasks) and not validation_failed,
        "tasks": validation_items,
    }
    return BatchPayloadBuildResult(
        payload_type=payload_type,
        task_count=len(pending_tasks),
        request_size_bytes=request_size_bytes,
        image_data_included=validation_report["image_data_included"],
        reference_image_included=validation_report["reference_image_included"],
        output_config_included=validation_report["image_output_config_included"],
        tasks_preview=tasks_preview,
        payload_preview=payload_preview,
        validation_report=validation_report,
        inline_requests=inline_requests,
        jsonl_lines=jsonl_lines,
        prepared_assets=prepared_assets,
    )


def write_batch_jsonl(jsonl_path: Path, lines: list[dict[str, Any]]) -> None:
    jsonl_path.parent.mkdir(parents=True, exist_ok=True)
    with jsonl_path.open("w", encoding="utf-8") as handle:
        for line in lines:
            handle.write(json.dumps(line, ensure_ascii=True) + "\n")


def prepare_batch_input_file(
    args: argparse.Namespace,
    pending_log: dict[str, Any],
    batch_prepare_dir: Path,
    profile: dict[str, Any],
) -> tuple[Path, str, str]:
    pending_tasks = pending_log.get("pending_tasks", [])
    task_fingerprint = pending_task_fingerprint(pending_tasks)
    config_fingerprint = batch_config_fingerprint(args, profile)
    jsonl_path, meta_path = build_batch_prepare_paths(batch_prepare_dir, task_fingerprint)
    batch_prepare_dir.mkdir(parents=True, exist_ok=True)
    save_json_file(
        meta_path,
        {
            "task_fingerprint": task_fingerprint,
            "config_fingerprint": config_fingerprint,
            "profile": profile,
            "pending_tasks_log": pending_log,
        },
    )
    if not jsonl_path.exists():
        write_batch_jsonl(jsonl_path, [])
    return jsonl_path, task_fingerprint, config_fingerprint


def build_missing_top_prompt(ghost_prompt_strength: str) -> str:
    return f"{MISSING_TOP_PROMPT_TEMPLATE.rstrip()}{GHOST_PROMPT_STRENGTH_APPENDIX[ghost_prompt_strength]}"


def save_text_file_safe(destination: Path, content: str) -> None:
    try:
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(content, encoding="utf-8")
    except Exception as exc:
        logging.warning("Text save failed for %s: %s", destination.as_posix(), exc)


def save_batch_validation_outputs(
    batch_prepare_dir: Path,
    build_result: BatchPayloadBuildResult,
) -> tuple[Path, Path, Path]:
    tasks_preview_path = batch_prepare_dir / "last_batch_tasks_preview.json"
    payload_preview_path = batch_prepare_dir / "last_batch_payload_preview.json"
    validation_report_path = batch_prepare_dir / "last_batch_validation_report.json"
    save_json_file(tasks_preview_path, {"tasks": build_result.tasks_preview})
    save_json_file(payload_preview_path, build_result.payload_preview)
    save_json_file(validation_report_path, build_result.validation_report)
    return tasks_preview_path, payload_preview_path, validation_report_path


def log_batch_payload_summary(build_result: BatchPayloadBuildResult) -> None:
    logging.info("Batch payload type: %s", build_result.payload_type)
    logging.info("Batch task count: %s", build_result.task_count)
    logging.info("Batch request size bytes: %s", build_result.request_size_bytes)
    logging.info("Image data included: %s", "yes" if build_result.image_data_included else "no")
    logging.info("Reference image included: %s", "yes" if build_result.reference_image_included else "no")
    logging.info("Image output config included: %s", "yes" if build_result.output_config_included else "no")


def upload_batch_jsonl_file(client: genai.Client, jsonl_path: Path) -> Any:
    if not hasattr(client, "files") or not hasattr(client.files, "upload"):
        raise BatchProcessError("File-based batch input requires SDK file upload support, but client.files.upload is unavailable.")
    try:
        return client.files.upload(file=jsonl_path.as_posix())
    except TypeError:
        return client.files.upload(file=jsonl_path)


def submit_batch_job(
    client: genai.Client,
    batch_input_file: Path,
    build_result: BatchPayloadBuildResult,
    args: argparse.Namespace,
    profile: dict[str, Any],
) -> tuple[str, dict[str, Any]]:
    if not build_result.validation_report.get("valid"):
        raise BatchProcessError("Batch validation failed. Fix validation errors before submitting.")
    display_name = f"shopify-image-batch-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    batch_create_config: Any = {"display_name": display_name}
    if hasattr(types, "CreateBatchJobConfig"):
        batch_create_config = types.CreateBatchJobConfig(display_name=display_name)

    if build_result.payload_type == "inline":
        src_payload: Any = {"inlined_requests": build_result.inline_requests}
        if hasattr(types, "BatchJobSource"):
            try:
                src_payload = types.BatchJobSource(inlined_requests=build_result.inline_requests)
            except Exception:
                src_payload = {"inlined_requests": build_result.inline_requests}
        batch_job = client.batches.create(
            model=profile["model_id"],
            src=src_payload,
            config=batch_create_config,
        )
    else:
        write_batch_jsonl(batch_input_file, build_result.jsonl_lines)
        uploaded_file = upload_batch_jsonl_file(client, batch_input_file)
        batch_job = client.batches.create(
            model=profile["model_id"],
            src=uploaded_file,
            config=batch_create_config,
        )
    return getattr(batch_job, "name", "unknown"), {
        "job_id": getattr(batch_job, "name", "unknown"),
        "status": normalize_batch_state_name(getattr(batch_job, "state", "submitted")),
        "model_id": getattr(batch_job, "model", profile["model_id"]),
        "batch_input_file": batch_input_file.as_posix(),
        "batch_payload_type": build_result.payload_type,
        "batch_request_size_bytes": build_result.request_size_bytes,
        "image_data_included": build_result.image_data_included,
        "reference_image_included": build_result.reference_image_included,
        "image_output_config_included": build_result.output_config_included,
    }


def poll_batch_jobs(
    client: genai.Client,
    jobs_manifest_path: Path,
    batch_id: str | None,
    processing_manifest_path: Path | None = None,
) -> int:
    jobs_manifest = load_batch_jobs_manifest(jobs_manifest_path)
    job = find_batch_job_in_manifest(jobs_manifest, batch_id)
    if job is None:
        raise BatchProcessError("No batch job found in batch_jobs_manifest.json. Use --batch-id or submit a batch first.")
    job_id = batch_id or job.get("job_id")
    if not job_id:
        raise BatchProcessError("Selected batch manifest entry does not contain a job_id.")
    batch_job = client.batches.get(name=job_id)
    status = build_batch_control_status(job_id, batch_job)
    update_manifest_job_state(jobs_manifest, job, status)
    print_batch_job_status(status)
    if status["state"] in {"JOB_STATE_EXPIRED", "EXPIRED", "JOB_STATE_FAILED", "FAILED", "JOB_STATE_CANCELLED", "CANCELLED"}:
        reason = status["error_or_status"] or "No explicit error returned by the API."
        print(f"reason: {reason}")
        print(f"next action: {next_action_for_batch_state(status['state'])}")
        if processing_manifest_path is not None:
            processing_manifest = load_processing_manifest(processing_manifest_path, reset=False)
            mark_batch_tasks_pending_recovery(processing_manifest, job.get("included_output_tasks", []))
            save_processing_manifest(processing_manifest_path, processing_manifest)
    elif status["state"] in {"JOB_STATE_SUCCEEDED", "SUCCEEDED"}:
        print(f"next action: {next_action_for_batch_state(status['state'])}")
    save_batch_jobs_manifest(jobs_manifest_path, jobs_manifest)
    return 0


def inspect_batch_job(
    client: genai.Client,
    jobs_manifest_path: Path,
    batch_prepare_dir: Path,
    batch_id: str,
) -> int:
    jobs_manifest = load_batch_jobs_manifest(jobs_manifest_path)
    batch_job = client.batches.get(name=batch_id)
    status = build_batch_control_status(batch_id, batch_job)
    metadata = status["metadata"]
    output_path = batch_prepare_dir / f"{batch_job_storage_stem(batch_id)}_inspect.json"
    save_json_file(output_path, metadata if isinstance(metadata, dict) else {"metadata": metadata})
    manifest_entry = find_batch_job_in_manifest(jobs_manifest, batch_id)
    if manifest_entry is not None:
        update_manifest_job_state(jobs_manifest, manifest_entry, status)
        manifest_entry["inspect_file"] = output_path.as_posix()
        save_batch_jobs_manifest(jobs_manifest_path, jobs_manifest)
    print(f"name: {metadata.get('name') or batch_id}")
    print(f"state: {status['state']}")
    print(f"model: {metadata.get('model') or metadata.get('model_id') or 'unknown'}")
    print(f"createTime: {status['create_time'] or 'unknown'}")
    print(f"updateTime: {status['update_time'] or 'unknown'}")
    print(f"endTime: {status['end_time'] or 'unknown'}")
    print(f"error/status: {status['error_or_status'] or 'none'}")
    print(f"input source: {metadata.get('src') or metadata.get('input_source') or 'unknown'}")
    print(f"output source: {metadata.get('dest') or metadata.get('output_info') or metadata.get('output_source') or 'unknown'}")
    print(f"batch stats: {metadata.get('stats') or metadata.get('batch_stats') or 'unavailable'}")
    print(f"saved: {output_path.as_posix()}")
    return 0


def download_batch_jobs(client: genai.Client, jobs_manifest_path: Path, batch_prepare_dir: Path) -> int:
    jobs_manifest = load_batch_jobs_manifest(jobs_manifest_path)
    for job in jobs_manifest.get("jobs", []):
        job_id = job.get("job_id")
        if not job_id:
            continue
        state = normalize_batch_state_name(job.get("status"))
        if state in {"JOB_STATE_EXPIRED", "EXPIRED"} or job.get("expired"):
            logging.info("Skipping download for expired batch job %s", job_id)
            continue
        try:
            batch_job = client.batches.get(name=job_id)
            output_dump = batch_job.model_dump(mode="json") if hasattr(batch_job, "model_dump") else {"job_id": job_id, "repr": str(batch_job)}
            output_path = batch_prepare_dir / f"{job_id.replace('/', '_')}_download.json"
            save_json_file(output_path, output_dump)
            job["download_file"] = output_path.as_posix()
            job["last_checked_at"] = utc_now()
            logging.info("Batch job %s downloaded metadata -> %s", job_id, output_path.as_posix())
        except Exception as exc:
            logging.warning("Batch download failed for %s: %s", job_id, exc)
    save_batch_jobs_manifest(jobs_manifest_path, jobs_manifest)
    return 0


def run_batch_selftest(client: genai.Client, profile: dict[str, Any], batch_prepare_dir: Path) -> int:
    display_name = f"batch-selftest-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
    request_record = {
        "contents": [{"role": "user", "parts": [{"text": "Reply with the single word OK."}]}],
        "config": {
            "response_modalities": ["TEXT"],
            "candidate_count": 1,
            "temperature": 0,
            "seed": 0,
        },
        "metadata": {"selftest": True},
    }
    batch_job = client.batches.create(
        model=profile["model_id"],
        src={"inlined_requests": [request_record]},
        config=types.CreateBatchJobConfig(display_name=display_name) if hasattr(types, "CreateBatchJobConfig") else {"display_name": display_name},
    )
    output_path = batch_prepare_dir / "last_batch_selftest.json"
    save_json_file(output_path, {"name": getattr(batch_job, "name", "unknown"), "state": normalize_batch_state_name(getattr(batch_job, "state", "submitted"))})
    print(f"selftest batch job: {getattr(batch_job, 'name', 'unknown')}")
    print(f"state: {normalize_batch_state_name(getattr(batch_job, 'state', 'submitted'))}")
    print(f"saved: {output_path.as_posix()}")
    return 0


def process_generated_top_output(
    client: genai.Client | None,
    product_dir: Path,
    source_image_paths: list[Path],
    references_dir: Path,
    top_reference_path: Path,
    output_root: Path,
    cache_root: Path,
    debug_root: Path,
    model: str,
    work_size: int,
    final_size: int,
    bg_rgb: tuple[int, int, int],
    quality: int,
    retries: int,
    dry_run: bool,
    postprocess_segment: bool,
    use_rembg: bool,
    ghost_prompt_strength: str,
    force_reprocess: bool,
    gemini_retry_count: int,
    reject_if_reference_mismatch: bool,
    reference_mismatch_mode: str,
    front_reference_mismatch_threshold: float,
    back_reference_mismatch_threshold: float,
    top_reference_mismatch_threshold: float,
    stop_on_gemini_quota_error: bool,
    only_missing: bool,
    cost_guard: bool,
    max_cost_per_image_inr: float,
    estimated_gemini_call_cost_inr: float,
    disable_retries_if_cost_cap: bool,
    dry_run_cost: bool,
    skip_artifact_cleanup: bool,
    save_debug: bool,
    reload_rembg_each_image: bool,
    fail_on_bad_bbox: bool,
    product_scale: float,
    top_product_scale: float,
    vertical_center: float,
    safe_padding: float,
) -> tuple[JobRecord, bool]:
    relative_output_path = Path(product_dir.name) / "top.jpg"
    relative_posix = relative_output_path.as_posix()
    record = JobRecord(
        product_folder=product_dir.name,
        role="generated_top",
        input_file="generated_from:" + ",".join(path.name for path in source_image_paths),
        reference_file=top_reference_path.as_posix(),
        resized_input_file=None,
        resized_reference_file=None,
        output_file=(output_root / relative_output_path).as_posix(),
        status="pending",
        error=None,
        model=model,
        started_at=utc_now(),
    )
    output_path = output_root / relative_output_path
    debug_base_dir = debug_root / product_dir.name / "top_generated"
    prompt_text = build_missing_top_prompt(ghost_prompt_strength)
    edited_image: Image.Image | None = None
    cleanup: CleanupResult | None = None
    reference_analysis_mask: Image.Image | None = None
    resized_source_paths: list[Path] = []

    try:
        if output_path.exists() and (only_missing or not force_reprocess):
            record.status = "skipped_only_missing" if only_missing else "skipped"
            logging.info("[%s] skipped_only_missing existing generated top output -> %s", relative_posix, output_path.as_posix())
            return record, False

        allowed_calls, effective_retry_count, estimated_total_cost, retries_adjusted = planned_cost_details(
            gemini_retry_count=gemini_retry_count,
            estimated_gemini_call_cost_inr=estimated_gemini_call_cost_inr,
            max_cost_per_image_inr=max_cost_per_image_inr,
            disable_retries_if_cost_cap=disable_retries_if_cost_cap,
        )
        record.estimated_cost_inr = round(estimated_total_cost, 2)
        if retries_adjusted:
            logging.warning(
                "[%s] cost guard reduced gemini retry count from %s to %s",
                relative_posix,
                gemini_retry_count,
                effective_retry_count,
            )
        logging.info("[%s] estimated Gemini spend: INR %.2f (planned calls=%s, retry count=%s)", relative_posix, estimated_total_cost, allowed_calls, effective_retry_count)
        if dry_run_cost:
            record.status = "dry-run-cost"
            logging.info("[%s] dry-run-cost enabled; Gemini will not be called", relative_posix)
            return record, False
        if dry_run:
            record.status = "dry-run"
            logging.info("[%s] planned generated top output -> %s", relative_posix, output_path.as_posix())
            return record, False

        if save_debug:
            try:
                debug_base_dir.mkdir(parents=True, exist_ok=True)
            except Exception as exc:
                logging.warning("Failed to create debug directory %s: %s", debug_base_dir.as_posix(), exc)
        save_text_file_safe(output_root / product_dir.name / "top_prompt_used.txt", prompt_text)

        resized_reference_path = cache_root / product_dir.name / "top_generated_reference.png"
        fit_image_to_square(top_reference_path, resized_reference_path, work_size, bg_rgb, neutralize_cast=False)
        record.resized_reference_file = resized_reference_path.as_posix()

        for source_path in source_image_paths:
            resized_source = cache_root / product_dir.name / f"top_generated_{source_path.stem.lower()}.png"
            fit_image_to_square(source_path, resized_source, work_size, bg_rgb, neutralize_cast=True)
            resized_source_paths.append(resized_source)

        with Image.open(resized_reference_path) as reference_analysis_image:
            reference_analysis_mask, _ = generate_analysis_mask(
                reference_analysis_image.convert("RGBA"),
                bg_rgb,
                use_rembg and postprocess_segment,
            )
        reference_bbox = mask_bbox(reference_analysis_mask)
        if reference_bbox is None:
            raise BatchProcessError("Top reference mask detection failed.")

        gemini_called = False
        gemini_calls_made = 0
        last_error: str | None = None
        for attempt_index in range(1, allowed_calls + 1):
            attempt_dir = debug_base_dir / f"attempt-{attempt_index}"
            if save_debug:
                try:
                    attempt_dir.mkdir(parents=True, exist_ok=True)
                except Exception as exc:
                    logging.warning("Failed to create debug directory %s: %s", attempt_dir.as_posix(), exc)
                for resized_source in resized_source_paths:
                    save_debug_image_safe(resized_source, attempt_dir / f"{resized_source.stem}.png")
                save_debug_image_safe(resized_reference_path, attempt_dir / "reference_resized.png")

            logging.info("TOP MODE: generated_top")
            logging.info("Top source images used: %s", [path.name for path in source_image_paths])
            logging.info("Top reference used: %s", top_reference_path.as_posix())
            logging.info("Generated top prompt active: yes")
            logging.info("Normal front/back prompt active: no")
            logging.info(
                "[product=%s image=top.jpg role=generated_top] source=%s reference=%s gemini_call=%s estimated_cost=₹%.2f current_step=gemini",
                product_dir.name,
                ",".join(path.name for path in source_image_paths),
                top_reference_path.as_posix(),
                True,
                estimated_total_cost,
            )
            if cost_guard and (estimated_total_cost > max_cost_per_image_inr or allowed_calls <= 0):
                record.status = "skipped_cost_cap"
                record.error = f"Cost guard blocked this image. Estimated cost ₹{max(estimated_total_cost, estimated_gemini_call_cost_inr):.2f} exceeds cap ₹{max_cost_per_image_inr:.2f}."
                logging.warning("Cost guard blocked image: estimated ₹%.2f exceeds cap ₹%.2f", max(estimated_total_cost, estimated_gemini_call_cost_inr), max_cost_per_image_inr)
                return record, False

            edited_image, api_calls_for_attempt = call_gemini_with_retries_multi(
                client=client,
                model=model,
                prompt=prompt_text,
                reference_image_path=resized_reference_path,
                input_image_paths=resized_source_paths,
                retries=retries,
            )
            gemini_called = True
            gemini_calls_made += api_calls_for_attempt
            record.gemini_calls_made = gemini_calls_made
            record.retries_used = max(0, gemini_calls_made - 1)
            if save_debug:
                save_debug_image_safe(edited_image, attempt_dir / "gemini_raw.png")

            cleanup = postprocess_gemini_output(
                edited_image=edited_image,
                role="top",
                final_size=final_size,
                bg_rgb=bg_rgb,
                product_scale=product_scale,
                top_product_scale=top_product_scale,
                vertical_center=vertical_center,
                safe_padding=safe_padding,
                postprocess_segment=postprocess_segment,
                use_rembg=use_rembg,
                skip_artifact_cleanup=skip_artifact_cleanup,
            )
            output_mask_for_analysis: Image.Image | None = None
            try:
                if save_debug:
                    if cleanup.debug_mask is not None:
                        save_debug_image_safe(cleanup.debug_mask, attempt_dir / "mask_debug.png")
                    if cleanup.debug_bbox is not None:
                        save_debug_image_safe(cleanup.debug_bbox, attempt_dir / "bbox_debug.png")
                    save_debug_image_safe(cleanup.image, attempt_dir / "final_candidate.png")
                output_mask_for_analysis, _ = generate_analysis_mask(
                    cleanup.debug_pre_cleanup if cleanup.debug_pre_cleanup is not None else cleanup.image,
                    bg_rgb,
                    use_rembg and postprocess_segment,
                )
                output_analysis_bbox = mask_bbox(output_mask_for_analysis)
                if output_analysis_bbox is None:
                    raise BatchProcessError("Generated top mask detection failed.")
                mismatch_report = reference_mismatch_report(
                    output_mask_for_analysis,
                    reference_analysis_mask,
                    output_analysis_bbox,
                    reference_bbox,
                    cleanup.final_scale,
                )
                threshold = reference_threshold_for_role(
                    "top",
                    front_reference_mismatch_threshold,
                    back_reference_mismatch_threshold,
                    top_reference_mismatch_threshold,
                )
                top_layout_error, top_layout_flags = validate_generated_top_layout(
                    output_analysis_bbox,
                    reference_bbox,
                    cleanup.debug_pre_cleanup.size if cleanup.debug_pre_cleanup is not None else cleanup.image.size,
                    reference_analysis_mask.size,
                )
                quality_error = validate_final_output(
                    cleanup.image,
                    cleanup.raw_bbox if cleanup.raw_bbox is not None else cleanup.bbox,
                    cleanup.debug_pre_cleanup.size if cleanup.debug_pre_cleanup is not None else cleanup.image.size,
                    cleanup.final_scale,
                    bg_rgb,
                    fail_on_bad_bbox,
                )
                reference_error, reference_warning = assess_reference_match(
                    mismatch_report,
                    reject_if_reference_mismatch,
                    role="top",
                    mode=reference_mismatch_mode,
                    threshold=threshold,
                    is_generated_top=True,
                )
                record.reference_mismatch_score = mismatch_report["reference_mismatch_score"]
                record.reference_mismatch_threshold = threshold
                record.reference_mismatch_warning = reference_warning
                rejection_reason = top_layout_error or quality_error or reference_error
                log_reference_match_decision(
                    product_folder=product_dir.name,
                    image_filename="top.jpg",
                    role="top",
                    reference_file=top_reference_path.as_posix(),
                    mismatch_report=mismatch_report,
                    threshold=threshold,
                    mode=reference_mismatch_mode,
                    accepted=rejection_reason is None,
                    reason=rejection_reason or reference_warning,
                )
                if save_debug:
                    try:
                        save_quality_report(
                            attempt_dir / "quality_report.json",
                            {
                                "source_image_path": record.input_file,
                                "reference_path": top_reference_path.as_posix(),
                                "bbox": mismatch_report["bbox"],
                                "reference_bbox": mismatch_report["reference_bbox"],
                                "bbox_aspect_ratio": mismatch_report["bbox_aspect_ratio"],
                                "reference_aspect_ratio": mismatch_report["reference_aspect_ratio"],
                                "scale_used": round(cleanup.final_scale, 4),
                                "rembg_success": cleanup.rembg_succeeded,
                                "reference_mismatch_score": mismatch_report["reference_mismatch_score"],
                                "threshold": threshold,
                                "accepted": rejection_reason is None,
                                "rejection_reason": rejection_reason,
                                "warning_reason": reference_warning,
                                "role": "generated_top",
                                "source_images_used": [path.name for path in source_image_paths],
                                "full_garment_detected": top_layout_flags["full_garment_detected"],
                                "hem_visible": top_layout_flags["hem_visible"],
                                "neckline_crop_passed": top_layout_flags["neckline_crop_passed"],
                                "attempt": attempt_index,
                            },
                        )
                    except Exception as exc:
                        logging.warning("Debug quality report save failed for %s: %s", (attempt_dir / "quality_report.json").as_posix(), exc)
                if rejection_reason is not None:
                    last_error = rejection_reason
                    record.status = "failed_generated_top_layout" if top_layout_error else ("failed_reference_mismatch" if reference_error else "failed")
                    record.error = rejection_reason
                    record.quality_gate_passed = False
                    try:
                        update_results_quality_report(
                            output_root,
                            product_dir.name,
                            {
                                "filename": "top.jpg",
                                "role": "generated_top",
                                "reference_used": top_reference_path.as_posix(),
                                "status": record.status,
                                "bbox": mismatch_report["bbox"],
                                "reference_bbox": mismatch_report["reference_bbox"],
                                "mismatch_score": mismatch_report["reference_mismatch_score"],
                                "threshold": threshold,
                                "warning_reason": reference_warning,
                                "rejection_reason": rejection_reason,
                                "source_images_used": [path.name for path in source_image_paths],
                                "full_garment_detected": top_layout_flags["full_garment_detected"],
                                "hem_visible": top_layout_flags["hem_visible"],
                                "neckline_crop_passed": top_layout_flags["neckline_crop_passed"],
                            },
                        )
                    except Exception as exc:
                        logging.warning("Results quality report save failed for %s/top.jpg: %s", product_dir.name, exc)
                    safe_close_image(output_mask_for_analysis)
                    output_mask_for_analysis = None
                    safe_close_image(cleanup.debug_pre_cleanup if cleanup is not None else None)
                    safe_close_image(cleanup.debug_mask if cleanup is not None else None)
                    safe_close_image(cleanup.debug_bbox if cleanup is not None else None)
                    safe_close_image(cleanup.image if cleanup is not None else None)
                    safe_close_image(edited_image)
                    cleanup = None
                    edited_image = None
                    gc.collect()
                    continue

                save_final_image(cleanup.image, output_path, quality)
                record.status = "success"
                record.quality_gate_passed = True
                try:
                    update_results_quality_report(
                        output_root,
                        product_dir.name,
                        {
                            "filename": "top.jpg",
                            "role": "generated_top",
                            "reference_used": top_reference_path.as_posix(),
                            "status": record.status,
                            "bbox": mismatch_report["bbox"],
                            "reference_bbox": mismatch_report["reference_bbox"],
                            "mismatch_score": mismatch_report["reference_mismatch_score"],
                            "threshold": threshold,
                            "warning_reason": reference_warning,
                            "rejection_reason": None,
                            "source_images_used": [path.name for path in source_image_paths],
                            "full_garment_detected": top_layout_flags["full_garment_detected"],
                            "hem_visible": top_layout_flags["hem_visible"],
                            "neckline_crop_passed": top_layout_flags["neckline_crop_passed"],
                        },
                    )
                except Exception as exc:
                    logging.warning("Results quality report save failed for %s/top.jpg: %s", product_dir.name, exc)
                return record, gemini_called
            finally:
                safe_close_image(output_mask_for_analysis)

        record.status = "failed"
        record.error = last_error or "Missing top generation failed."
        record.quality_gate_passed = False
        return record, gemini_called
    except BillingCapError as exc:
        record.status = "failed"
        record.error = str(exc)
        logging.error("[%s] failed -> %s", relative_posix, record.error)
        if stop_on_gemini_quota_error:
            raise BillingCapStop(str(exc), record) from exc
        return record, False
    except BatchProcessError as exc:
        record.status = "failed"
        record.error = str(exc)
        logging.error("[%s] failed -> %s", relative_posix, record.error)
        try:
            update_results_quality_report(
                output_root,
                product_dir.name,
                {
                    "filename": "top.jpg",
                    "role": "generated_top",
                    "reference_used": top_reference_path.as_posix(),
                    "status": record.status,
                    "bbox": None,
                    "reference_bbox": None,
                    "mismatch_score": record.reference_mismatch_score,
                    "threshold": record.reference_mismatch_threshold,
                    "warning_reason": record.reference_mismatch_warning,
                    "rejection_reason": record.error,
                    "source_images_used": [path.name for path in source_image_paths],
                    "full_garment_detected": None,
                    "hem_visible": None,
                    "neckline_crop_passed": None,
                },
            )
        except Exception as report_exc:
            logging.warning("Results quality report save failed for %s/top.jpg: %s", product_dir.name, report_exc)
        return record, False
    finally:
        safe_close_image(reference_analysis_mask)
        safe_close_image(cleanup.debug_pre_cleanup if cleanup is not None else None)
        safe_close_image(cleanup.debug_mask if cleanup is not None else None)
        safe_close_image(cleanup.debug_bbox if cleanup is not None else None)
        safe_close_image(cleanup.image if cleanup is not None else None)
        safe_close_image(edited_image)
        resized_source_paths.clear()
        del resized_source_paths
        del cleanup
        del edited_image
        del reference_analysis_mask
        record.finished_at = utc_now()
        post_image_memory_cleanup(product_dir.name, "top_generated", reload_rembg_each_image)


def process_single_image(
    client: genai.Client | None,
    image_path: Path,
    input_root: Path,
    references_dir: Path,
    output_root: Path,
    cache_root: Path,
    debug_root: Path,
    model: str,
    work_size: int,
    final_size: int,
    bg_rgb: tuple[int, int, int],
    quality: int,
    retries: int,
    dry_run: bool,
    safe_mode: bool,
    neutralize_cast: bool,
    postprocess_segment: bool,
    use_rembg: bool,
    product_preservation_mode: bool,
    catalog_retouch_mode: bool,
    ghost_catalog_mode: bool,
    ghost_prompt_strength: str,
    force_reprocess: bool,
    gemini_retry_count: int,
    reject_if_reference_mismatch: bool,
    reference_mismatch_mode: str,
    front_reference_mismatch_threshold: float,
    back_reference_mismatch_threshold: float,
    top_reference_mismatch_threshold: float,
    stop_on_gemini_quota_error: bool,
    only_missing: bool,
    cost_guard: bool,
    max_cost_per_image_inr: float,
    estimated_gemini_call_cost_inr: float,
    disable_retries_if_cost_cap: bool,
    dry_run_cost: bool,
    skip_artifact_cleanup: bool,
    save_debug: bool,
    reload_rembg_each_image: bool,
    fail_on_bad_bbox: bool,
    product_scale: float,
    top_product_scale: float,
    vertical_center: float,
    safe_padding: float,
) -> tuple[JobRecord, bool]:
    relative_path = image_path.relative_to(input_root)
    relative_posix = relative_path.as_posix()
    product_folder = relative_path.parent.as_posix()
    role = detect_role(image_path.name)
    started_at = utc_now()
    record = JobRecord(
        product_folder=product_folder,
        role=role,
        input_file=relative_posix,
        reference_file=None,
        resized_input_file=None,
        resized_reference_file=None,
        output_file=(output_root / relative_path).as_posix(),
        status="pending",
        error=None,
        model=model,
        started_at=started_at,
    )
    output_path = output_root / relative_path
    image_debug_dir = debug_root / product_folder / image_path.stem.lower()
    if save_debug:
        try:
            image_debug_dir.mkdir(parents=True, exist_ok=True)
        except Exception as exc:
            logging.warning("Failed to create debug directory %s: %s", image_debug_dir.as_posix(), exc)
    edited_image: Image.Image | None = None
    cleanup: CleanupResult | None = None
    reference_analysis_mask: Image.Image | None = None

    try:
        if role is None:
            record.status = "skipped_unknown_role"
            record.error = f"Could not determine role from filename: {image_path.name}"
            logging.warning("[%s] skipped_unknown_role -> %s", relative_posix, record.error)
            return record, False

        reference_path = build_reference_path(references_dir, role)
        if not reference_path.exists():
            record.status = "skipped_reference_missing"
            record.error = f"Reference image not found: {reference_path.as_posix()}"
            logging.warning("[%s] skipped_reference_missing -> %s", relative_posix, record.error)
            return record, False

        resized_input_path = cache_root / relative_path.parent / f"{role}_input.png"
        resized_reference_path = cache_root / relative_path.parent / f"{role}_reference.png"
        record.reference_file = reference_path.as_posix()
        record.resized_input_file = resized_input_path.as_posix()
        record.resized_reference_file = resized_reference_path.as_posix()
        record.output_file = output_path.as_posix()

        if output_path.exists() and (only_missing or not force_reprocess):
            record.status = "skipped_only_missing" if only_missing else "skipped"
            logging.info("[%s] %s -> %s", relative_posix, "skipped_only_missing" if only_missing else "skipped_existing_output", output_path.as_posix())
            return record, False

        allowed_calls, effective_retry_count, estimated_total_cost, retries_adjusted = planned_cost_details(
            gemini_retry_count=gemini_retry_count,
            estimated_gemini_call_cost_inr=estimated_gemini_call_cost_inr,
            max_cost_per_image_inr=max_cost_per_image_inr,
            disable_retries_if_cost_cap=disable_retries_if_cost_cap,
        )
        record.estimated_cost_inr = round(estimated_total_cost, 2)
        if ghost_catalog_mode and gemini_retry_count > 0:
            logging.warning(
                "Retries increase cost. Current estimated cost per image: ₹%.2f",
                (1 + gemini_retry_count) * estimated_gemini_call_cost_inr,
            )
        if retries_adjusted:
            logging.warning(
                "[%s] cost guard reduced gemini retry count from %s to %s",
                relative_posix,
                gemini_retry_count,
                effective_retry_count,
            )
        logging.info(
            "[%s] estimated Gemini spend: INR %.2f (planned calls=%s, retry count=%s)",
            relative_posix,
            estimated_total_cost,
            allowed_calls,
            effective_retry_count,
        )
        if dry_run_cost:
            record.status = "dry-run-cost"
            logging.info("[%s] dry-run-cost enabled; Gemini will not be called", relative_posix)
            return record, False
        logging.info(
            "[product=%s image=%s role=%s] source=%s reference=%s gemini_call=%s estimated_cost=₹%.2f",
            product_folder,
            image_path.name,
            role,
            image_path.as_posix(),
            reference_path.as_posix(),
            True,
            estimated_total_cost,
        )

        if dry_run:
            logging.info("[%s] planned resized input -> %s", relative_posix, resized_input_path.as_posix())
            logging.info("[%s] planned resized reference -> %s", relative_posix, resized_reference_path.as_posix())
            logging.info("[%s] planned output -> %s", relative_posix, output_path.as_posix())
            record.status = "dry-run"
            return record, False

        logging.info("[%s] step=resize-input", relative_posix)
        fit_image_to_square(
            image_path,
            resized_input_path,
            work_size,
            bg_rgb,
            neutralize_cast=neutralize_cast,
        )
        logging.info("[%s] resized input -> %s", relative_posix, resized_input_path.as_posix())
        if save_debug:
            save_debug_image_safe(resized_input_path, image_debug_dir / "original_resized.png")
        logging.info("[%s] step=resize-reference", relative_posix)
        fit_image_to_square(
            reference_path,
            resized_reference_path,
            work_size,
            bg_rgb,
            neutralize_cast=False,
        )
        logging.info("[%s] resized reference -> %s", relative_posix, resized_reference_path.as_posix())
        with Image.open(resized_reference_path) as reference_analysis_image:
            reference_analysis_mask, _ = generate_analysis_mask(
                reference_analysis_image.convert("RGBA"),
                bg_rgb,
                use_rembg and postprocess_segment,
            )
        reference_bbox = mask_bbox(reference_analysis_mask)
        if reference_bbox is None:
            raise BatchProcessError("Reference mask detection failed.")

        max_attempts = allowed_calls
        gemini_called = False
        last_error: str | None = None
        gemini_calls_made = 0

        for attempt_index in range(1, max_attempts + 1):
            attempt_dir = attempt_debug_directory(debug_root, relative_path, attempt_index)
            if save_debug:
                try:
                    attempt_dir.mkdir(parents=True, exist_ok=True)
                except Exception as exc:
                    logging.warning("Failed to create debug directory %s: %s", attempt_dir.as_posix(), exc)
                save_debug_image_safe(resized_input_path, attempt_dir / "original_resized.png")
                save_debug_image_safe(resized_reference_path, attempt_dir / "reference_resized.png")

            retry_feedback = ghost_catalog_mode and attempt_index > 1
            if cost_guard and estimated_total_cost > max_cost_per_image_inr:
                record.status = "skipped_cost_cap"
                record.error = (
                    f"Cost guard blocked this image. Estimated cost ₹{estimated_total_cost:.2f} exceeds cap ₹{max_cost_per_image_inr:.2f}."
                )
                logging.warning(
                    "Cost guard blocked image: estimated ₹%.2f exceeds cap ₹%.2f",
                    estimated_total_cost,
                    max_cost_per_image_inr,
                )
                return record, False
            if cost_guard and allowed_calls <= 0:
                record.status = "skipped_cost_cap"
                record.error = (
                    f"Cost guard blocked this image. Estimated cost ₹{estimated_gemini_call_cost_inr:.2f} exceeds cap ₹{max_cost_per_image_inr:.2f}."
                )
                logging.warning(
                    "Cost guard blocked image: estimated ₹%.2f exceeds cap ₹%.2f",
                    estimated_gemini_call_cost_inr,
                    max_cost_per_image_inr,
                )
                return record, False
            logging.info("[%s] step=gemini attempt=%s/%s model=%s safe_mode=%s", relative_posix, attempt_index, max_attempts, model, safe_mode)
            edited_image, api_calls_for_attempt = call_gemini_with_retries(
                client=client,
                model=model,
                prompt=build_prompt(
                    product_preservation_mode,
                    catalog_retouch_mode,
                    ghost_catalog_mode,
                    ghost_prompt_strength,
                    retry_feedback=retry_feedback,
                ),
                reference_image_path=resized_reference_path,
                input_image_path=resized_input_path,
                retries=retries,
            )
            gemini_called = True
            gemini_calls_made += api_calls_for_attempt
            record.gemini_calls_made = gemini_calls_made
            record.retries_used = max(0, gemini_calls_made - 1)
            if save_debug:
                save_debug_image_safe(edited_image, attempt_dir / "gemini_raw.png")

            logging.info("[%s] step=postprocess attempt=%s use_rembg=%s", relative_posix, attempt_index, use_rembg and postprocess_segment)
            cleanup = postprocess_gemini_output(
                edited_image=edited_image,
                role=role,
                final_size=final_size,
                bg_rgb=bg_rgb,
                product_scale=product_scale,
                top_product_scale=top_product_scale,
                vertical_center=vertical_center,
                safe_padding=safe_padding,
                postprocess_segment=postprocess_segment,
                use_rembg=use_rembg,
                skip_artifact_cleanup=skip_artifact_cleanup,
            )

            output_mask_for_analysis: Image.Image | None = None
            try:
                if save_debug:
                    if cleanup.debug_pre_cleanup is not None:
                        save_debug_image_safe(cleanup.debug_pre_cleanup, attempt_dir / "postprocess_before_cleanup.png")
                    if cleanup.debug_mask is not None:
                        save_debug_image_safe(cleanup.debug_mask, attempt_dir / "mask_debug.png")
                    if cleanup.debug_bbox is not None:
                        save_debug_image_safe(cleanup.debug_bbox, attempt_dir / "bbox_debug.png")
                    save_debug_image_safe(cleanup.image, attempt_dir / "final_candidate.png")

                record.detected_bbox = list(cleanup.bbox)
                record.rembg_succeeded = cleanup.rembg_succeeded
                record.artifacts_removed = cleanup.artifacts_removed
                record.final_product_scale = round(cleanup.final_scale, 4)

                logging.info("[%s] detected bbox=%s", relative_posix, tuple(record.detected_bbox))
                logging.info("[%s] rembg succeeded=%s", relative_posix, cleanup.rembg_succeeded)
                logging.info("[%s] artifacts removed=%s", relative_posix, cleanup.artifacts_removed)
                logging.info("[%s] final product scale=%.4f", relative_posix, cleanup.final_scale)

                output_mask_for_analysis, _ = generate_analysis_mask(
                    cleanup.debug_pre_cleanup if cleanup.debug_pre_cleanup is not None else cleanup.image,
                    bg_rgb,
                    use_rembg and postprocess_segment,
                )
                output_analysis_bbox = mask_bbox(output_mask_for_analysis)
                if output_analysis_bbox is None:
                    raise BatchProcessError("Output mask detection failed.")
                mismatch_report = reference_mismatch_report(
                    output_mask_for_analysis,
                    reference_analysis_mask,
                    output_analysis_bbox,
                    reference_bbox,
                    cleanup.final_scale,
                )
                threshold = reference_threshold_for_role(
                    role,
                    front_reference_mismatch_threshold,
                    back_reference_mismatch_threshold,
                    top_reference_mismatch_threshold,
                )
                quality_error = validate_final_output(
                    cleanup.image,
                    cleanup.raw_bbox if cleanup.raw_bbox is not None else cleanup.bbox,
                    cleanup.debug_pre_cleanup.size if cleanup.debug_pre_cleanup is not None else cleanup.image.size,
                    cleanup.final_scale,
                    bg_rgb,
                    fail_on_bad_bbox,
                )
                reference_error, reference_warning = assess_reference_match(
                    mismatch_report,
                    reject_if_reference_mismatch,
                    role=role,
                    mode=reference_mismatch_mode,
                    threshold=threshold,
                    is_generated_top=False,
                )
                record.reference_mismatch_score = mismatch_report["reference_mismatch_score"]
                record.reference_mismatch_threshold = threshold
                record.reference_mismatch_warning = reference_warning
                rejection_reason = quality_error or reference_error
                log_reference_match_decision(
                    product_folder=product_folder,
                    image_filename=image_path.name,
                    role=role,
                    reference_file=reference_path.as_posix(),
                    mismatch_report=mismatch_report,
                    threshold=threshold,
                    mode=reference_mismatch_mode,
                    accepted=rejection_reason is None,
                    reason=rejection_reason or reference_warning,
                )
                accepted = rejection_reason is None
                quality_report = {
                    "source_image_path": relative_posix,
                    "reference_path": reference_path.as_posix(),
                    "bbox": mismatch_report["bbox"],
                    "reference_bbox": mismatch_report["reference_bbox"],
                    "bbox_aspect_ratio": mismatch_report["bbox_aspect_ratio"],
                    "reference_aspect_ratio": mismatch_report["reference_aspect_ratio"],
                    "scale_used": round(cleanup.final_scale, 4),
                    "rembg_success": cleanup.rembg_succeeded,
                    "reference_mismatch_score": mismatch_report["reference_mismatch_score"],
                    "threshold": threshold,
                    "accepted": accepted,
                    "rejection_reason": rejection_reason,
                    "warning_reason": reference_warning,
                    "attempt": attempt_index,
                }
                try:
                    save_quality_report(attempt_dir / "quality_report.json", quality_report)
                except Exception as exc:
                    logging.warning(
                        "Debug quality report save failed for %s: %s",
                        (attempt_dir / "quality_report.json").as_posix(),
                        exc,
                    )

                if not accepted:
                    last_error = rejection_reason
                    record.status = "failed_reference_mismatch" if reference_error else "failed"
                    record.error = rejection_reason
                    record.quality_gate_passed = False
                    try:
                        update_results_quality_report(
                            output_root,
                            product_folder,
                            {
                                "filename": image_path.name,
                                "role": role,
                                "reference_used": reference_path.as_posix(),
                                "status": record.status,
                                "bbox": mismatch_report["bbox"],
                                "reference_bbox": mismatch_report["reference_bbox"],
                                "mismatch_score": mismatch_report["reference_mismatch_score"],
                                "threshold": threshold,
                                "warning_reason": reference_warning,
                                "rejection_reason": rejection_reason,
                            },
                        )
                    except Exception as exc:
                        logging.warning("Results quality report save failed for %s/%s: %s", product_folder, image_path.name, exc)
                    logging.error("[%s] attempt=%s rejected -> %s", relative_posix, attempt_index, rejection_reason)
                    safe_close_image(output_mask_for_analysis)
                    output_mask_for_analysis = None
                    safe_close_image(cleanup.debug_pre_cleanup if cleanup is not None else None)
                    safe_close_image(cleanup.debug_mask if cleanup is not None else None)
                    safe_close_image(cleanup.debug_bbox if cleanup is not None else None)
                    safe_close_image(cleanup.image if cleanup is not None else None)
                    safe_close_image(edited_image)
                    cleanup = None
                    edited_image = None
                    gc.collect()
                    continue

                logging.info("[%s] step=save-output", relative_posix)
                save_final_image(cleanup.image, output_path, quality)
                record.status = "success"
                record.quality_gate_passed = True
                record.gemini_calls_made = gemini_calls_made
                record.retries_used = max(0, gemini_calls_made - 1)
                try:
                    update_results_quality_report(
                        output_root,
                        product_folder,
                        {
                            "filename": image_path.name,
                            "role": role,
                            "reference_used": reference_path.as_posix(),
                            "status": record.status,
                            "bbox": mismatch_report["bbox"],
                            "reference_bbox": mismatch_report["reference_bbox"],
                            "mismatch_score": mismatch_report["reference_mismatch_score"],
                            "threshold": threshold,
                            "warning_reason": reference_warning,
                            "rejection_reason": None,
                        },
                    )
                except Exception as exc:
                    logging.warning("Results quality report save failed for %s/%s: %s", product_folder, image_path.name, exc)
                logging.info("[%s] final output -> %s", relative_posix, output_path.as_posix())
                logging.info("[%s] success -> %s", relative_posix, output_path.as_posix())
                safe_close_image(output_mask_for_analysis)
                return record, gemini_called
            finally:
                safe_close_image(output_mask_for_analysis)

        record.status = "failed"
        record.error = last_error or "All ghost-catalog attempts failed."
        record.quality_gate_passed = False
        record.gemini_calls_made = gemini_calls_made
        record.retries_used = max(0, gemini_calls_made - 1)
        return record, gemini_called
    except BillingCapError as exc:
        record.status = "failed"
        record.error = str(exc)
        logging.error("[%s] failed -> %s", relative_posix, record.error)
        if stop_on_gemini_quota_error:
            raise BillingCapStop(str(exc), record) from exc
        return record, False
    except BatchProcessError as exc:
        record.status = "failed"
        record.error = str(exc)
        logging.error("[%s] failed -> %s", relative_posix, record.error)
        try:
            update_results_quality_report(
                output_root,
                product_folder,
                {
                    "filename": image_path.name,
                    "role": role,
                    "reference_used": record.reference_file,
                    "status": record.status,
                    "bbox": record.detected_bbox,
                    "reference_bbox": None,
                    "mismatch_score": record.reference_mismatch_score,
                    "threshold": record.reference_mismatch_threshold,
                    "warning_reason": record.reference_mismatch_warning,
                    "rejection_reason": record.error,
                },
            )
        except Exception as report_exc:
            logging.warning("Results quality report save failed for %s/%s: %s", product_folder, image_path.name, report_exc)
        return record, False
    finally:
        safe_close_image(reference_analysis_mask)
        safe_close_image(cleanup.debug_pre_cleanup if cleanup is not None else None)
        safe_close_image(cleanup.debug_mask if cleanup is not None else None)
        safe_close_image(cleanup.debug_bbox if cleanup is not None else None)
        safe_close_image(cleanup.image if cleanup is not None else None)
        safe_close_image(edited_image)
        del cleanup
        del edited_image
        del reference_analysis_mask
        record.finished_at = utc_now()
        post_image_memory_cleanup(product_folder, image_path.name, reload_rembg_each_image)


def sync_manifest_with_preflight(
    processing_manifest: dict[str, Any],
    pending_log: dict[str, Any],
    args: argparse.Namespace,
) -> None:
    products = {item["product_folder"]: item for item in pending_log.get("products", [])}
    skipped_reasons = {item["product_folder"]: item["reason"] for item in pending_log.get("skipped_folders", [])}
    pending_by_product: dict[str, list[dict[str, Any]]] = {}
    for task in pending_log.get("pending_tasks", []):
        pending_by_product.setdefault(task["product_folder"], []).append(task)

    for product_name, summary in products.items():
        expected_outputs = summary.get("expected_outputs", [])
        pending_roles = {task["role"] for task in pending_by_product.get(product_name, [])}
        missing_outputs = [task["expected_output_path"] for task in pending_by_product.get(product_name, [])]
        successful_outputs = []
        for output in expected_outputs:
            role = detect_role(Path(output).name)
            if role is not None and role not in pending_roles and Path(output).exists():
                successful_outputs.append(output)

        output_status_per_role = {
            "front": "success" if summary.get("front_output_found") else ("missing" if summary.get("front_input_found") else "missing_input"),
            "back": "success" if summary.get("back_output_found") else ("missing" if summary.get("back_input_found") else "missing_input"),
            "top": "paused_top_processing" if args.pause_top_processing else "missing",
        }
        for task in pending_by_product.get(product_name, []):
            output_status_per_role[task["role"]] = "missing"

        front_ok = output_status_per_role["front"] == "success"
        back_ok = output_status_per_role["back"] == "success"
        if front_ok and back_ok:
            status = "success"
        elif output_status_per_role["front"] == "failed" or output_status_per_role["back"] == "failed":
            status = "failed"
        else:
            status = "partial"

        processing_manifest[product_name] = {
            "product_folder": product_name,
            "input_fingerprint": summary["input_fingerprint"],
            "input_files": summary["input_files"],
            "front_input_found": summary["front_input_found"],
            "back_input_found": summary["back_input_found"],
            "top_processing_paused": args.pause_top_processing,
            "expected_outputs": expected_outputs,
            "successful_outputs": successful_outputs,
            "missing_outputs": missing_outputs,
            "failed_outputs": processing_manifest.get(product_name, {}).get("failed_outputs", []),
            "skipped_outputs": [],
            "output_status_per_role": output_status_per_role,
            "status": status,
            "last_processed_timestamp": utc_now(),
            "gemini_standard_calls_used": processing_manifest.get(product_name, {}).get("gemini_standard_calls_used", 0),
            "batch_task_count_used": processing_manifest.get(product_name, {}).get("batch_task_count_used", 0),
            "estimated_cost_inr": processing_manifest.get(product_name, {}).get("estimated_cost_inr", 0.0),
            "failure_reasons": processing_manifest.get(product_name, {}).get("failure_reasons", {}),
            "selected_model_profile": args.model_profile,
            "selected_api_mode": args.api_mode,
            "skipped_reason": skipped_reasons.get(product_name),
        }


def run_standard_mode(
    args: argparse.Namespace,
    client: genai.Client | None,
    model: str,
    bg_rgb: tuple[int, int, int],
    input_root: Path,
    output_root: Path,
    cache_root: Path,
    debug_root: Path,
    references_dir: Path,
    log_path: Path,
    manifest_path: Path,
    processing_manifest: dict[str, Any],
    pending_log: dict[str, Any],
) -> int:
    configure_rembg_execution(args.use_gpu_if_available)
    if not args.use_rembg:
        logging.info("rembg segmentation: disabled by option")
    elif not args.postprocess_segment:
        logging.info("rembg segmentation: disabled because postprocess segmentation is off")
    else:
        logging.info("rembg segmentation: enabled, provider=%s", _REMBG_DEVICE_LABEL)

    pending_tasks = pending_log.get("pending_tasks", [])
    product_summaries = {item["product_folder"]: item for item in pending_log.get("products", [])}
    skipped_reasons = {item["product_folder"]: item["reason"] for item in pending_log.get("skipped_folders", [])}
    records: list[JobRecord] = []
    work_size = min(args.work_size, args.max_input_side)
    skipped_existing_count = 0
    skipped_cost_cap_count = 0
    processed_this_run = 0
    limited_task_count = 0
    total_images_generated = 0
    total_gemini_calls_used = 0
    estimated_total_spend = 0.0
    failed_outputs = 0
    front_outputs_processed = 0
    back_outputs_processed = 0
    top_outputs_paused = 0
    had_billing_error = False

    grouped_tasks: dict[str, list[dict[str, Any]]] = {}
    for task in pending_tasks:
        grouped_tasks.setdefault(task["product_folder"], []).append(task)

    try:
        for product_name, summary in product_summaries.items():
            logging.info("[product=%s] start", product_name)
            logging.info("[product=%s] front input found=%s", product_name, summary["front_input_found"])
            logging.info("[product=%s] back input found=%s", product_name, summary["back_input_found"])
            logging.info("[product=%s] front output found=%s", product_name, summary["front_output_found"])
            logging.info("[product=%s] back output found=%s", product_name, summary["back_output_found"])
            logging.info("[product=%s] top processing paused: %s", product_name, args.pause_top_processing)
            if args.pause_top_processing:
                top_outputs_paused += 1

            reason = skipped_reasons.get(product_name)
            if reason == "front_back_complete":
                logging.info("[product=%s] action taken: skipped_folder_front_back_complete", product_name)
            elif reason == "manifest_success_fingerprint_unchanged":
                logging.info("[product=%s] action taken: skipped_folder_front_back_complete", product_name)
            elif reason == "missing_front_input":
                logging.info("[product=%s] action taken: missing_front_input", product_name)
            elif reason == "missing_back_input":
                logging.info("[product=%s] action taken: missing_back_input", product_name)

            for task in grouped_tasks.get(product_name, []):
                if args.max_images_this_run > 0 and limited_task_count >= args.max_images_this_run:
                    break
                role = task["role"]
                logging.info("[product=%s] action taken: processing_%s", product_name, role)
                image_path = Path(task["input_file_path"])
                logging.info(
                    "[product=%s role=%s] source=%s reference=%s output=%s api_mode=%s gemini_call=%s estimated_cost=₹%.2f",
                    product_name,
                    role,
                    task["input_file_path"],
                    task["reference_file_path"],
                    task["expected_output_path"],
                    args.api_mode,
                    True,
                    selected_standard_cost_per_image(args, {"name": args.model_profile, **MODEL_PROFILES[args.model_profile]}),
                )
                try:
                    record, gemini_called = process_single_image(
                        client=client,
                        image_path=image_path,
                        input_root=input_root,
                        references_dir=references_dir,
                        output_root=output_root,
                        cache_root=cache_root,
                        debug_root=debug_root,
                        model=model,
                        work_size=work_size,
                        final_size=args.final_size,
                        bg_rgb=bg_rgb,
                        quality=args.quality,
                        retries=args.retries,
                        dry_run=args.dry_run,
                        safe_mode=args.safe_mode,
                        neutralize_cast=args.neutralize_cast,
                        postprocess_segment=args.postprocess_segment,
                        use_rembg=(args.use_rembg and args.postprocess_segment),
                        product_preservation_mode=args.product_preservation_mode,
                        catalog_retouch_mode=args.catalog_retouch_mode,
                        ghost_catalog_mode=args.ghost_catalog_mode,
                        ghost_prompt_strength=args.ghost_prompt_strength,
                        force_reprocess=args.force_reprocess,
                        gemini_retry_count=args.gemini_retry_count,
                        reject_if_reference_mismatch=args.reject_if_reference_mismatch,
                        reference_mismatch_mode=args.reference_mismatch_mode,
                        front_reference_mismatch_threshold=args.front_reference_mismatch_threshold,
                        back_reference_mismatch_threshold=args.back_reference_mismatch_threshold,
                        top_reference_mismatch_threshold=args.top_reference_mismatch_threshold,
                        stop_on_gemini_quota_error=args.stop_on_gemini_quota_error,
                        only_missing=args.only_missing,
                        cost_guard=args.cost_guard,
                        max_cost_per_image_inr=args.max_cost_per_image_inr,
                        estimated_gemini_call_cost_inr=selected_standard_cost_per_image(args, {"name": args.model_profile, **MODEL_PROFILES[args.model_profile]}),
                        disable_retries_if_cost_cap=args.disable_retries_if_cost_cap,
                        dry_run_cost=args.dry_run_cost,
                        skip_artifact_cleanup=(
                            args.skip_artifact_cleanup
                            if args.skip_artifact_cleanup is not None
                            else (args.safe_mode or args.product_preservation_mode or args.catalog_retouch_mode or args.ghost_catalog_mode)
                        ),
                        save_debug=args.save_debug,
                        reload_rembg_each_image=args.reload_rembg_each_image,
                        fail_on_bad_bbox=args.fail_on_bad_bbox,
                        product_scale=args.product_scale,
                        top_product_scale=args.top_product_scale,
                        vertical_center=args.vertical_center,
                        safe_padding=args.safe_padding,
                    )
                    records.append(record)
                    processed_this_run += 1
                    limited_task_count += 1
                    total_gemini_calls_used += record.gemini_calls_made
                    estimated_total_spend += record.estimated_cost_inr or 0.0
                    if record.status == "success":
                        total_images_generated += 1
                        if role == "front":
                            front_outputs_processed += 1
                        if role == "back":
                            back_outputs_processed += 1
                    if record.status in {"skipped", "skipped_only_missing"}:
                        skipped_existing_count += 1
                    if record.status == "skipped_cost_cap":
                        skipped_cost_cap_count += 1
                    if record.status in {"failed", "failed_reference_mismatch", "failed_generated_top_layout"}:
                        failed_outputs += 1
                    write_process_log(log_path, records)
                    if args.use_processing_manifest:
                        product_dir = input_root / product_name
                        fingerprint, input_files = product_input_fingerprint(product_dir)
                        expected_outputs = expected_outputs_for_product(
                            product_dir,
                            output_root,
                            args.generate_missing_top,
                            args.pause_top_processing,
                        )
                        product_records = [r for r in records if r.product_folder == product_name]
                        update_product_manifest_entry(
                            processing_manifest,
                            product_dir,
                            fingerprint,
                            input_files,
                            expected_outputs,
                            product_records,
                            selected_model_profile=args.model_profile,
                            selected_api_mode=args.api_mode,
                            pause_top_processing=args.pause_top_processing,
                        )
                        save_processing_manifest(manifest_path, processing_manifest)
                    if gemini_called and args.sleep_between > 0:
                        time.sleep(args.sleep_between)
                    if args.sleep_between_images > 0:
                        time.sleep(args.sleep_between_images)
                except BillingCapStop as exc:
                    had_billing_error = True
                    records.append(exc.record)
                    write_process_log(log_path, records)
                    failed_outputs += 1
                    break
            logging.info("[product=%s] done", product_name)
            if had_billing_error or (args.max_images_this_run > 0 and limited_task_count >= args.max_images_this_run):
                break
    finally:
        write_process_log(log_path, records)
        log_batch_summary(records, len(pending_tasks))
        if args.use_processing_manifest:
            save_processing_manifest(manifest_path, processing_manifest)
        logging.info("Batch safety summary:")
        logging.info("total product folders: %s", pending_log["total_product_folders_scanned"])
        logging.info("total output tasks discovered: %s", pending_log["total_pending_outputs"])
        logging.info("processed this run: %s", processed_this_run)
        logging.info("skipped existing: %s", skipped_existing_count)
        logging.info("skipped manifest success: %s", sum(1 for item in pending_log["skipped_folders"] if item["reason"] == "manifest_success_fingerprint_unchanged"))
        logging.info("skipped cost cap: %s", skipped_cost_cap_count)
        logging.info("failed: %s", failed_outputs)
        logging.info("Gemini calls made: %s", total_gemini_calls_used)
        logging.info("estimated spend: INR %.2f", estimated_total_spend)
        logging.info("manifest path: %s", manifest_path.as_posix())
        logging.info("front outputs processed: %s", front_outputs_processed)
        logging.info("back outputs processed: %s", back_outputs_processed)
        logging.info("top outputs paused: %s", top_outputs_paused)
        if client is not None:
            client.close()

    return 1 if had_billing_error else 0


def run_batch_mode(
    args: argparse.Namespace,
    client: genai.Client | None,
    pending_log: dict[str, Any],
    profile: dict[str, Any],
    batch_prepare_dir: Path,
    batch_jobs_manifest_path: Path,
    bg_rgb: tuple[int, int, int],
    processing_manifest_path: Path,
) -> int:
    if args.batch_action == "postprocess":
        logging.info("Batch postprocess runs after download metadata is available. No local outputs were changed.")
        return 0

    if args.batch_action in {"prepare", "run", "submit", "validate"}:
        batch_input_file, task_fingerprint, config_fingerprint = prepare_batch_input_file(
            args,
            pending_log,
            batch_prepare_dir,
            profile,
        )
        build_result = build_batch_payload(args, pending_log, batch_prepare_dir, profile, bg_rgb)
        tasks_preview_path, payload_preview_path, validation_report_path = save_batch_validation_outputs(batch_prepare_dir, build_result)
        if build_result.payload_type == "file":
            write_batch_jsonl(batch_input_file, build_result.jsonl_lines)
        logging.info("Prepared batch input file: %s", batch_input_file.as_posix())
        logging.info("Saved batch tasks preview: %s", tasks_preview_path.as_posix())
        logging.info("Saved batch payload preview: %s", payload_preview_path.as_posix())
        logging.info("Saved batch validation report: %s", validation_report_path.as_posix())
        log_batch_payload_summary(build_result)
        logging.info(
            "Batch submission plan: tasks=%s api_mode=%s model=%s estimated_per_image=₹%.2f estimated_total=₹%.2f",
            len(pending_log.get("pending_tasks", [])),
            args.api_mode,
            profile["model_id"],
            selected_batch_cost_per_image(args, profile),
            len(pending_log.get("pending_tasks", [])) * selected_batch_cost_per_image(args, profile),
        )
        if not build_result.validation_report.get("valid"):
            logging.error("Batch validation failed. Submission is blocked.")
            return 1
        jobs_manifest = load_batch_jobs_manifest(batch_jobs_manifest_path)
        existing_job = existing_batch_job_for_fingerprints(jobs_manifest, task_fingerprint, config_fingerprint)
        if existing_job is not None and not args.force_new_batch_job:
            logging.warning("Existing batch job found for same pending tasks/config: %s", existing_job.get("job_id"))
            logging.warning("Use --batch-action poll or --batch-action download")
            return 0
        if args.batch_action in {"prepare", "validate"}:
            return 0
        if args.cost_guard:
            batch_cost_per_image = selected_batch_cost_per_image(args, profile)
            if batch_cost_per_image > args.max_cost_per_image_inr:
                logging.warning(
                    "Cost guard blocked batch submission: estimated ₹%.2f exceeds cap ₹%.2f",
                    batch_cost_per_image,
                    args.max_cost_per_image_inr,
                )
                return 0
        if client is None:
            raise MissingApiKeyError("Batch submission requires GEMINI_API_KEY.")
        job_id, job_payload = submit_batch_job(client, batch_input_file, build_result, args, profile)
        jobs_manifest.setdefault("jobs", []).append(
            {
                **job_payload,
                "task_fingerprint": task_fingerprint,
                "config_fingerprint": config_fingerprint,
                "api_mode": "batch",
                "included_product_folders": sorted({task["product_folder"] for task in pending_log.get("pending_tasks", [])}),
                "included_output_tasks": pending_log.get("pending_tasks", []),
                "created_at": utc_now(),
                "last_checked_at": utc_now(),
                "estimated_cost": pending_log["estimated_batch_api_cost"],
            }
        )
        save_batch_jobs_manifest(batch_jobs_manifest_path, jobs_manifest)
        logging.info("Submitted batch job: %s", job_id)
        return 0

    if client is None:
        raise MissingApiKeyError("Batch polling/downloading requires GEMINI_API_KEY.")
    if args.batch_action == "poll":
        return poll_batch_jobs(client, batch_jobs_manifest_path, args.batch_id, processing_manifest_path)
    if args.batch_action == "inspect":
        if not args.batch_id:
            raise BatchProcessError("--batch-id is required for --batch-action inspect.")
        return inspect_batch_job(client, batch_jobs_manifest_path, batch_prepare_dir, args.batch_id)
    if args.batch_action == "download":
        return download_batch_jobs(client, batch_jobs_manifest_path, batch_prepare_dir)
    if args.batch_action == "selftest":
        return run_batch_selftest(client, profile, batch_prepare_dir)
    return 0


def main() -> int:
    configure_logging()
    args = parse_args()

    validation_errors = validate_args(args)
    if validation_errors:
        for error in validation_errors:
            logging.error("ERROR: %s", error)
        return 1

    references_dir = Path(args.references)
    input_root = Path(args.input)
    output_root = Path(args.output)
    cache_root = Path(args.cache)
    debug_root = Path("debug")
    log_path = Path("process_log.json")
    manifest_path = Path(PROCESSING_MANIFEST_FILE)
    pending_tasks_log_path = Path(PENDING_TASKS_LOG_FILE)
    batch_jobs_manifest_path = Path(BATCH_JOBS_MANIFEST_FILE)
    batch_prepare_dir = Path(BATCH_PREPARE_DIR)
    try:
        profile = selected_model_profile(args)
        if args.model == DEFAULT_MODEL and profile["model_id"] != DEFAULT_MODEL:
            args.model = profile["model_id"]
        model = effective_model(args, profile)
    except BatchProcessError as exc:
        logging.error("ERROR: %s", exc)
        return 1

    logging.info("Gemini model locked: %s", model)
    logging.info("Selected model profile: %s", profile["label"])
    if args.gemini_retry_count > 0:
        logging.warning(
            "Retries increase cost. Current estimated cost per image: ₹%.2f",
            (1 + args.gemini_retry_count) * selected_standard_cost_per_image(args, profile),
        )
        logging.warning("Warning: retry count above 0 may increase spend")
    if args.retries > 0:
        logging.warning("API retry count above 0 may increase spend. Recommended value is 0.")

    ensure_directories([references_dir, input_root, output_root, cache_root])
    if not input_root.exists():
        logging.error("ERROR: Input directory not found: %s", input_root.as_posix())
        return 1

    logging.info("Final background color locked to %s", FINAL_BACKGROUND_HEX)
    if args.bg_color != FINAL_BACKGROUND_HEX:
        logging.warning(
            "Ignoring requested background color %s. Final background color is locked to %s.",
            args.bg_color,
            FINAL_BACKGROUND_HEX,
        )
    try:
        bg_rgb = ImageColor.getrgb(FINAL_BACKGROUND_HEX)[:3]
    except ValueError:
        logging.error("ERROR: Invalid locked background color: %s", FINAL_BACKGROUND_HEX)
        return 1

    if args.reset_processing_manifest:
        logging.warning("Resetting processing manifest state without deleting outputs.")
    processing_manifest = load_processing_manifest(manifest_path, args.reset_processing_manifest) if args.use_processing_manifest else {}
    client: genai.Client | None = None
    try:
        batch_control_only = args.api_mode == "batch" and args.batch_action in {"poll", "inspect", "selftest", "download", "postprocess"}
        if batch_control_only:
            if args.batch_action != "postprocess":
                api_key = load_api_key()
                client = genai.Client(api_key=api_key)
            return run_batch_mode(
                args=args,
                client=client,
                pending_log={},
                profile=profile,
                batch_prepare_dir=batch_prepare_dir,
                batch_jobs_manifest_path=batch_jobs_manifest_path,
                bg_rgb=bg_rgb,
                processing_manifest_path=manifest_path,
            )

        pending_log = preflight_scan(
            args=args,
            input_root=input_root,
            output_root=output_root,
            references_dir=references_dir,
            processing_manifest=processing_manifest,
            pending_tasks_log_path=pending_tasks_log_path,
            profile=profile,
        )
        if args.use_processing_manifest:
            sync_manifest_with_preflight(processing_manifest, pending_log, args)
            save_processing_manifest(manifest_path, processing_manifest)

        if args.api_mode == "batch" and args.batch_action in {"prepare", "validate"}:
            args.model_profile = normalize_model_profile_name(args.model_profile or "") or args.model_profile
        else:
            chosen_profile, chosen_mode, confirmed = confirm_processing_mode(args, pending_log)
            if chosen_mode is None or chosen_profile is None or not confirmed:
                logging.info("Run cancelled before any paid work.")
                return 0
            args.model_profile = chosen_profile
            args.api_mode = chosen_mode
        profile = selected_model_profile(args)
        if args.model == DEFAULT_MODEL and profile["model_id"] != DEFAULT_MODEL:
            args.model = profile["model_id"]
        try:
            model = effective_model(args, profile)
        except BatchProcessError as exc:
            logging.error("ERROR: %s", exc)
            return 1

        estimated_cost_per_image = (
            selected_standard_cost_per_image(args, profile)
            if args.api_mode == "standard"
            else selected_batch_cost_per_image(args, profile)
        )
        print_selected_run_summary(pending_log, profile, args.api_mode, estimated_cost_per_image)
        if args.cost_guard and estimated_cost_per_image > args.max_cost_per_image_inr:
            logging.error(
                "Cost guard blocked selected configuration: estimated ₹%.2f exceeds cap ₹%.2f",
                estimated_cost_per_image,
                args.max_cost_per_image_inr,
            )
            return 1
        if args.api_mode == "batch" and batch_support_verification(profile) is None and args.yes:
            logging.warning("Batch support for this model could not be verified. Continuing because --yes true was provided.")

        if args.dry_run or args.dry_run_cost:
            logging.info("Dry run complete. No Gemini call, Batch API submission, rembg, or large image open occurred.")
            return 0

        if args.api_mode == "standard" or args.batch_action in {"submit", "run"}:
            api_key = load_api_key()
            client = genai.Client(api_key=api_key)

        if args.api_mode == "standard":
            return run_standard_mode(
                args=args,
                client=client,
                model=model,
                bg_rgb=bg_rgb,
                input_root=input_root,
                output_root=output_root,
                cache_root=cache_root,
                debug_root=debug_root,
                references_dir=references_dir,
                log_path=log_path,
                manifest_path=manifest_path,
                processing_manifest=processing_manifest,
                pending_log=pending_log,
            )
        return run_batch_mode(
            args=args,
            client=client,
            pending_log=pending_log,
            profile=profile,
            batch_prepare_dir=batch_prepare_dir,
            batch_jobs_manifest_path=batch_jobs_manifest_path,
            bg_rgb=bg_rgb,
            processing_manifest_path=manifest_path,
        )
    except MissingApiKeyError as exc:
        logging.error("ERROR: %s", exc)
        return 1
    finally:
        if client is not None:
            client.close()


if __name__ == "__main__":
    sys.exit(main())
