const markdownCandidate = /[`*_[\]#!>\\<]|(^|\n)\s*(?:[-+]\s|\d+[.)]\s)/m;

export function toPlainText(value: string, trim = true) {
  const result = value
    .replace(/\r\n?/g, "\n")
    .replace(/^\s*```[^\n]*$/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gm, "")
    .replace(/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/gm, "")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/\\([\\`*_[\]{}()#+\-.!>])/g, "$1")
    .replace(/[*`]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n");
  return trim ? result.trim() : result;
}

export function plainTextValues<T>(value: T): T {
  if (typeof value === "string") return toPlainText(value) as T;
  if (Array.isArray(value)) return value.map((item) => plainTextValues(item)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, plainTextValues(item)])) as T;
  return value;
}

export class PlainTextStream {
  private pending = "";

  push(chunk: string) {
    this.pending += chunk;
    if (!markdownCandidate.test(this.pending)) {
      const safe = toPlainText(this.pending, false);
      this.pending = "";
      return safe;
    }
    const boundary = this.pending.lastIndexOf("\n");
    if (boundary < 0) return "";
    const safe = toPlainText(this.pending.slice(0, boundary + 1), false);
    this.pending = this.pending.slice(boundary + 1);
    return safe;
  }

  flush() {
    const safe = toPlainText(this.pending, false);
    this.pending = "";
    return safe;
  }
}
