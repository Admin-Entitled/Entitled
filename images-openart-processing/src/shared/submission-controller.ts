export type GenerationUiState = 'ready' | 'confirmation_open' | 'submitting';

export interface GenerationSubmissionController {
  state(): GenerationUiState;
  open(): void;
  cancel(): void;
  confirm(): Promise<void>;
}

export function createGenerationSubmissionController(
  submit: () => Promise<void>,
  onStateChange: (state: GenerationUiState) => void = () => undefined,
): GenerationSubmissionController {
  let current: GenerationUiState = 'ready';
  let submission: Promise<void> | undefined;
  const update = (state: GenerationUiState) => {
    current = state;
    onStateChange(state);
  };
  return {
    state: () => current,
    open: () => {
      if (current === 'ready') update('confirmation_open');
    },
    cancel: () => {
      if (current === 'confirmation_open') update('ready');
    },
    confirm: () => {
      if (current !== 'confirmation_open') return submission ?? Promise.resolve();
      update('submitting');
      submission = submit().finally(() => {
        submission = undefined;
        update('ready');
      });
      return submission;
    },
  };
}
