export function getProviderOutputFormat(provider: string, _model?: string) {
  return provider === 'google' ? { requestMimeType: 'image/jpeg', extension: '.jpg' } : { requestMimeType: 'image/png', extension: '.png' };
}
