const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const RIEUL_BATCHIM = 8;

function lastCodePoint(text: string): number | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.codePointAt(trimmed.length - 1) ?? null;
}

/** Returns true when the final Korean character ends with a 받침 (final consonant). */
export function hasBatchim(text: string): boolean {
  const cp = lastCodePoint(text);
  if (cp === null || cp < HANGUL_BASE || cp > HANGUL_LAST) return false;
  return (cp - HANGUL_BASE) % 28 !== 0;
}

/** Picks between two particle forms based on 받침 여부: particle("김팀장", "과", "와") → "과". */
export function particle(text: string, withFinal: string, withoutFinal: string): string {
  return hasBatchim(text) ? withFinal : withoutFinal;
}

/** 조사: 과/와 */
export function waGwa(text: string): string {
  return particle(text, "과", "와");
}

/** 조사: 을/를 */
export function eulReul(text: string): string {
  return particle(text, "을", "를");
}

/** 조사: 이/가 */
export function iGa(text: string): string {
  return particle(text, "이", "가");
}

/** 조사: 은/는 */
export function eunNeun(text: string): string {
  return particle(text, "은", "는");
}

/** 조사: 으로/로. ㄹ 받침 (e.g. "달") also takes 로. */
export function roEuro(text: string): string {
  const cp = lastCodePoint(text);
  if (cp !== null && cp >= HANGUL_BASE && cp <= HANGUL_LAST && (cp - HANGUL_BASE) % 28 === RIEUL_BATCHIM) return "로";
  return particle(text, "으로", "로");
}
