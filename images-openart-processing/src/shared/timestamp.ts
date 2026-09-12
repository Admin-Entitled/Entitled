const formatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZoneName: 'short',
});

/** Formats persisted UTC ISO timestamps for the operator-facing UI. */
export function formatIstTimestamp(value?: string): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const month = parts.month === 'Sept' ? 'Sep' : parts.month;
  return `${parts.day} ${month} ${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${parts.dayPeriod.toUpperCase()} ${parts.timeZoneName}`;
}

export function elapsedSince(value?: string, now = Date.now()): string {
  if (!value) return 'Not started';
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m ${seconds % 60}s`;
}
