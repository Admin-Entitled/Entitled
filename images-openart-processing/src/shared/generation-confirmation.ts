export interface GenerationConfirmationInput {
  products: number;
  jobs: number;
  model: string;
  outputRoot: string;
}

export function generationConfirmationText(input: GenerationConfirmationInput): string {
  return [
    'Generate selected images?',
    '',
    `Products: ${input.products}`,
    `Jobs: ${input.jobs}`,
    `Model: ${input.model}`,
    `Output folder: ${input.outputRoot}`,
    '',
    'OpenArt credits will be used. The exact cost is not available from the OpenArt CLI.',
  ].join('\n');
}
