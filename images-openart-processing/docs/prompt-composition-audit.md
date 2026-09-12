# Runtime Prompt Composition Audit

Date: 2026-09-12

## Safety result

Runtime prompts are compiled from selected canonical sections and measured with Unicode code-point counting. The application safety ceiling is 28,000 characters, below OpenArt's 32,000-character limit. Prompts are never silently truncated; an over-limit prompt blocks Dry Run before any provider call.

## Prompt 01 before compilation

The provider rejection reported an original submitted length of **50,733 characters**. The preserved SQLite incident row for creation `uyy3oYQabXDT7wcV91l8` measures **48,768 Unicode code points**; both values are retained as evidence, and the provider-reported rejection value remains the authoritative incident figure.

The preserved row's exact code-point breakdown is:

| Component | Code points |
| --- | ---: |
| Product-source authority declaration, including heading and separators | 362 |
| `ENTITLED_IMAGE_RULES.md` label, content and separators | 9,384 |
| `ENTITLED_VISUAL_SYSTEM.md` label, content and separators | 9,432 |
| Selected numbered prompt label, content and separators | 29,232 |
| Presentation-reference limitation declaration, including heading and separators | 358 |
| **Persisted total** | **48,768** |

Current canonical source lengths are 10,284 (`ENTITLED_IMAGE_RULES.md`), 8,478 (`ENTITLED_VISUAL_SYSTEM.md`) and 29,205 (`01.txt`) code points. Dynamic filenames, SHA-256 values, local paths and provider metadata are not included in the runtime prompt; they remain job metadata. The old composition repeated source-of-truth and reference-separation instructions in the wrapper, both master files and Prompt 01. Prompt 01 also independently repeats sleeve, branding, background and final-rejection rules.

## Compiled result

The compiler keeps only Prompt 01-relevant rule sections, adds each role declaration once, removes duplicate section bodies and removes the source filenames/headings from the provider text. It retains the canonical source files unchanged.

| Prompt | Compiled code points |
| ---: | ---: |
| 01 | 25,717 |
| 02 | 11,375 |
| 03 | 11,238 |
| 04 | 11,309 |
| 05 | 12,002 |
| 06 | 16,099 |
| 07 | 14,905 |
| 08 | 23,679 |
| 09 | 11,105 |
| 10 | 12,583 |

All ten compiled prompts are below the 28,000-character application ceiling. Prompt 08 retains its explicit Prompt 01/front-back relationship. Prompt 10 retains its approved-product-image, measurement-source and official-logo dependency rules.

## Exact and semantic duplication removed

- Repeated source labels (`ENTITLED_IMAGE_RULES.md`, `ENTITLED_VISUAL_SYSTEM.md`) are not sent to OpenArt.
- Repeated wrapper and master declarations of product authority and presentation-reference limits are represented once by the runtime role sections, with the relevant canonical sections retained.
- Prompt sections unrelated to the selected output are omitted; for Prompt 01 this excludes the model, lifestyle, back-product, fabric-macro and size-chart workflows.
- The compiler no longer emits a section heading twice: parsed canonical section text excludes its heading before the compiler adds the normalized heading.
- `compactUnique` removes exact duplicate section bodies after whitespace normalization. Semantic overlap that is necessary to preserve garment authority is intentionally retained in concise form rather than silently deleting a safety rule.

