import type { BossPersona, BossSurveyQuestion, CompanyResearch, TranslationResult } from "@askboss/shared";
import { OBSERVATION_CATEGORIES } from "@askboss/shared";
import type { AiService } from "./types";

export class FakeAiService implements AiService {
  async researchCompany(name: string): Promise<CompanyResearch> { return { companyName:name,industry:null,companySizeHint:null,businessSummary:`${name}의 공개 정보는 데모 모드에서 조회하지 않았습니다.`,organizationHints:["보고 체계가 존재할 가능성"],workCultureSignals:["확인되지 않은 추정은 Persona의 약한 근거로만 사용"],confidence:0.25,sourceSummary:[] }; }
  async extractEvidence(input: { content: string; kind: string }) { return { observations:[{category:"보고 및 피드백",summary:input.content.slice(0,120),observedAt:null,contextQuality:0.55,messages:[{speaker:null,timestamp:null,content:input.content.slice(0,500)}]}] }; }
  async buildPersona(input: any): Promise<BossPersona> {
    const ids=input.evidence.filter((e:any)=>e.status==="READY").map((e:any)=>e.id);
    return { summary:`${input.boss.alias}은(는) 결론과 다음 행동이 분명한 보고를 선호하는 것으로 추정됩니다.`,communication:{tone:"간결하고 실무적",messageLength:"짧음",directness:70,formality:65},reporting:{preferredLength:"핵심 위주",preferredStructure:["결론","진행 상황","다음 일정"],frequentChecks:["마감","진행률"]},decisionMaking:{speed:"보통",riskTolerance:"중간 이하",autonomyPreference:"중간"},management:{hierarchyPreference:input.boss.hierarchyScore>60?"높음":"중간",feedbackStyle:"문제 해결 중심",deadlineSensitivity:"높음"},recurringPatterns:["결론을 먼저 확인함","중간 진행 상황을 확인함"],recurringPhrases:["그래서 언제 되나?","진행 상황은 어때?"],humorStyle:null,uncertainty:ids.length?["더 다양한 상황의 관찰이 쌓이면 정확도가 높아집니다."]:["실제 대화 근거가 아직 적습니다."],traits:[{key:"conclusion_first",label:"결론 우선",value:"높음",confidence:ids.length?0.72:0.45,evidenceIds:ids.slice(0,3)}] };
  }
  async generateSurvey(): Promise<BossSurveyQuestion[]> { return OBSERVATION_CATEGORIES.map((category,index)=>({id:`survey-${index+1}`,category,situation:["마감 전날 진척이 예상보다 느립니다. 상사는 보통 어떻게 반응하나요?","보고 자료에서 작은 오류를 발견했습니다. 상사의 첫 반응은 어떤가요?","예정된 일정이 바뀔 가능성이 생겼습니다. 상사는 무엇을 먼저 확인하나요?","선택지가 두 개이고 정보가 충분하지 않습니다. 상사는 어떻게 결정하나요?","업무가 한가한 오후, 상사는 팀원에게 어떻게 말을 거나요?"][index]!,options:[{id:"A",label:"현재 상황을 먼저 확인한다"},{id:"B",label:"이유와 책임을 먼저 묻는다"},{id:"C",label:"구체적인 해결책을 제시한다"},{id:"D",label:"담당자가 판단하도록 맡긴다"}],allowFreeText:true})); }
  async *streamChatWithBoss(input:any, signal?:AbortSignal) {
    const message=input.message as string;
    const content=message.includes("늦") ? "현재 진행 상황부터 간단히 정리해서 알려주세요. 남은 일정도 같이 봅시다." : "좋아요. 결론과 다음에 할 일을 먼저 말해주면 더 빨리 판단할 수 있어요.";
    for(const chunk of content.match(/.{1,12}/gu)??[content]){if(signal?.aborted)throw signal.reason;yield chunk;}
  }
  async translateBossMessage(_input:any): Promise<TranslationResult> { return {plainMeaning:"완성을 기다리기보다 현재 진행 상황과 남은 일정을 먼저 공유해 달라는 뜻에 가깝습니다.",likelyIntent:["진행 상황 확인","일정 지연 여부 확인","추가 지시 필요 여부 판단"],tone:"확인을 재촉하는 실무적 표현",caution:"표현만으로 실제 의도를 단정할 수는 없습니다.",confidence:0.72,replies:[{text:"네, 현재까지 진행된 내용과 남은 일정을 정리해서 먼저 공유드리겠습니다.",style:"무난하게",reason:"상태와 다음 행동을 함께 전달합니다."},{text:"현재 약 70% 진행됐고, 오늘 오후 중 공유드리겠습니다.",style:"간결하게",reason:"진행률과 시점을 바로 답합니다."},{text:"네 팀장님. 진행 상황과 남은 작업을 함께 정리해 먼저 공유드리겠습니다.",style:"조금 더 부드럽게",reason:"확인 의도를 존중하면서 부담 없이 답합니다."}]}; }
  async generateMonologue(input:any) { const options=["밥은 먹고 하는 건가?","오늘따라 조용하네.","이거 금방 끝나는 거 맞지?","커피 한잔하고 다시 보자고."]; return options.find((v)=>!input.previous.includes(v)) ?? "잠깐 쉬었다 하지."; }
  async generateHrSummary(_data:unknown) { return "최근에는 모호한 업무 지시와 보고 타이밍에 관한 사용이 많았습니다. 직급 차이가 큰 그룹에서 답변 추천 기능의 이용이 상대적으로 높았습니다."; }
  async health() { return {ok:true,available:["demo"],missing:[],mode:"demo" as const}; }
}
