import type { RepeatedSimulationType } from "../shared.js";

const rankOrder = ["인턴", "사원", "주임", "대리", "과장", "차장", "부장", "팀장", "실장", "임원", "대표"];

export function classifyRankGap(user?: string | null, boss?: string | null): string | null {
  const userIndex = rankOrder.indexOf(user ?? "");
  const bossIndex = rankOrder.indexOf(boss ?? "");
  if (userIndex < 0 || bossIndex < 0) return null;
  const gap = Math.max(0, bossIndex - userIndex);
  return gap >= 5 ? "5단계+" : `${gap}단계`;
}

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

const simulationTypeRules: { type: Exclude<RepeatedSimulationType, "기타">; keywords: string[] }[] = [
  { type: "질책·성과 압박", keywords: ["기본", "도대체", "실망", "문제", "성과", "책임져", "이 정도", "왜 못", "왜 안", "왜 아직", "실수"] },
  { type: "일정·마감 압박", keywords: ["언제", "오늘까지", "내일까지", "마감", "기한", "일정", "지연", "늦", "빨리", "급해", "즉시", "당장"] },
  { type: "수정·품질 피드백", keywords: ["수정", "다시", "다르", "검토", "보완", "오류", "틀렸", "품질", "완성도", "초안"] },
  { type: "의사결정·승인", keywords: ["승인", "결정", "선택", "결론", "컨펌", "확정", "판단"] },
  { type: "업무 위임·책임 요구", keywords: ["알아서", "담당", "책임", "맡아", "맡겨", "처리", "정리", "챙겨", "주도"] },
  { type: "협업·조율", keywords: ["같이", "함께", "협업", "조율", "회의", "소통", "지원", "합의"] },
  { type: "진행·보고 확인", keywords: ["진행", "보고", "공유", "상황", "확인", "결과", "알려", "업데이트"] },
];

export function classifyRepeatedSimulation(inputText: string): RepeatedSimulationType {
  const normalized = inputText.trim().replace(/\s+/g, " ").toLowerCase();
  return simulationTypeRules.find((rule) => rule.keywords.some((keyword) => normalized.includes(keyword)))?.type ?? "기타";
}

export function computeRepeatedSimulationTypes(rows: { inputText: string; simulationCount: number }[]): { type: RepeatedSimulationType; count: number }[] {
  const counts = new Map<string, number>();
  for (const { inputText, simulationCount } of rows) {
    const phrase = inputText.trim().replace(/\s+/g, " ");
    if (!phrase || !Number.isFinite(simulationCount) || simulationCount <= 0) continue;
    counts.set(phrase, (counts.get(phrase) ?? 0) + simulationCount);
  }
  const byType = new Map<RepeatedSimulationType, number>();
  for (const [phrase, count] of counts) {
    if (count < 2) continue;
    const type = classifyRepeatedSimulation(phrase);
    byType.set(type, (byType.get(type) ?? 0) + count);
  }
  return [...byType.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type, "ko"));
}
