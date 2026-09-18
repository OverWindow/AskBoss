import { useSession } from "../features/session/useSession";import { BossOnboarding } from "../features/onboarding/BossOnboarding";
export function BossOnboardingPage(){const session=useSession();if(session.isLoading)return <div className="loading-state"><div className="spinner"/></div>;if(session.isError)return <div className="empty-state">세션을 시작하지 못했습니다.</div>;return <BossOnboarding/>;}
