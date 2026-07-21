#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import shutil
import subprocess
import sys
import tempfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING, Any, Sequence
from urllib import error, parse, request

if TYPE_CHECKING:
    from PIL import Image


VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SUPPORTED_EXTENSIONS = VIDEO_EXTENSIONS | IMAGE_EXTENSIONS
FALLBACK_PAD_COLOR = (24, 24, 24)
PROJECT_ROOT = Path(__file__).resolve().parent
DEFAULT_INPUT_DIR = PROJECT_ROOT / "input"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "result"
TEMP_FRAMES_DIR = PROJECT_ROOT / "temp_ad_frames"
DEFAULT_OLLAMA_URL = "http://localhost:11434/v1/chat/completions"
DEFAULT_TEXT_MODEL = "llama3.2"
DEFAULT_VISION_MODEL = "llama3.2-vision"
DEFAULT_COPY_FORMATS = ("md", "json")
DEFAULT_BRAND_CONTEXT = """Brand: Entitled
Category: Premium men's fashion e-commerce store
Offer: Premium menswear brands at reasonable member pricing
Tone: Premium, confident, minimal, aspirational
Guidance:
- Avoid cheap-sounding language
- Avoid too much discount or sale language unless specifically requested
- Focus on authenticity, premium style, curated products, doorstep shopping, easy exchange, and confidence
"""


@dataclass(frozen=True)
class Variant:
    key: str
    cli_alias: str
    width: int
    height: int
    label: str


@dataclass(frozen=True)
class OllamaConfig:
    enabled: bool
    url: str
    text_model: str
    vision_model: str
    skip_vision: bool
    brand_name: str
    brand_context: str
    copy_output_formats: tuple[str, ...]


@dataclass(frozen=True)
class VideoDimensions:
    width: int
    height: int


VARIANTS = {
    "9x16_vertical": Variant(
        key="9x16_vertical",
        cli_alias="9x16",
        width=1080,
        height=1920,
        label="Instagram Reels / Stories / Facebook Reels",
    ),
    "4x5_feed": Variant(
        key="4x5_feed",
        cli_alias="4x5",
        width=1080,
        height=1350,
        label="Instagram Feed / Explore Feed",
    ),
    "1x1_square": Variant(
        key="1x1_square",
        cli_alias="1x1",
        width=1080,
        height=1080,
        label="Feed fallback / square creative testing",
    ),
}

VARIANT_ALIASES = {
    variant.cli_alias: variant for variant in VARIANTS.values()
} | {variant.key: variant for variant in VARIANTS.values()}


class ExporterError(Exception):
    pass


def pillow_image_module():
    try:
        from PIL import Image as pillow_image
    except ModuleNotFoundError as exc:
        raise ExporterError(
            "Missing required Python package: Pillow. Install it with: pip install -r requirements.txt"
        ) from exc
    return pillow_image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Export Meta-ready aspect ratio variants for image and video creatives "
            "using padding only, with optional local AI copy generation via Ollama."
        )
    )
    parser.add_argument(
        "input_path",
        nargs="?",
        default=str(DEFAULT_INPUT_DIR),
        help="Path to a supported file or folder. Defaults to the local input folder.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Regenerate outputs even if they already exist.",
    )
    parser.add_argument(
        "--variants",
        help=(
            "Comma-separated variant aliases to export. "
            "Supported values: 9x16, 4x5, 1x1."
        ),
    )
    parser.add_argument(
        "--generate-copy",
        action="store_true",
        help="Analyze the creative and generate Meta ad copy using local Ollama models.",
    )
    parser.add_argument(
        "--ollama-url",
        default=DEFAULT_OLLAMA_URL,
        help=f"Ollama chat completions endpoint. Default: {DEFAULT_OLLAMA_URL}",
    )
    parser.add_argument(
        "--text-model",
        default=DEFAULT_TEXT_MODEL,
        help=f"Text model for copy generation. Default: {DEFAULT_TEXT_MODEL}",
    )
    parser.add_argument(
        "--vision-model",
        default=DEFAULT_VISION_MODEL,
        help=f"Vision model for image/frame analysis. Default: {DEFAULT_VISION_MODEL}",
    )
    parser.add_argument(
        "--brand-name",
        default="Entitled",
        help="Brand name to use in prompts. Default: Entitled",
    )
    parser.add_argument(
        "--brand-context-file",
        help="Optional text file with additional brand context for copy generation.",
    )
    parser.add_argument(
        "--copy-output-format",
        default=",".join(DEFAULT_COPY_FORMATS),
        help="Comma-separated copy output formats: txt,json,md. Default: md,json",
    )
    parser.add_argument(
        "--skip-vision",
        action="store_true",
        help="Skip vision analysis and generate copy from filename and brand context only.",
    )
    return parser.parse_args()


def check_dependencies() -> None:
    if shutil.which("ffmpeg") is None:
        raise ExporterError(
            "Missing required tool: ffmpeg. Install FFmpeg and ensure 'ffmpeg' "
            "is available in PATH."
        )
    if shutil.which("ffprobe") is None:
        raise ExporterError(
            "Missing required tool: ffprobe. Install FFmpeg and ensure 'ffprobe' "
            "is available in PATH."
        )


def resolve_variants(raw: str | None) -> list[Variant]:
    if not raw:
        return list(VARIANTS.values())

    variants: list[Variant] = []
    seen: set[str] = set()
    for token in raw.split(","):
        normalized = token.strip().lower()
        variant = VARIANT_ALIASES.get(normalized)
        if variant is None:
            supported = ", ".join(sorted(VARIANT_ALIASES))
            raise ExporterError(
                f"Unsupported variant '{token}'. Supported values: {supported}."
            )
        if variant.key not in seen:
            seen.add(variant.key)
            variants.append(variant)
    return variants


def resolve_copy_formats(raw: str) -> tuple[str, ...]:
    allowed = {"txt", "json", "md"}
    formats: list[str] = []
    seen: set[str] = set()
    for token in raw.split(","):
        normalized = token.strip().lower()
        if not normalized:
            continue
        if normalized not in allowed:
            supported = ", ".join(sorted(allowed))
            raise ExporterError(
                f"Unsupported copy output format '{token}'. Supported values: {supported}."
            )
        if normalized not in seen:
            seen.add(normalized)
            formats.append(normalized)
    if not formats:
        raise ExporterError("At least one copy output format is required.")
    return tuple(formats)


def collect_inputs(input_path: Path) -> list[Path]:
    if not input_path.exists():
        raise ExporterError(f"Input path does not exist: {input_path}")

    if input_path.is_file():
        if input_path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            raise ExporterError(f"Unsupported file type: {input_path.name}")
        return [input_path]

    files = sorted(
        path
        for path in input_path.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )
    if not files:
        raise ExporterError(
            f"No supported media files found in folder: {input_path}"
        )
    return files


def output_root_for(input_path: Path) -> Path:
    _ = input_path
    return DEFAULT_OUTPUT_DIR


def safe_stem(path: Path) -> str:
    return path.stem.strip() or "untitled"


def has_transparency(image: Image.Image) -> bool:
    if image.mode in ("RGBA", "LA"):
        alpha = image.getchannel("A")
        return alpha.getextrema()[0] < 255
    if image.mode == "P" and "transparency" in image.info:
        return True
    return False


def detect_padding_color(image: Image.Image) -> tuple[int, int, int]:
    try:
        sample = image.convert("RGB")
        sample.thumbnail((256, 256))
        width, height = sample.size
        if width == 0 or height == 0:
            return FALLBACK_PAD_COLOR

        margin_x = max(1, width // 10)
        margin_y = max(1, height // 10)
        pixels = []
        rgb = sample.load()

        for y in range(height):
            for x in range(width):
                if (
                    x < margin_x
                    or x >= width - margin_x
                    or y < margin_y
                    or y >= height - margin_y
                ):
                    pixels.append(rgb[x, y])

        if not pixels:
            return FALLBACK_PAD_COLOR

        buckets = Counter(
            ((r // 16) * 16, (g // 16) * 16, (b // 16) * 16) for r, g, b in pixels
        )
        bucket, _ = buckets.most_common(1)[0]
        matches = [
            pixel
            for pixel in pixels
            if all(abs(pixel[i] - bucket[i]) <= 15 for i in range(3))
        ]
        if not matches:
            matches = pixels

        red = round(sum(pixel[0] for pixel in matches) / len(matches))
        green = round(sum(pixel[1] for pixel in matches) / len(matches))
        blue = round(sum(pixel[2] for pixel in matches) / len(matches))
        return (red, green, blue)
    except Exception:
        return FALLBACK_PAD_COLOR


def render_image_variant(
    source_path: Path,
    output_path: Path,
    variant: Variant,
    overwrite: bool,
) -> str:
    image_module = pillow_image_module()
    with image_module.open(source_path) as original:
        original.load()
        use_png = has_transparency(original)
        output_path = output_path.with_suffix(".png" if use_png else ".jpg")
        if output_path.exists() and not overwrite:
            return "skipped"

        pad_color = detect_padding_color(original)
        working = original.convert("RGBA") if use_png else original.convert("RGB")
        resized = working.copy()
        resized.thumbnail(
            (variant.width, variant.height),
            image_module.Resampling.LANCZOS,
        )

        canvas_mode = "RGBA" if use_png else "RGB"
        background = pad_color + ((255,) if use_png else ())
        canvas = image_module.new(
            canvas_mode,
            (variant.width, variant.height),
            background,
        )

        offset = (
            (variant.width - resized.width) // 2,
            (variant.height - resized.height) // 2,
        )
        canvas.paste(resized, offset, resized if use_png else None)

        if use_png:
            canvas.save(output_path, format="PNG", optimize=True)
        else:
            canvas.save(
                output_path,
                format="JPEG",
                optimize=True,
                quality=95,
                subsampling=0,
            )

    return "exported"


def extract_video_frame(video_path: Path) -> Image.Image | None:
    image_module = pillow_image_module()
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as temp_file:
        temp_path = Path(temp_file.name)

    try:
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            str(temp_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0 or not temp_path.exists():
            return None

        image = image_module.open(temp_path)
        image.load()
        return image
    finally:
        if temp_path.exists():
            temp_path.unlink()


def ffmpeg_color(color: tuple[int, int, int]) -> str:
    return f"#{color[0]:02x}{color[1]:02x}{color[2]:02x}"


def get_video_dimensions(video_path: Path) -> VideoDimensions:
    command = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height",
        "-of",
        "json",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "Unknown ffprobe error."
        raise ExporterError(
            f"Could not inspect video dimensions for '{video_path.name}': {stderr}"
        )

    try:
        streams = json.loads(result.stdout).get("streams", [])
        width = int(streams[0]["width"])
        height = int(streams[0]["height"])
    except (IndexError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise ExporterError(
            f"Could not read a valid video stream from '{video_path.name}'."
        ) from exc

    if width <= 0 or height <= 0:
        raise ExporterError(
            f"Video '{video_path.name}' has invalid dimensions: {width}x{height}."
        )
    return VideoDimensions(width=width, height=height)


def is_reels_fit(dimensions: VideoDimensions) -> bool:
    return dimensions.width * 16 == dimensions.height * 9


def render_video_variant(
    source_path: Path,
    output_path: Path,
    variant: Variant,
    overwrite: bool,
) -> str:
    if output_path.exists() and not overwrite:
        return "skipped"

    frame = extract_video_frame(source_path)
    pad_color = detect_padding_color(frame) if frame is not None else FALLBACK_PAD_COLOR
    color_value = ffmpeg_color(pad_color)
    filter_graph = (
        f"scale={variant.width}:{variant.height}:force_original_aspect_ratio=decrease,"
        f"pad={variant.width}:{variant.height}:(ow-iw)/2:(oh-ih)/2:color={color_value}"
    )

    command = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y" if overwrite else "-n",
        "-i",
        str(source_path),
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-vf",
        filter_graph,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        str(output_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        stderr = result.stderr.strip() or "Unknown ffmpeg error."
        raise ExporterError(
            f"ffmpeg failed for '{source_path.name}' -> '{variant.key}': {stderr}"
        )
    return "exported"


def ensure_export_dir(output_root: Path, source_path: Path) -> Path:
    export_dir = output_root / safe_stem(source_path)
    export_dir.mkdir(parents=True, exist_ok=True)
    return export_dir


def ensure_output_path(
    output_root: Path,
    source_path: Path,
    variant: Variant,
    extension: str,
) -> Path:
    export_dir = ensure_export_dir(output_root, source_path)
    return export_dir / f"{safe_stem(source_path)}_{variant.key}{extension}"


def image_output_extension(source_path: Path) -> str:
    image_module = pillow_image_module()
    with image_module.open(source_path) as image:
        image.load()
        return ".png" if has_transparency(image) else ".jpg"


def log(message: str) -> None:
    print(message, flush=True)


def load_brand_context(brand_context_file: str | None) -> str:
    if not brand_context_file:
        return DEFAULT_BRAND_CONTEXT

    path = Path(brand_context_file).expanduser().resolve()
    if not path.exists() or not path.is_file():
        raise ExporterError(f"Brand context file not found: {path}")
    return DEFAULT_BRAND_CONTEXT.rstrip() + "\n\nAdditional brand context:\n" + path.read_text(
        encoding="utf-8"
    ).strip()


def resolve_ollama_config(args: argparse.Namespace) -> OllamaConfig:
    return OllamaConfig(
        enabled=args.generate_copy,
        url=args.ollama_url.strip(),
        text_model=args.text_model.strip(),
        vision_model=args.vision_model.strip(),
        skip_vision=args.skip_vision,
        brand_name=args.brand_name.strip() or "Entitled",
        brand_context=load_brand_context(args.brand_context_file),
        copy_output_formats=resolve_copy_formats(args.copy_output_format),
    )


def data_uri_for_file(path: Path) -> str:
    suffix = path.suffix.lower()
    mime_map = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }
    mime = mime_map.get(suffix, "image/png")
    encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def extract_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if not text:
        raise ExporterError("Received empty response from Ollama.")
    try:
        parsed = json.loads(text)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ExporterError("Could not parse JSON from Ollama response.")
    try:
        parsed = json.loads(text[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ExporterError(f"Could not parse JSON from Ollama response: {exc}") from exc
    if not isinstance(parsed, dict):
        raise ExporterError("Ollama response JSON must be an object.")
    return parsed


def normalize_list(value: Any, expected_count: int) -> list[str]:
    if not isinstance(value, list):
        value = []
    cleaned = [str(item).strip() for item in value if str(item).strip()]
    return cleaned[:expected_count]


def ollama_api_tags_url(chat_url: str) -> str:
    parsed = parse.urlparse(chat_url)
    base_path = parsed.path
    if "/v1/" in base_path:
        base_path = base_path.split("/v1/")[0]
    base_path = base_path.rstrip("/")
    tags_path = f"{base_path}/api/tags" if base_path else "/api/tags"
    return parse.urlunparse(
        (parsed.scheme, parsed.netloc, tags_path, "", "", "")
    )


def check_ollama_available(
    ollama_url: str,
    text_model: str,
    vision_model: str,
    skip_vision: bool,
) -> dict[str, Any]:
    tags_url = ollama_api_tags_url(ollama_url)
    req = request.Request(tags_url, method="GET")
    try:
        with request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except error.URLError as exc:
        raise ExporterError(
            "Ollama is not running. Start it using: ollama serve"
        ) from exc
    except json.JSONDecodeError as exc:
        raise ExporterError(
            f"Unexpected response from Ollama tags endpoint: {tags_url}"
        ) from exc

    models = {
        item.get("name", "").split(":")[0]: item.get("name", "")
        for item in payload.get("models", [])
        if isinstance(item, dict) and item.get("name")
    }
    if text_model not in models:
        raise ExporterError(
            f"Model missing. Install using: ollama pull {text_model}"
        )

    vision_available = False
    vision_message = None
    if not skip_vision:
        if vision_model not in models:
            vision_message = f"Model missing. Install using: ollama pull {vision_model}"
        else:
            vision_available = True

    return {
        "text_available": True,
        "vision_available": vision_available,
        "vision_message": vision_message,
        "tags_url": tags_url,
    }


def post_ollama_chat(
    ollama_url: str,
    model: str,
    messages: list[dict[str, Any]],
) -> str:
    payload = {
        "model": model,
        "messages": messages,
        "temperature": 0.7,
        "stream": False,
    }
    req = request.Request(
        ollama_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=180) as response:
            raw = response.read().decode("utf-8")
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code == 404:
            raise ExporterError(
                f"Model missing. Install using: ollama pull {model}"
            ) from exc
        raise ExporterError(
            f"Ollama request failed with HTTP {exc.code}: {body}"
        ) from exc
    except error.URLError as exc:
        raise ExporterError(
            "Ollama is not running. Start it using: ollama serve"
        ) from exc

    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ExporterError("Received invalid JSON from Ollama.") from exc

    content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not content:
        raise ExporterError("Ollama returned an empty response.")
    return str(content)


def get_video_duration_seconds(video_path: Path) -> float | None:
    if shutil.which("ffprobe") is None:
        return None

    command = [
        "ffprobe",
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        return None
    try:
        duration = float(result.stdout.strip())
    except ValueError:
        return None
    return duration if duration > 0 else None


def extract_video_frames(video_path: Path) -> list[Path]:
    frame_dir = TEMP_FRAMES_DIR / safe_stem(video_path)
    if frame_dir.exists():
        shutil.rmtree(frame_dir)
    frame_dir.mkdir(parents=True, exist_ok=True)

    duration = get_video_duration_seconds(video_path)
    frame_points = (10, 30, 50, 70, 90)
    frame_paths: list[Path] = []
    for percent in frame_points:
        frame_path = frame_dir / f"{safe_stem(video_path)}_{percent}.jpg"
        timestamp = duration * (percent / 100) if duration else percent / 100
        command = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-ss",
            f"{timestamp:.3f}",
            "-i",
            str(video_path),
            "-vf",
            f"scale='min(1280,iw)':-2",
            "-frames:v",
            "1",
            str(frame_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode == 0 and frame_path.exists():
            frame_paths.append(frame_path)

    if not frame_paths:
        shutil.rmtree(frame_dir, ignore_errors=True)
    return frame_paths


def delete_temp_frames(frame_paths: Sequence[Path]) -> None:
    parents = {path.parent for path in frame_paths}
    for path in frame_paths:
        if path.exists():
            path.unlink()
    for parent in parents:
        if parent.exists():
            shutil.rmtree(parent, ignore_errors=True)


def fallback_creative_analysis(
    source_path: Path,
    variants: Sequence[Variant],
    reason: str | None = None,
) -> dict[str, Any]:
    placements = [variant.label for variant in variants]
    notes = []
    if reason:
        notes.append(reason)
    notes.append(
        "Copy was generated without successful vision analysis, so review the final messaging against the creative."
    )
    return {
        "creative_summary": (
            f"Creative file: {source_path.name}. No visual analysis was available, "
            "so generation relied on filename and brand context."
        ),
        "rating": {
            "score": 6,
            "reason": "Fallback estimate only because visual analysis was unavailable."
        },
        "best_use_placements": placements,
        "notes": notes,
        "vision_used": False,
    }


def analyze_creative_with_ollama(
    source_path: Path,
    ollama_config: OllamaConfig,
    variants: Sequence[Variant],
    vision_available: bool,
) -> dict[str, Any]:
    if ollama_config.skip_vision or not vision_available:
        reason = (
            "Vision analysis skipped by configuration."
            if ollama_config.skip_vision
            else "Vision model unavailable."
        )
        return fallback_creative_analysis(source_path, variants, reason)

    if source_path.suffix.lower() in VIDEO_EXTENSIONS:
        frame_paths = extract_video_frames(source_path)
        if not frame_paths:
            return fallback_creative_analysis(
                source_path,
                variants,
                "Video frame extraction failed, so vision analysis was skipped.",
            )
        visual_assets = frame_paths
    else:
        visual_assets = [source_path]

    prompt = (
        "Analyze this ad creative for Meta ads and return valid JSON only.\n"
        "Required JSON keys:\n"
        "- creative_summary: string\n"
        "- rating: object with score integer 1-10 and reason string\n"
        "- best_use_placements: array of 3 strings\n"
        "- notes: array of 3-6 strings about any issues or observations\n"
        "Keep the analysis concise, practical, and premium-oriented."
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    for asset in visual_assets:
        content.append(
            {"type": "image_url", "image_url": {"url": data_uri_for_file(asset)}}
        )

    try:
        raw = post_ollama_chat(
            ollama_config.url,
            ollama_config.vision_model,
            [{"role": "user", "content": content}],
        )
        parsed = extract_json_object(raw)
    except ExporterError as exc:
        return fallback_creative_analysis(source_path, variants, str(exc))
    finally:
        if source_path.suffix.lower() in VIDEO_EXTENSIONS:
            delete_temp_frames(visual_assets)

    rating = parsed.get("rating", {})
    score = rating.get("score", 6)
    reason = str(rating.get("reason", "")).strip() or "No reasoning provided."
    try:
        score = int(score)
    except (TypeError, ValueError):
        score = 6
    score = max(1, min(10, score))

    best_use_placements = normalize_list(parsed.get("best_use_placements"), 3)
    if not best_use_placements:
        best_use_placements = [variant.label for variant in variants[:3]]

    notes = normalize_list(parsed.get("notes"), 6)
    if not notes:
        notes = ["No specific creative issues were detected by the vision pass."]

    creative_summary = str(parsed.get("creative_summary", "")).strip()
    if not creative_summary:
        creative_summary = f"Creative file: {source_path.name}."

    return {
        "creative_summary": creative_summary,
        "rating": {"score": score, "reason": reason},
        "best_use_placements": best_use_placements,
        "notes": notes,
        "vision_used": True,
    }


def build_copy_prompt(
    source_path: Path,
    analysis: dict[str, Any],
    ollama_config: OllamaConfig,
) -> str:
    return f"""You are writing premium Meta ad copy for the brand {ollama_config.brand_name}.

Brand context:
{ollama_config.brand_context}

Creative file name: {source_path.name}
Creative analysis summary: {analysis["creative_summary"]}
Creative rating: {analysis["rating"]["score"]}/10
Creative rating reason: {analysis["rating"]["reason"]}
Best use placements: {", ".join(analysis["best_use_placements"])}
Notes: {" | ".join(analysis["notes"])}

Rules:
- Meta ads compatible
- Primary text should be short to medium length
- Headlines should be under 40 characters where possible
- Descriptions should be under 60 characters where possible
- Avoid false claims
- Avoid overpromising
- Avoid emojis unless explicitly requested
- Keep it sales-focused but premium
- Do not mention AI
- Do not say "luxury for cheap"
- Avoid cringe lines
- Keep English polished

Return valid JSON only with exactly these keys:
- creative_summary: string
- rating: object with score integer 1-10 and reason string
- best_use_placements: array of 3 strings
- primary_text_options: array of 10 strings
- headlines: array of 10 strings
- descriptions: array of 10 strings
- cta_recommendations: array of 5 strings
- best_angle_recommendations: array of 3 strings
- audience_suggestions: array of 3 strings
- hook_suggestions: array of 3 strings
- notes: array of 3-6 strings
"""


def ensure_copy_schema(
    generated: dict[str, Any],
    analysis: dict[str, Any],
) -> dict[str, Any]:
    result = {
        "creative_summary": str(
            generated.get("creative_summary") or analysis["creative_summary"]
        ).strip(),
        "rating": analysis["rating"],
        "best_use_placements": normalize_list(
            generated.get("best_use_placements") or analysis["best_use_placements"], 3
        ),
        "primary_text_options": normalize_list(
            generated.get("primary_text_options"), 10
        ),
        "headlines": normalize_list(generated.get("headlines"), 10),
        "descriptions": normalize_list(generated.get("descriptions"), 10),
        "cta_recommendations": normalize_list(
            generated.get("cta_recommendations"), 5
        ),
        "best_angle_recommendations": normalize_list(
            generated.get("best_angle_recommendations"), 3
        ),
        "audience_suggestions": normalize_list(
            generated.get("audience_suggestions"), 3
        ),
        "hook_suggestions": normalize_list(generated.get("hook_suggestions"), 3),
        "notes": normalize_list(generated.get("notes") or analysis["notes"], 6),
    }

    rating = generated.get("rating")
    if isinstance(rating, dict):
        score = rating.get("score", analysis["rating"]["score"])
        reason = str(rating.get("reason", analysis["rating"]["reason"])).strip()
        try:
            score = int(score)
        except (TypeError, ValueError):
            score = analysis["rating"]["score"]
        result["rating"] = {
            "score": max(1, min(10, score)),
            "reason": reason or analysis["rating"]["reason"],
        }

    required_lengths = {
        "primary_text_options": 10,
        "headlines": 10,
        "descriptions": 10,
        "cta_recommendations": 5,
        "best_angle_recommendations": 3,
        "audience_suggestions": 3,
        "hook_suggestions": 3,
    }
    for key, required in required_lengths.items():
        if len(result[key]) < required:
            raise ExporterError(
                f"Ollama returned too few items for '{key}'. Expected {required}, got {len(result[key])}."
            )

    if len(result["best_use_placements"]) < 3:
        fallback = analysis["best_use_placements"]
        result["best_use_placements"] = (result["best_use_placements"] + fallback)[:3]
    if not result["notes"]:
        result["notes"] = analysis["notes"]

    return result


def generate_meta_copy_with_ollama(
    source_path: Path,
    analysis: dict[str, Any],
    ollama_config: OllamaConfig,
) -> dict[str, Any]:
    prompt = build_copy_prompt(source_path, analysis, ollama_config)
    raw = post_ollama_chat(
        ollama_config.url,
        ollama_config.text_model,
        [{"role": "user", "content": prompt}],
    )
    parsed = extract_json_object(raw)
    return ensure_copy_schema(parsed, analysis)


def format_numbered_lines(values: Sequence[str]) -> str:
    return "\n".join(f"{index}. {value}" for index, value in enumerate(values, start=1))


def render_copy_markdown(source_path: Path, copy_data: dict[str, Any]) -> str:
    return f"""# Meta Ad Copy - {safe_stem(source_path)}

## Creative Summary
{copy_data["creative_summary"]}

## Rating
{copy_data["rating"]["score"]}/10 - {copy_data["rating"]["reason"]}

## Best Use Placements
{format_numbered_lines(copy_data["best_use_placements"])}

## Primary Text - 10 Options
{format_numbered_lines(copy_data["primary_text_options"])}

## Headlines - 10 Options
{format_numbered_lines(copy_data["headlines"])}

## Descriptions - 10 Options
{format_numbered_lines(copy_data["descriptions"])}

## CTA Recommendations
{format_numbered_lines(copy_data["cta_recommendations"])}

## Best Ad Angles
{format_numbered_lines(copy_data["best_angle_recommendations"])}

## Audience Suggestions
{format_numbered_lines(copy_data["audience_suggestions"])}

## Hook Suggestions
{format_numbered_lines(copy_data["hook_suggestions"])}

## Notes
{format_numbered_lines(copy_data["notes"])}
"""


def render_copy_text(source_path: Path, copy_data: dict[str, Any]) -> str:
    return f"""Meta Ad Copy - {safe_stem(source_path)}

Creative Summary
{copy_data["creative_summary"]}

Rating
{copy_data["rating"]["score"]}/10 - {copy_data["rating"]["reason"]}

Best Use Placements
{format_numbered_lines(copy_data["best_use_placements"])}

Primary Text - 10 Options
{format_numbered_lines(copy_data["primary_text_options"])}

Headlines - 10 Options
{format_numbered_lines(copy_data["headlines"])}

Descriptions - 10 Options
{format_numbered_lines(copy_data["descriptions"])}

CTA Recommendations
{format_numbered_lines(copy_data["cta_recommendations"])}

Best Ad Angles
{format_numbered_lines(copy_data["best_angle_recommendations"])}

Audience Suggestions
{format_numbered_lines(copy_data["audience_suggestions"])}

Hook Suggestions
{format_numbered_lines(copy_data["hook_suggestions"])}

Notes
{format_numbered_lines(copy_data["notes"])}
"""


def copy_output_paths(
    export_dir: Path,
    source_path: Path,
    formats: Sequence[str],
) -> dict[str, Path]:
    stem = safe_stem(source_path)
    return {
        fmt: export_dir / f"{stem}_meta_ad_copy.{fmt}"
        for fmt in formats
    }


def save_copy_outputs(
    export_dir: Path,
    source_path: Path,
    copy_data: dict[str, Any],
    formats: Sequence[str],
    overwrite: bool,
) -> str:
    output_paths = copy_output_paths(export_dir, source_path, formats)
    if not overwrite and all(path.exists() for path in output_paths.values()):
        return "skipped"

    for fmt, path in output_paths.items():
        if path.exists() and not overwrite:
            continue
        if fmt == "md":
            path.write_text(render_copy_markdown(source_path, copy_data), encoding="utf-8")
        elif fmt == "txt":
            path.write_text(render_copy_text(source_path, copy_data), encoding="utf-8")
        elif fmt == "json":
            path.write_text(json.dumps(copy_data, indent=2), encoding="utf-8")
    return "exported"


def maybe_generate_copy(
    source_path: Path,
    export_dir: Path,
    variants: Sequence[Variant],
    overwrite: bool,
    ollama_config: OllamaConfig,
    ollama_status: dict[str, Any] | None,
) -> tuple[int, int, int]:
    if not ollama_config.enabled:
        return (0, 0, 0)

    output_paths = copy_output_paths(
        export_dir, source_path, ollama_config.copy_output_formats
    )
    if not overwrite and all(path.exists() for path in output_paths.values()):
        log("  [COPY] [SKIP] Copy outputs already exist")
        return (0, 1, 0)

    if ollama_status is None:
        log("  [COPY] [FAIL] Ollama status unavailable")
        return (0, 0, 1)
    if ollama_status.get("error"):
        log(f"  [COPY] [FAIL] {ollama_status['error']}")
        return (0, 0, 1)

    try:
        analysis = analyze_creative_with_ollama(
            source_path=source_path,
            ollama_config=ollama_config,
            variants=variants,
            vision_available=bool(ollama_status.get("vision_available")),
        )
        if not ollama_status.get("vision_available") and ollama_status.get("vision_message"):
            log(f"  [COPY] [INFO] {ollama_status['vision_message']}")

        copy_data = generate_meta_copy_with_ollama(
            source_path=source_path,
            analysis=analysis,
            ollama_config=ollama_config,
        )
        result = save_copy_outputs(
            export_dir=export_dir,
            source_path=source_path,
            copy_data=copy_data,
            formats=ollama_config.copy_output_formats,
            overwrite=overwrite,
        )
        if result == "skipped":
            log("  [COPY] [SKIP] Copy outputs already exist")
            return (0, 1, 0)
        log("  [COPY] [OK] Generated copy outputs")
        return (1, 0, 0)
    except Exception as exc:
        log(f"  [COPY] [FAIL] {exc}")
        return (0, 0, 1)


def process_source(
    source_path: Path,
    output_root: Path,
    variants: Sequence[Variant],
    overwrite: bool,
    ollama_config: OllamaConfig,
    ollama_status: dict[str, Any] | None,
) -> dict[str, int]:
    exported = skipped = failed = 0
    copy_exported = copy_skipped = copy_failed = 0
    kind = "video" if source_path.suffix.lower() in VIDEO_EXTENSIONS else "image"
    image_extension = image_output_extension(source_path) if kind == "image" else None
    export_dir = ensure_export_dir(output_root, source_path)

    log(f"[FILE] Processing {source_path.name} ({kind})")
    reels_fit = False
    if kind == "video":
        try:
            dimensions = get_video_dimensions(source_path)
            reels_fit = is_reels_fit(dimensions)
            reels_status = "valid" if reels_fit else "needs a 9x16 variant"
            log(
                f"  [REELS CHECK] {dimensions.width}x{dimensions.height}: "
                f"{reels_status}"
            )
        except Exception as exc:
            failed += 1
            log(f"  [REELS CHECK] [FAIL] {exc}")
            return {
                "exported": exported,
                "skipped": skipped,
                "failed": failed,
                "copy_exported": copy_exported,
                "copy_skipped": copy_skipped,
                "copy_failed": copy_failed,
            }

    for variant in variants:
        if kind == "video" and variant.key == "9x16_vertical" and reels_fit:
            skipped += 1
            log(
                "  [VARIANT] 9x16_vertical [SKIP] "
                "Source video is already valid for Reels"
            )
            continue

        extension = ".mp4" if kind == "video" else image_extension
        output_path = ensure_output_path(output_root, source_path, variant, extension)
        log(
            f"  [VARIANT] {variant.key} -> {output_path.name} "
            f"({variant.width}x{variant.height})"
        )
        try:
            if kind == "video":
                result = render_video_variant(source_path, output_path, variant, overwrite)
            else:
                result = render_image_variant(source_path, output_path, variant, overwrite)

            if result == "exported":
                exported += 1
                log("    [OK] Exported")
            else:
                skipped += 1
                log("    [SKIP] Already exists")
        except Exception as exc:
            failed += 1
            log(f"    [FAIL] {exc}")

    if ollama_config.enabled:
        log("  [COPY] Generating Meta ad copy")
        c_exported, c_skipped, c_failed = maybe_generate_copy(
            source_path=source_path,
            export_dir=export_dir,
            variants=variants,
            overwrite=overwrite,
            ollama_config=ollama_config,
            ollama_status=ollama_status,
        )
        copy_exported += c_exported
        copy_skipped += c_skipped
        copy_failed += c_failed

    return {
        "exported": exported,
        "skipped": skipped,
        "failed": failed,
        "copy_exported": copy_exported,
        "copy_skipped": copy_skipped,
        "copy_failed": copy_failed,
    }


def main() -> int:
    args = parse_args()

    try:
        check_dependencies()
        input_path = Path(args.input_path).expanduser().resolve()
        variants = resolve_variants(args.variants)
        sources = collect_inputs(input_path)
        output_root = output_root_for(input_path)
        output_root.mkdir(parents=True, exist_ok=True)
        ollama_config = resolve_ollama_config(args)
    except ExporterError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    ollama_status: dict[str, Any] | None = None
    if ollama_config.enabled:
        try:
            ollama_status = check_ollama_available(
                ollama_url=ollama_config.url,
                text_model=ollama_config.text_model,
                vision_model=ollama_config.vision_model,
                skip_vision=ollama_config.skip_vision,
            )
        except ExporterError as exc:
            log(f"[COPY] {exc}")
            ollama_status = {"error": str(exc)}

    totals = {
        "exported": 0,
        "skipped": 0,
        "failed": 0,
        "copy_exported": 0,
        "copy_skipped": 0,
        "copy_failed": 0,
    }

    for source_path in sources:
        result = process_source(
            source_path=source_path,
            output_root=output_root,
            variants=variants,
            overwrite=args.overwrite,
            ollama_config=ollama_config,
            ollama_status=ollama_status,
        )
        for key, value in result.items():
            totals[key] += value

    log("")
    log("Summary")
    log(f"  Exported: {totals['exported']}")
    log(f"  Skipped: {totals['skipped']}")
    log(f"  Failed: {totals['failed']}")
    if ollama_config.enabled:
        log(f"  Copy Exported: {totals['copy_exported']}")
        log(f"  Copy Skipped: {totals['copy_skipped']}")
        log(f"  Copy Failed: {totals['copy_failed']}")
    log(f"  Output: {output_root}")

    has_failures = totals["failed"] > 0 or totals["copy_failed"] > 0
    return 0 if not has_failures else 2


if __name__ == "__main__":
    sys.exit(main())
