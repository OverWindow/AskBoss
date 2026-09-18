import { jsonOnly } from "./shared";
export const companyPrompt = (name: string) => `${jsonOnly}
공개적으로 확인 가능한 정보만으로 '${name}'을 조사해 CompanyResearch JSON을 작성하라.
기업문화는 관찰 가능한 신호와 추정을 구분하고 특정 상사 개인의 성격으로 일반화하지 말라.
필드: companyName, industry, companySizeHint, businessSummary, organizationHints, workCultureSignals, confidence(0~1), sourceSummary.`;
