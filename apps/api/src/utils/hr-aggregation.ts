const politePositive = [
  "감사", "고맙", "죄송", "양해", "부탁", "드리", "요청", "확인",
  "좋", "잘", "축하", "환영", "기쁘", "괜찮", "즐거", "반갑",
  "감사합", "고맙습", "죄송합", "부탁드", "요", "합니다", "ㅂ니다",
];

const negativeWarning = [
  "하지마", "그만", "실망", "문제", "위험", "경고", "주의", "부정",
  "반대", "거절", "불가", "안된다", "안 돼", "나쁘", "짜증", "화난",
  "혼내", "비판", "압박", "협박", "무시", "쓸모없", "열등", "책망",
  "괜찮지 않", "좋지 않", "곤란", "어렵", "힘들", "불편", "부적절",
  "조심", "유의", "위험", "경계", "적절하지 않",
];

function includesAny(text: string, words: string[]): boolean {
  const lowered = text.toLowerCase();
  return words.some((word) => lowered.includes(word));
}

function hasSurfacePositive(inputText: string): boolean {
  return includesAny(inputText, politePositive);
}

function hasMeaningNegative(plainMeaning: string, caution?: string | null): boolean {
  const output = [plainMeaning, caution ?? ""].join(" ");
  return includesAny(output, negativeWarning);
}

export interface GapRow {
  inputText: string;
  plainMeaning: string;
  caution?: string | null;
  bossId?: string;
  alias?: string | null;
  surfaceActualGapScore?: number | null;
}

export interface SurfaceActualGapResult {
  rate: number;
  byBoss: { bossId: string; alias: string; rate: number; gapCount: number; total: number }[];
}

export function computeSurfaceActualGap(rows: GapRow[]): SurfaceActualGapResult {
  const valid = rows.filter((r) => r.inputText && r.plainMeaning);
  const isGap = (row:GapRow)=>typeof row.surfaceActualGapScore==="number"?row.surfaceActualGapScore>=50:hasSurfacePositive(row.inputText)&&hasMeaningNegative(row.plainMeaning,row.caution);
  const gapCount = valid.filter(isGap).length;
  const total = valid.length;
  const rate = total === 0 ? 0 : Math.round((gapCount / total) * 1000) / 10;

  const bossMap = new Map<string, { alias: string; gapCount: number; total: number }>();
  for (const r of valid) {
    if (!r.bossId) continue;
    const existing = bossMap.get(r.bossId);
    const alias = r.alias?.trim() || "익명 상사";
    const rowHasGap = isGap(r);
    if (existing) {
      existing.total += 1;
      if (rowHasGap) existing.gapCount += 1;
    } else {
      bossMap.set(r.bossId, { alias, gapCount: rowHasGap ? 1 : 0, total: 1 });
    }
  }

  const byBoss = [...bossMap.entries()]
    .filter(([, v]) => v.total >= 3)
    .map(([bossId, v]) => ({
      bossId,
      alias: v.alias,
      rate: Math.round((v.gapCount / v.total) * 1000) / 10,
      gapCount: v.gapCount,
      total: v.total,
    }))
    .sort((a, b) => b.rate - a.rate || b.gapCount - a.gapCount);

  return { rate, byBoss };
}

export function computeTopRepeatedPhrases(rows: { inputText: string }[]): { phrase: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { inputText } of rows) {
    const phrase = inputText.trim().replace(/\s+/g, " ");
    if (!phrase) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase, "ko"))
    .slice(0, 10);
}
