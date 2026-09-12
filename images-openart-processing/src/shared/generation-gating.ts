export interface GenerationGateInput {
  validJobCount: number;
  invalidJobCount: number;
  outputRoot: string;
  validationIsCurrent: boolean;
}

export function canGenerateBatch(input: GenerationGateInput): boolean {
  return Boolean(
    input.validJobCount > 0 &&
    input.invalidJobCount === 0 &&
    input.outputRoot &&
    input.validationIsCurrent,
  );
}
