export interface ChatCursor {
  id: string;
}

export class InvalidChatCursorError extends Error {
  constructor() {
    super("Invalid chat cursor");
    this.name = "InvalidChatCursorError";
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function encodeChatCursor(cursor: ChatCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeChatCursor(value: string): ChatCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<ChatCursor>;
    if (typeof parsed.id !== "string" || !UUID_PATTERN.test(parsed.id)) return null;
    return { id: parsed.id };
  } catch {
    return null;
  }
}
