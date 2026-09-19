export function buildActualResponseEvidence(source: string, reply: string | null, content: string, observedAt: string) {
  const rawText = [
    `[실제 상사 발언] ${source}`,
    ...(reply ? [`[사용자 답변] ${reply}`] : []),
    `[확인된 실제 상사 답변] ${content}`,
  ].join("\n");

  return {
    rawText,
    parsedData: {
      observations: [{
        category: "보고 및 피드백",
        summary: "사용자가 시뮬레이션 이후 직접 확인한 실제 상사 반응",
        observedAt,
        contextQuality: 1,
        messages: [
          { speaker: "상사", timestamp: null, content: source },
          ...(reply ? [{ speaker: "사용자", timestamp: null, content: reply }] : []),
          { speaker: "상사", timestamp: null, content },
        ],
      }],
    },
  };
}
