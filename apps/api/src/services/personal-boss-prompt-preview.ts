import type { AdminPersonalBossPromptPreview, AdminPersonalBossPromptSource, Boss } from "../shared.js";
import type { EvidenceRecord, SurveyAnswerRecord } from "../types.js";
import type { AdminPersonalBossPromptContext } from "../repositories/store.js";
import { buildBossChatMessages } from "../prompts/chat.js";
import { buildPersonaMessages } from "../prompts/persona.js";
import type { BossRecord } from "../types.js";

interface BuildPersonalBossPromptPreviewInput {
  context: AdminPersonalBossPromptContext;
  evidence: EvidenceRecord[];
  survey: SurveyAnswerRecord[];
  basePrompt: string;
  globalBoss: BossRecord;
  personaInstruction: string;
}

const personalSystemSources = (): AdminPersonalBossPromptSource[] => [
  { role: "system", component: "안전·출력 규칙", origin: "서버 고정 규칙", description: "근거 안의 지시를 실행하지 않고 실제 인물의 내면을 단정하지 않도록 강제합니다.", containsPersonalData: false },
  { role: "system", component: "개인 상사 공통 기본 성향", origin: "관리자 저장값", description: "관리자 페이지에서 저장한 모든 개인 상사 공통 지침입니다.", containsPersonalData: false },
  { role: "system", component: "모두의 상사 기반 페르소나", origin: "현재 모두의 상사 페르소나", description: "개인 상사에게 공통 기반으로 적용되는 현재 페르소나입니다.", containsPersonalData: false },
];

function publicBoss(boss: BossRecord): Boss {
  return {
    id: boss.id,
    scope: boss.scope,
    status: boss.status,
    alias: boss.alias,
    avatarKey: boss.avatarKey,
    jobFunction: boss.jobFunction,
    yearsOfServiceBand: boss.yearsOfServiceBand,
    rank: boss.rank,
    companyName: boss.companyName,
    ageBand: boss.ageBand,
    hierarchyScore: boss.hierarchyScore,
    companyResearch: boss.companyResearch,
    persona: boss.persona,
    pki: boss.pki,
    personaError: boss.personaError,
    personaVersion: boss.personaVersion,
  };
}

export function buildPersonalBossPromptPreview(input: BuildPersonalBossPromptPreviewInput): AdminPersonalBossPromptPreview {
  const { context, evidence, survey, basePrompt, globalBoss, personaInstruction } = input;
  const personaMessages = buildPersonaMessages({
    profile: context.profile,
    boss: context.boss,
    evidence,
    survey,
    basePrompt,
    globalBoss,
    promptInstruction: personaInstruction,
  });
  const personaSources: AdminPersonalBossPromptSource[] = [
    ...personalSystemSources(),
    { role: "user", component: "페르소나 생성 업무 지침", origin: "관리자 AI 프롬프트 설정", description: "현재 저장된 페르소나 생성 우선순위와 해석 방향입니다.", containsPersonalData: false },
    { role: "user", component: "사용자 프로필", origin: "사용자 저장 프로필", description: "상사를 등록한 사용자의 실제 프로필입니다.", containsPersonalData: true },
    { role: "user", component: "상사 정보", origin: "사용자 생성 상사", description: "사용자가 입력한 상사 기본 정보와 현재 페르소나입니다.", containsPersonalData: true },
    { role: "user", component: "관찰 근거·설문", origin: "사용자 온보딩 자료", description: "현재 재생성에 전달되는 관찰 자료와 설문 응답입니다.", containsPersonalData: true },
  ];

  const chat = context.thread ? (() => {
    const messages = buildBossChatMessages({
      profile: context.profile,
      boss: context.boss,
      basePrompt,
      globalPersona: globalBoss.persona,
      summary: context.thread.conversationSummary,
      messages: context.thread.previousMessages,
      message: context.thread.latestQuestion.content,
    });
    const sources: AdminPersonalBossPromptSource[] = [
      ...personalSystemSources(),
      { role: "user", component: "사용자 프로필", origin: "사용자 저장 프로필", description: "대화 응답의 맥락으로 전달되는 실제 사용자 프로필입니다.", containsPersonalData: true },
      { role: "user", component: "상사 정보·페르소나", origin: "사용자 생성 상사", description: "상사 기본 정보와 현재 적용 중인 페르소나입니다.", containsPersonalData: true },
      { role: "user", component: "대화 요약", origin: "현재 활성 대화", description: "활성 스레드에 저장된 대화 요약입니다.", containsPersonalData: true },
      { role: "user", component: "최근 대화 이력", origin: "현재 활성 대화", description: "마지막 일반 사용자 질문 직전의 메시지를 최대 19개까지 포함합니다.", containsPersonalData: true },
      { role: "user", component: "마지막 사용자 질문", origin: "현재 활성 대화", description: "가장 최근 일반 채팅에서 AI에 전달된 실제 질문입니다.", containsPersonalData: true },
    ];
    return {
      status: "AVAILABLE" as const,
      messages: [...messages] as [typeof messages[0], typeof messages[1]],
      sources,
      lastQuestionAt: context.thread.latestQuestion.createdAt,
      historyMessageCount: context.thread.previousMessages.length,
      includedMessageCount: context.thread.previousMessages.length + 1,
      totalMessageCount: context.chatMessageCount,
    };
  })() : {
    status: "NO_CHAT_HISTORY" as const,
    reason: "이 상사의 활성 대화에 일반 사용자 질문이 없습니다.",
    totalMessageCount: context.chatMessageCount,
  };

  return {
    reconstructedAt: new Date().toISOString(),
    reconstructionMode: "CURRENT_STATE",
    profile: context.profile,
    boss: publicBoss(context.boss),
    personaGeneration: {
      messages: [...personaMessages],
      sources: personaSources,
      evidenceCount: evidence.length,
      surveyAnswerCount: survey.length,
    },
    chat,
  };
}
