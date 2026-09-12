export interface RuntimePromptSection {
  name: string;
  source: 'rules' | 'visual' | 'numbered' | 'wrapper';
  characters: number;
}

export interface CompiledProviderPrompt {
  prompt: string;
  length: number;
  sections: RuntimePromptSection[];
  omittedSections: string[];
}

export const RUNTIME_PROMPT_SAFETY_CEILING = 28_000;

const BASE_RULES = [
  [
    'PRODUCT-SOURCE AUTHORITY',
    'Actual product photographs are the sole authority for garment identity and design. Preserve the exact SKU, category, colour and undertone, silhouette, proportions, neckline, collar, placket, buttons, sleeves, seams, hems, fabric, artwork, branding, labels, trims and construction. Never replace the product with a garment from the presentation reference.',
  ],
  [
    'PRESENTATION-REFERENCE LIMITATION',
    'Image 1 is a presentation reference only. Use it only for composition, camera angle, framing, garment placement, lighting, shadow, background appearance, spacing, and folding or pose arrangement. Image 2 and the remaining product photographs are the sole source of truth for the actual garment. Never transfer garment identity, colour, design, branding, fabric or construction from Image 1.',
  ],
  [
    'GARMENT PREPARATION',
    'Present the garment professionally steam-ironed. Remove transport wrinkles, packaging creases and temporary presentation defects without changing construction, proportions, fabric character, branding or genuine details.',
  ],
  [
    'OUTPUT CONTRACT',
    'Generate exactly one image. No collage, caption, border, watermark, props, hanger, mannequin or invented text. When the catalogue target applies, use exact background #EDEBE8 / RGB (237,235,232) / sRGB.',
  ],
] as const;

const RULE_SECTIONS = [
  '## 2. PRODUCT IDENTITY LOCK — ABSOLUTE',
  '## 3. SOURCE OF TRUTH',
  '## 5. COLOR LOCK — ABSOLUTE',
  '## 6. PROPORTION LOCK',
  '## 7. SLEEVE LOCK',
  '## 8. LOGO / GRAPHIC / BRANDING LOCK — ABSOLUTE',
  '## 9. LABEL LOCK',
  '## 10. FABRIC LOCK',
  '## 11. CONSTRUCTION LOCK',
  '## 13. BACKGROUND LOCK',
  '## 19. REFERENCE IMAGE SEPARATION',
  '## 22. OUTPUT CLEANLINESS',
] as const;

const VISUAL_SECTIONS = [
  '## 4. CORE COLOR SYSTEM',
  '## 5. BACKGROUND LANGUAGE',
  '## 6. LIGHTING SYSTEM',
  '## 7. COMPOSITION SYSTEM',
  '## 8. PRODUCT PHOTOGRAPHY STYLE',
] as const;

const PROMPT_SECTIONS: Record<number, string[]> = {
  1: [
    '01 — ISOLATED FRONT PRODUCT / T-SHIRT OR POLO T-SHIRT',
    'CATEGORY AUTO-DETECTION',
    'VISUAL REFERENCE PRIORITY — ABSOLUTE',
    'PRESENTATION',
    'SLEEVE PRESENTATION — ABSOLUTE / NON-NEGOTIABLE',
    'SHORT-SLEEVE GEOMETRY LOCK — ABSOLUTE',
    'PRIMARY SLEEVE FOLD — STRAIGHT PRESSED EDGE / ABSOLUTE',
    'FOLD GEOMETRY — NON-NEGOTIABLE',
    'STRAIGHT-LINE ENDPOINT LOCK',
    'RULER TEST — ABSOLUTE',
    'FOLD CONSTRUCTION — PHYSICALLY REALISTIC',
    'ARMHOLE CURVE VS PRESENTATION FOLD — CRITICAL DISTINCTION',
    'LEFT / RIGHT MIRROR LOCK — ABSOLUTE',
    'T-SHIRT LOCK',
    'POLO LOCK',
    'BRANDING AND ARTWORK PROTECTION — ABSOLUTE VISUAL LOCK',
    'BACKGROUND — ABSOLUTE COLOUR LOCK',
    'LIGHTING',
    'FRAMING',
    'REALISM',
    'FINAL REJECTION CHECK',
    'FINAL SLEEVE ACCEPTANCE RULE — ABSOLUTE',
  ],
  2: [
    '02 — PREMIUM FOLDED PRODUCT HERO / T-SHIRT OR POLO T-SHIRT',
    'COMPOSITION',
    'STYLE',
    'SURFACE AND BACKGROUND',
    'LIGHTING',
    'FRAMING',
    'FINAL REJECTION CHECK',
  ],
  3: [
    '03 — COLLAR / NECKLINE / PLACKET / BRANDING DETAIL',
    'DETAIL DIRECTION',
    'PRESENTATION',
    'BACKGROUND',
    'LIGHTING',
    'FRAMING',
    'REALISM REJECTION',
    'FINAL REJECTION CHECK',
  ],
  4: [
    '04 — CINEMATIC CONSTRUCTION DETAIL MACRO / T-SHIRT OR POLO T-SHIRT',
    'MACRO SUBJECT',
    'COMPOSITION',
    'SURFACE AND LIGHTING',
    'BRANDING SAFETY',
    'FINAL REJECTION CHECK',
  ],
  5: [
    '05 — CLEAN STUDIO FRONT MODEL / T-SHIRT OR POLO T-SHIRT',
    'MODEL DIRECTION',
    'POSE',
    'GARMENT FIT',
    'STYLING',
    'BACKGROUND — ABSOLUTE COLOUR LOCK',
    'LIGHTING',
    'FINAL REJECTION CHECK',
  ],
  6: [
    '06 — OUTDOOR LIFESTYLE MOVEMENT HERO / T-SHIRT OR POLO T-SHIRT',
    'MODEL UNIQUENESS',
    'CORE VISUAL IDENTITY — PROMPT 06',
    'SCENE',
    'MOVEMENT — NON-NEGOTIABLE',
    'POSE',
    'NO SUNGLASSES — PROMPT 06',
    'GARMENT FIT AND MOVEMENT',
    'STYLING',
    'CAMERA AND FRAMING — DISTINCT FROM PROMPT 07',
    'LIGHTING',
    'ENTITLED MOOD',
    'FINAL REJECTION CHECK',
  ],
  7: [
    '07 — URBAN ARCHITECTURAL EDITORIAL PORTRAIT / T-SHIRT OR POLO T-SHIRT',
    'MODEL UNIQUENESS',
    'CORE VISUAL IDENTITY — PROMPT 07',
    'SCENE — DISTINCT FROM PROMPT 06',
    'POSE — STATIC / NON-NEGOTIABLE',
    'OPTIONAL SUNGLASSES',
    'GARMENT FIT',
    'STYLING',
    'CAMERA AND FRAMING — DISTINCT FROM PROMPT 06',
    'COMPOSITION',
    'LIGHTING',
    'ENTITLED MOOD',
    'FINAL REJECTION CHECK',
  ],
  8: [
    '08 — ISOLATED BACK PRODUCT / T-SHIRT OR POLO T-SHIRT',
    '01 / 08 FRONT-BACK PRESENTATION MATCH — ABSOLUTE',
    'BACK-VIEW LOCK — ABSOLUTE',
    'PRESENTATION',
    'SLEEVE PRESENTATION — ABSOLUTE / MATCH PROMPT 01',
    'SHORT-SLEEVE GEOMETRY LOCK — ABSOLUTE',
    'PRIMARY SLEEVE FOLD — STRAIGHT PRESSED EDGE / ABSOLUTE',
    'RULER TEST — ABSOLUTE',
    'FOLD CONSTRUCTION — PHYSICALLY REALISTIC',
    'LEFT / RIGHT MIRROR LOCK',
    'T-SHIRT BACK DIRECTION',
    'POLO BACK DIRECTION',
    'BRANDING AND ARTWORK PROTECTION',
    'BACKGROUND — ABSOLUTE COLOUR LOCK',
    'LIGHTING',
    'FRAMING',
    'REALISM',
    'FINAL REJECTION CHECK',
  ],
  9: [
    '09 — PURE FABRIC MACRO / T-SHIRT OR POLO T-SHIRT',
    'FABRIC SOURCE OF TRUTH',
    'MACRO COMPOSITION',
    'OPTIONAL TRIM',
    'LIGHTING',
    'BACKGROUND',
    'FINAL REJECTION CHECK',
  ],
  10: [
    '10 — SHOPIFY SIZE CHART / T-SHIRT OR POLO T-SHIRT',
    'INPUT INTERPRETATION',
    'APPROVED PRODUCT IMAGE LOCK — ABSOLUTE',
    'OFFICIAL LOGO LOCK',
    'MEASUREMENT DATA LOCK',
    'MEASUREMENT DIAGRAM',
    'LAYOUT',
    'TABLE',
    'BACKGROUND',
    'FINAL QUALITY CONTROL',
  ],
};

function normalize(value: string) {
  return value
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase();
}

function parseSections(text: string) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const starts: Array<{ index: number; name: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const previous = lines[index - 1]?.trim();
    const next = lines[index + 1]?.trim();
    if (!line) continue;
    const standaloneHeading =
      previous === '' &&
      next === '' &&
      !line.startsWith('•') &&
      !/^[-=]+$/.test(line) &&
      line.length < 140 &&
      line === line.toUpperCase();
    if (
      line.startsWith('## ') ||
      /^[=-]{4,}$/.test(previous ?? '') ||
      /^[=-]{4,}$/.test(next ?? '') ||
      standaloneHeading
    )
      starts.push({ index, name: line.replace(/^#+\s*/, '').trim() });
  }
  return starts.map((start, index) => {
    const sectionLines = lines.slice(start.index + 1, starts[index + 1]?.index ?? lines.length);
    if (/^[=-]{4,}$/.test(sectionLines[0]?.trim() ?? '')) sectionLines.shift();
    return { name: start.name, text: sectionLines.join('\n').trim() };
  });
}

function selectSections(text: string, names: readonly string[]) {
  const sections = parseSections(text);
  const selected: Array<{ name: string; text: string }> = [];
  const seen = new Set<string>();
  for (const requested of names) {
    const match = sections.find((section) => normalize(section.name) === normalize(requested));
    if (match && !seen.has(normalize(match.name))) {
      selected.push(match);
      seen.add(normalize(match.name));
    }
  }
  return selected;
}

function compactUnique(
  parts: Array<{ name: string; text: string; source: RuntimePromptSection['source'] }>,
) {
  const seen = new Set<string>();
  return parts.filter((part) => {
    const key = part.text.replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function compileEntitledProviderPrompt(
  numberedPrompt: string,
  imageRules: string,
  visualSystem: string,
  promptNumber: number,
): CompiledProviderPrompt {
  const roleParts = BASE_RULES.map(([name, text]) => ({ name, text, source: 'wrapper' as const }));
  const ruleParts = selectSections(imageRules, RULE_SECTIONS).map((section) => ({
    ...section,
    source: 'rules' as const,
  }));
  const visualParts = selectSections(visualSystem, VISUAL_SECTIONS).map((section) => ({
    ...section,
    source: 'visual' as const,
  }));
  const selectedPromptSections = selectSections(
    numberedPrompt,
    PROMPT_SECTIONS[promptNumber] ?? [],
  );
  const promptParts = (
    selectedPromptSections.length
      ? selectedPromptSections
      : [
          {
            name: `PROMPT ${String(promptNumber).padStart(2, '0')} CONTENT`,
            text: numberedPrompt.trim(),
          },
        ]
  ).map((section) => ({ ...section, source: 'numbered' as const }));
  const selected = compactUnique([...roleParts, ...ruleParts, ...visualParts, ...promptParts]);
  const prompt = selected.map((part) => `${part.name}\n${part.text}`).join('\n\n');
  const selectedNames = new Set(selected.map((part) => normalize(part.name)));
  const omittedSections = parseSections(numberedPrompt)
    .map((section) => section.name)
    .filter((name) => !selectedNames.has(normalize(name)));
  return {
    prompt,
    length: [...prompt].length,
    sections: selected.map((part) => ({
      name: part.name,
      source: part.source,
      characters: [...`${part.name}\n${part.text}`].length,
    })),
    omittedSections,
  };
}
