export interface ArchiveCursor {
  id: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeArchiveCursor(cursor: ArchiveCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeArchiveCursor(value: string): ArchiveCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ArchiveCursor>;
    if (typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return null;
    return { id: parsed.id };
  } catch {
    return null;
  }
}
