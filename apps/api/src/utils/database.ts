export function toIsoTimestamp(value: unknown, field: string): string {
  const date = value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new TypeError(`Database timestamp is missing or invalid: ${field}`);
  }
  return date.toISOString();
}
