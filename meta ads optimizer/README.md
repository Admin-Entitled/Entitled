# meta_aspect_ratio_exporter

Local Python CLI for:

- exporting Meta-ready aspect ratio variants with padding only
- optionally analyzing creatives with local AI through Ollama
- generating Meta ad copy without Gemini or any paid API

Everything runs locally on Ubuntu.

## What it does

Supported inputs:

- Video: `.mp4`, `.mov`, `.mkv`, `.webm`
- Image: `.jpg`, `.jpeg`, `.png`, `.webp`

Aspect-ratio exports:

- `9x16_vertical` -> `1080x1920`
- `4x5_feed` -> `1080x1350`
- `1x1_square` -> `1080x1080`

Rules:

- videos are checked for an exact `9:16` portrait aspect ratio before exporting
- a video that already fits Reels is reused as-is instead of generating another `9x16` file
- other requested variants are still generated
- no cropping
- no blur background
- no AI editing
- no color or content changes
- padding only
- video duration preserved
- original audio preserved when present

Optional copy generation with `--generate-copy`:

- 10 Meta Primary Text options
- 10 Headlines
- 10 Descriptions
- 5 CTA recommendations
- 3 best angle recommendations
- 3 audience suggestions
- 3 hook suggestions
- 1 short creative review with score out of 10

## Requirements

- Python 3.10+
- `ffmpeg`
- Ollama for local AI copy generation

Install FFmpeg on Ubuntu:

```bash
sudo apt update
sudo apt install ffmpeg
```

## Installation

```bash
cd "meta ads optimizer"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Install Ollama

Install Ollama locally, then start it:

```bash
ollama serve
```

If Ollama is not running, the script will show:

```text
Ollama is not running. Start it using: ollama serve
```

## Pull models

Required text model:

```bash
ollama pull llama3.2
```

Recommended vision model:

```bash
ollama pull llama3.2-vision
```

Alternative vision model:

```bash
ollama pull llava
```

If a model is missing, the script will show:

```text
Model missing. Install using: ollama pull MODEL_NAME
```

## Project folders

- Put source files in `input/`
- Exports are written to `result/`
- Temporary video frames for AI analysis are stored in `temp_ad_frames/`

## Usage

Process the default `input/` folder:

```bash
python3 meta_aspect_ratio_exporter.py
```

Process a single file:

```bash
python3 meta_aspect_ratio_exporter.py "input/Ads 07.mp4"
```

Process a folder:

```bash
python3 meta_aspect_ratio_exporter.py "./ads_folder"
```

Overwrite existing exports:

```bash
python3 meta_aspect_ratio_exporter.py "./ads_folder" --overwrite
```

Export selected variants only:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --variants 9x16,4x5
```

Generate Meta ad copy with local AI:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --generate-copy
```

Generate copy with selected variants:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --variants 9x16,4x5 --generate-copy
```

Skip vision and use filename plus brand context only:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --generate-copy --skip-vision
```

Use a custom brand context file:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --generate-copy --brand-context-file brand_context.txt
```

Use custom Ollama models:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --generate-copy --text-model llama3.2 --vision-model llava
```

Choose copy output formats:

```bash
python3 meta_aspect_ratio_exporter.py "Ads 07.mp4" --generate-copy --copy-output-format md,json,txt
```

Supported `--variants` values:

- `9x16`
- `4x5`
- `1x1`

Supported `--copy-output-format` values:

- `md`
- `json`
- `txt`

## Brand context

Default brand context is built in for Entitled:

- Brand: Entitled
- Premium men's fashion e-commerce store
- Premium menswear brands at reasonable member pricing
- Tone: premium, confident, minimal, aspirational
- Avoid cheap-sounding language
- Avoid too much discount or sale language unless specifically requested
- Focus on authenticity, premium style, curated products, doorstep shopping, easy exchange, and confidence

If `--brand-context-file` is provided, that file is appended to the built-in Entitled context.

## Output structure

```text
result/
  Ads 07/
    Ads 07_9x16_vertical.mp4
    Ads 07_4x5_feed.mp4
    Ads 07_1x1_square.mp4
    Ads 07_meta_ad_copy.md
    Ads 07_meta_ad_copy.json
    Ads 07_meta_ad_copy.txt
```

For images:

- exports `.png` if the original has transparency
- exports `.jpg` otherwise

## Markdown copy output

The generated Markdown file includes:

- Creative Summary
- Rating
- Best Use Placements
- Primary Text - 10 Options
- Headlines - 10 Options
- Descriptions - 10 Options
- CTA Recommendations
- Best Ad Angles
- Audience Suggestions
- Hook Suggestions
- Notes

## Notes

- Existing aspect-ratio outputs in `result/` are skipped by default.
- Existing copy output files are also skipped by default.
- Use `--overwrite` to regenerate files.
- Video analysis extracts 5 frames at 10%, 30%, 50%, 70%, and 90% of the video when vision is enabled.
- If vision analysis fails, the script continues with text-only generation using filename and brand context.
- This tool uses local AI only through Ollama.
- It does not call Gemini.
- It does not call OpenAI API.
- It does not use paid APIs.
