import path from 'node:path';
import type {
  OrderedImageInput,
  ProductImageRole,
  ProductSourceImage,
  ReferenceImage,
} from '../../shared/types.js';
import { naturalCompare } from './natural-sort.js';

const ROLE_PATTERNS: Array<[ProductImageRole, RegExp]> = [
  ['APPROVED_PROMPT_01', /(^|[-_ ])approved[-_ ]?01($|[-_ ])/i],
  ['MEASUREMENT', /(^|[-_ ])(?:size[-_ ]?chart|measurements?)($|[-_ ])/i],
  ['LABEL_BRANDING', /(^|[-_ ])(?:label|logo|branding)($|[-_ ])/i],
  ['DETAIL', /(^|[-_ ])(?:detail|close[-_ ]?up)($|[-_ ])/i],
  ['FABRIC', /(^|[-_ ])(?:fabric|material|texture|macro)($|[-_ ])/i],
  ['FRONT', /(^|[-_ ])front($|[-_ ])/i],
  ['BACK', /(^|[-_ ])(?:back|rear)($|[-_ ])/i],
];

function roleText(fileName: string) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/close[-_ ]?up/gi, 'closeup')
    .replace(/size[-_ ]?chart/gi, 'size-chart')
    .replace(/approved[-_ ]?01/gi, 'approved-01')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/^\d+[-_ ]*/, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function detectProductImageRole(fileName: string) {
  const normalized = roleText(fileName);
  const candidates = ROLE_PATTERNS.filter(([, pattern]) => pattern.test(normalized)).map(
    ([role]) => role,
  );
  const role = candidates.length === 1 ? candidates[0] : 'UNASSIGNED';
  return { role, candidates };
}

export function createProductSourceImages(images: ReferenceImage[]): ProductSourceImage[] {
  return images
    .map((image) => {
      const detected = detectProductImageRole(image.name);
      return {
        ...image,
        detectedRole: detected.role,
        role: detected.role,
        roleCandidates: detected.candidates,
      };
    })
    .sort((a, b) => naturalCompare(a.name, b.name));
}

const STANDARD_ROLES: Record<number, ProductImageRole[]> = {
  1: ['FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  2: ['FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  3: ['FRONT', 'DETAIL', 'LABEL_BRANDING'],
  4: ['DETAIL', 'FABRIC', 'LABEL_BRANDING'],
  5: ['FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  6: ['FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  7: ['FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  8: ['BACK', 'FRONT', 'DETAIL', 'LABEL_BRANDING', 'FABRIC'],
  9: ['FABRIC', 'DETAIL'],
};

function roleLabel(role: ProductImageRole) {
  return role.replaceAll('_', ' ');
}

export interface ProductRoleResolution {
  included: ProductSourceImage[];
  excluded: ProductSourceImage[];
  errors: string[];
}

export function resolvePromptProductInputs(
  promptNumber: number,
  sources: ProductSourceImage[],
): ProductRoleResolution {
  if (promptNumber === 10) {
    return {
      included: [],
      excluded: [...sources],
      errors: [],
    };
  }
  const allowed = STANDARD_ROLES[promptNumber] ?? [];
  const errors: string[] = [];
  const sourceList = [...sources].sort((a, b) => naturalCompare(a.name, b.name));
  for (const source of sourceList) {
    if (source.role === 'UNASSIGNED') {
      errors.push(
        source.roleCandidates && source.roleCandidates.length > 1
          ? `Ambiguous product-image roles for ${source.name}: ${source.roleCandidates.join(', ')}`
          : `Unassigned product image: ${source.name}`,
      );
    }
  }
  const included: ProductSourceImage[] = [];
  for (const role of allowed) {
    const matches = sourceList.filter((source) => source.role === role);
    if (matches.length > 1 && ['FRONT', 'BACK', 'FABRIC'].includes(role)) {
      errors.push(
        `Ambiguous ${roleLabel(role)} role: ${matches.map((source) => source.name).join(', ')}`,
      );
    }
    included.push(...matches);
  }
  const hasDetail = sourceList.some((source) => source.role === 'DETAIL');
  if (promptNumber === 4 && !hasDetail) {
    const fallback = sourceList.filter((source) => source.role === 'FRONT');
    if (!fallback.length) errors.push('Prompt 04 requires DETAIL or a FRONT fallback source.');
    included.unshift(...fallback);
  }
  if ([1, 2, 3, 5, 6, 7].includes(promptNumber) && !included.some((item) => item.role === 'FRONT'))
    errors.push(`Prompt ${String(promptNumber).padStart(2, '0')} requires a FRONT source image.`);
  if (promptNumber === 8 && !included.some((item) => item.role === 'BACK'))
    errors.push('Prompt 08 requires a BACK source image.');
  if (promptNumber === 9 && !included.some((item) => ['FABRIC', 'DETAIL'].includes(item.role)))
    errors.push('Prompt 09 requires a FABRIC or DETAIL source image.');
  const includedPaths = new Set(included.map((source) => source.path));
  const excluded = sourceList.filter((source) => !includedPaths.has(source.path));
  return { included, excluded, errors: [...new Set(errors)] };
}

export function orderEntitledInputs(
  presentation: ReferenceImage | undefined,
  included: ProductSourceImage[],
): OrderedImageInput[] {
  const ordered: OrderedImageInput[] = [];
  if (presentation)
    ordered.push({
      order: 1,
      role: 'presentation',
      label: 'PRESENTATION_REFERENCE',
      image: presentation,
    });
  for (const source of included)
    ordered.push({
      order: ordered.length + 1,
      role: 'product',
      label: source.role,
      image: source,
    });
  return ordered;
}
