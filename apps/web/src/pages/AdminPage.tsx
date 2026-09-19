import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Bot, Clock3, Database, LogOut, Play, RefreshCw, Settings2, ShieldCheck, UsersRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "react-router-dom";
import { DEFAULT_AI_PROMPT_INSTRUCTIONS, DEFAULT_TRANSLATION_EXAMPLES, type AdminAiPromptSettings, type AdminAiPromptSettingsInput, type AdminCredits, type AdminDashboard, type AdminJobSummary, type AdminSessionPage, type PersonalBossDefaults, type TranslationExamples, type TranslationExamplesSettings } from "@askboss/shared";
import { api } from "../services/api-client";
import { GlobalBossAdmin } from "../features/admin/GlobalBossAdmin";
import { PersonalBossPromptsAdmin } from "../features/admin/PersonalBossPromptsAdmin";

const ADMIN_TIMEOUT_MS = 10_000;

function adminApi<T>(path: string, options: RequestInit = {}) {
  return api<T>(path, { ...options, timeoutMs: ADMIN_TIMEOUT_MS });
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

function AdminConnectionError({ title = "API 연결에 실패했습니다.", onRetry }: { title?: string; onRetry: () => void }) {
  return <main className="admin-login-page"><section className="admin-login-card admin-error-card" role="alert"><div className="admin-login-icon"><AlertTriangle size={26}/></div><h1>{title}</h1><p>API 서버 상태를 확인한 뒤 다시 시도해 주세요.</p><button className="secondary-button" type="button" onClick={onRetry}><RefreshCw size={16}/>다시 시도</button></section></main>;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(undefined);
    try { await adminApi("/admin/login", { method: "POST", body: JSON.stringify({ password }) }); setPassword(""); onSuccess(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "로그인하지 못했습니다."); }
    finally { setLoading(false); }
  };
  return <main className="admin-login-page"><form className="admin-login-card" onSubmit={(event) => void submit(event)}>
    <div className="admin-login-icon"><ShieldCheck size={28}/></div><p className="panel-kicker">ASKBOSS OPERATIONS</p><h1>관리자 로그인</h1><p>운영 현황과 AI 크레딧을 확인합니다.</p>
    <label htmlFor="admin-password">관리자 비밀번호</label><input id="admin-password" className="input" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus/>
    {error && <p className="error-text" role="alert">{error}</p>}
    <button className="primary-button" disabled={!password || loading}>{loading ? "확인 중…" : "로그인"}</button>
  </form></main>;
}

function CreditCard({ title, bucket }: { title: string; bucket: AdminCredits["total"] }) {
  if (!bucket) return <article className="credit-card"><span>{title}</span><strong>조회 불가</strong></article>;
  const percent = bucket.quota > 0 ? Math.max(0, Math.min(100, bucket.remaining / bucket.quota * 100)) : 0;
  return <article className="credit-card"><span>{title}</span><strong>{formatNumber(bucket.remaining)}</strong><small>{formatNumber(bucket.used)} 사용 / {formatNumber(bucket.quota)} 할당</small><div className="credit-track"><i style={{ width: `${percent}%` }}/></div>{bucket.renewalDate && <small>갱신 {formatDate(bucket.renewalDate)}</small>}</article>;
}

function PersonalBossDefaultsCard() {
  const settings = useQuery({ queryKey: ["admin", "personal-boss-defaults"], queryFn: () => adminApi<PersonalBossDefaults>("/admin/personal-boss-defaults"), retry: 1 });
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => { if (typeof settings.data?.prompt === "string") setPrompt(settings.data.prompt); }, [settings.data]);

  const save = async () => {
    setSaving(true); setMessage(undefined);
    try {
      const saved = await adminApi<PersonalBossDefaults>("/admin/personal-boss-defaults", { method: "PUT", body: JSON.stringify({ prompt }) });
      setPrompt(saved.prompt); setMessage(saved.prompt ? "개인 상사 공통 기본 성격을 저장했습니다." : "개인 상사 공통 기본 성격을 비활성화했습니다."); await settings.refetch();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "기본 성격을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  return <section className="admin-section"><div className="admin-section-title"><Settings2 size={19}/><div><h2>개인 상사 공통 기본 성격</h2><p>모든 기존·신규 개인 상사의 페르소나, 번역, 대화, 혼잣말에 적용됩니다. 모두의 상사는 제외됩니다.</p></div></div>
    {settings.isError ? <div className="admin-inline-error"><AlertTriangle size={18}/><span>기본 성격을 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void settings.refetch()}>다시 시도</button></div> : <div className="admin-prompt-form">
      <label htmlFor="personal-boss-base-prompt">개인 상사 공통 시스템 프롬프트</label>
      <textarea id="personal-boss-base-prompt" className="textarea" maxLength={5_000} value={prompt} disabled={settings.isLoading || saving} onChange={(event) => setPrompt(event.target.value)} placeholder="비워서 추가 기본 성향을 비활성화할 수 있습니다."/>
      <div className="admin-prompt-meta"><small>{prompt.length.toLocaleString("ko-KR")} / 5,000자</small>{settings.data?.updatedAt && <small>마지막 저장 {formatDate(settings.data.updatedAt)}</small>}</div>
      <p className="hint">저장 즉시 새 AI 응답에 적용됩니다. 기존 페르소나 데이터는 다음 재생성 때 갱신됩니다.</p>
      <div className="admin-form-actions"><button className="primary-button" type="button" disabled={settings.isLoading || saving} onClick={() => void save()}>{saving ? "저장 중…" : "기본 성격 저장"}</button></div>
      {message && <p className="settings-message" role="status">{message}</p>}
    </div>}
  </section>;
}

function TranslationExamplesCard() {
  const cache = useQueryClient();
  const settings = useQuery({ queryKey: ["admin", "translation-examples"], queryFn: () => adminApi<TranslationExamplesSettings>("/admin/translation-examples"), retry: 1 });
  const [examples, setExamples] = useState<TranslationExamples>([...DEFAULT_TRANSLATION_EXAMPLES]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => { if (settings.data?.examples) setExamples([...settings.data.examples]); }, [settings.data?.examples]);

  const updateExample = (index: number, value: string) => {
    setExamples((current) => current.map((example, currentIndex) => currentIndex === index ? value : example) as TranslationExamples);
  };
  const save = async () => {
    setSaving(true); setMessage(undefined);
    try {
      const saved = await adminApi<TranslationExamplesSettings>("/admin/translation-examples", { method: "PUT", body: JSON.stringify({ examples }) });
      setExamples([...saved.examples]); setMessage("번역 예시 문장을 저장했습니다."); await Promise.all([settings.refetch(), cache.invalidateQueries({ queryKey: ["translation-examples"] })]);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "번역 예시 문장을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  return <section className="admin-section"><div className="admin-section-title"><Settings2 size={19}/><div><h2>번역 예시 문장</h2><p>모두의 상사와 개인 상사의 번역 화면에 공통으로 표시되는 세 문장입니다.</p></div></div>
    {settings.isError ? <div className="admin-inline-error"><AlertTriangle size={18}/><span>번역 예시를 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void settings.refetch()}>다시 시도</button></div> : <div className="admin-example-form">
      {examples.map((example, index) => <label key={index} htmlFor={`translation-example-${index + 1}`}>예시 문장 {index + 1}<input id={`translation-example-${index + 1}`} aria-label={`예시 문장 ${index + 1}`} className="input" maxLength={200} value={example} disabled={settings.isLoading || saving} onChange={(event) => updateExample(index, event.target.value)}/><small>{example.length} / 200자</small></label>)}
      <p className="hint">저장 즉시 새로 열거나 다시 조회하는 사용자 화면에 적용됩니다.</p>
      <div className="admin-form-actions"><button className="primary-button" type="button" disabled={settings.isLoading || saving || examples.some((example) => !example.trim())} onClick={() => void save()}>{saving ? "저장 중…" : "예시 문장 저장"}</button></div>
      {message && <p className="settings-message" role="status">{message}</p>}
    </div>}
  </section>;
}

const initialAiPromptSettings = (): AdminAiPromptSettingsInput => structuredClone(DEFAULT_AI_PROMPT_INSTRUCTIONS);

function AiPromptSettingsCard() {
  const settings = useQuery({ queryKey: ["admin", "ai-prompt-settings"], queryFn: () => adminApi<AdminAiPromptSettings>("/admin/ai-prompt-settings"), retry: 1 });
  const [prompts, setPrompts] = useState<AdminAiPromptSettingsInput>(initialAiPromptSettings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (typeof settings.data?.translation !== "string" || !settings.data.onboarding) return;
    setPrompts({ translation: settings.data.translation, onboarding: { ...settings.data.onboarding } });
  }, [settings.data]);

  const updateOnboarding = (key: keyof AdminAiPromptSettingsInput["onboarding"], value: string) => {
    setPrompts((current) => ({ ...current, onboarding: { ...current.onboarding, [key]: value } }));
  };
  const promptValues = [prompts.translation, ...Object.values(prompts.onboarding)];
  const valid = promptValues.every((prompt) => prompt.trim().length > 0 && prompt.trim().length <= 5_000);
  const save = async () => {
    setSaving(true); setMessage(undefined);
    try {
      const saved = await adminApi<AdminAiPromptSettings>("/admin/ai-prompt-settings", { method: "PUT", body: JSON.stringify(prompts) });
      setPrompts({ translation: saved.translation, onboarding: { ...saved.onboarding } });
      setMessage("AI 업무 프롬프트를 저장했습니다.");
      await settings.refetch();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "AI 업무 프롬프트를 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };

  const editor = (id: string, label: string, value: string, onChange: (value: string) => void, description: string) => <label className="admin-prompt-editor" htmlFor={id}>
    <span>{label}</span><small>{description}</small>
    <textarea id={id} aria-label={label} className="textarea" maxLength={5_000} value={value} disabled={settings.isLoading || saving} onChange={(event) => onChange(event.target.value)}/>
    <small className="admin-prompt-count">{value.length.toLocaleString("ko-KR")} / 5,000자</small>
  </label>;

  return <section className="admin-section"><div className="admin-section-title"><Bot size={19}/><div><h2>AI 업무 프롬프트</h2><p>번역과 상사 온보딩에 공통으로 쓰이는 운영 지침입니다.</p></div></div>
    {settings.isError ? <div className="admin-inline-error"><AlertTriangle size={18}/><span>AI 업무 프롬프트를 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void settings.refetch()}>다시 시도</button></div> : <div className="admin-ai-prompt-form">
      <div className="admin-prompt-group"><h3>공통 번역 프롬프트</h3><p className="hint">모두의 상사와 개인 상사의 번역 결과에 함께 적용됩니다.</p>{editor("translation-prompt-instruction", "번역 업무 지침", prompts.translation, (value) => setPrompts((current) => ({ ...current, translation: value })), "해석 방식과 추천 답변의 방향을 지정합니다.")}</div>
      <div className="admin-prompt-group"><h3>온보딩 AI 프롬프트</h3><p className="hint">사용자 온보딩과 모두의 상사 관리에서 다음 AI 작업에 공통 적용됩니다.</p><div className="admin-onboarding-prompt-grid">
        {editor("company-research-prompt-instruction", "회사 조사", prompts.onboarding.companyResearch, (value) => updateOnboarding("companyResearch", value), "회사 공개 정보를 어떤 관점과 기준으로 조사할지 지정합니다.")}
        {editor("evidence-extraction-prompt-instruction", "자료 추출", prompts.onboarding.evidenceExtraction, (value) => updateOnboarding("evidenceExtraction", value), "대화·이미지 자료에서 어떤 관찰을 추출할지 지정합니다.")}
        {editor("survey-generation-prompt-instruction", "상황질문 생성", prompts.onboarding.surveyGeneration, (value) => updateOnboarding("surveyGeneration", value), "상사를 파악하기 위한 질문의 방향을 지정합니다.")}
        {editor("persona-generation-prompt-instruction", "페르소나 생성", prompts.onboarding.personaGeneration, (value) => updateOnboarding("personaGeneration", value), "관찰 근거를 종합하는 우선순위와 해석 방향을 지정합니다.")}
      </div></div>
      <p className="admin-fixed-prompt-note">보안 규칙, JSON 필드와 응답 형식, 실제 입력 데이터 구획은 서버에 고정되어 있으며 여기서는 수정할 수 없습니다.</p>
      <div className="admin-prompt-save-row"><div>{settings.data?.updatedAt && <small>마지막 저장 {formatDate(settings.data.updatedAt)}</small>}{message && <p className="settings-message" role="status">{message}</p>}</div><button className="primary-button" type="button" disabled={settings.isLoading || saving || !valid} onClick={() => void save()}>{saving ? "저장 중…" : "AI 프롬프트 저장"}</button></div>
    </div>}
  </section>;
}

function AdminDashboardView({ onLogout }: { onLogout: () => Promise<void> }) {
  const cache = useQueryClient();
  const [sessionPage, setSessionPage] = useState(1);
  const dashboard = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => adminApi<AdminDashboard>("/admin/dashboard"), refetchInterval: 30_000, retry: 1 });
  const credits = useQuery({ queryKey: ["admin", "credits"], queryFn: () => adminApi<AdminCredits>("/admin/credits"), refetchInterval: 60_000, retry: 1 });
  const sessions = useQuery({ queryKey: ["admin", "sessions", sessionPage], queryFn: () => adminApi<AdminSessionPage>(`/admin/sessions?page=${sessionPage}`), retry: 1 });
  const jobs = useQuery({ queryKey: ["admin", "jobs"], queryFn: () => adminApi<{ items: AdminJobSummary[] }>("/admin/jobs"), retry: 1 });
  const [running, setRunning] = useState<string>();
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (sessions.data && sessionPage > sessions.data.totalPages) setSessionPage(Math.max(1, sessions.data.totalPages));
  }, [sessionPage, sessions.data]);

  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["admin"] }); };
  const operation = async (key: string, path: string) => {
    setRunning(key); setMessage(undefined);
    try { await adminApi(path, { method: "POST" }); setMessage("작업을 시작했습니다."); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "작업을 실행하지 못했습니다."); }
    finally { setRunning(undefined); }
  };
  const pruneMeaninglessSessions = async () => {
    if (!window.confirm("24시간 이상 활동이 없고 프로필·상사·대화·번역 데이터가 전혀 없는 세션을 삭제합니다. 계속하시겠습니까?")) return;
    setRunning("prune-meaningless-sessions"); setMessage(undefined);
    try {
      const result = await adminApi<{ deletedSessionCount: number; deletedStoragePaths: string[] }>("/admin/maintenance/prune-meaningless-sessions", { method: "POST" });
      setMessage(`무의미 세션 ${result.deletedSessionCount}개를 삭제했습니다. (스토리지 파일 ${result.deletedStoragePaths.length}개)`);
      await refresh();
    }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "세션 삭제에 실패했습니다."); }
    finally { setRunning(undefined); }
  };
  const data = dashboard.data;

  if (dashboard.isLoading) return <div className="loading-state"><div><div className="spinner"/><p>운영 현황을 불러오는 중입니다.</p></div></div>;
  if (!data || dashboard.isError) return <AdminConnectionError title="운영 현황을 불러오지 못했습니다." onRetry={() => void dashboard.refetch()}/>;

  const totalCredits = credits.data?.total;
  const lowCredits = totalCredits && totalCredits.quota > 0 && totalCredits.remaining / totalCredits.quota < .2;
  return <main className="admin-page">
    <header className="admin-topbar"><div><p className="panel-kicker">ASKBOSS OPERATIONS</p><h1>운영 관리자</h1><p>마지막 집계 {formatDate(data.generatedAt)}</p></div><div className="admin-top-actions"><Link className="secondary-button" to="/admin/personal-bosses"><UsersRound size={16}/>사용자 상사·프롬프트</Link><Link className="secondary-button" to="/admin/global-boss"><Bot size={16}/>모두의 상사 관리</Link><button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={16}/>새로고침</button><button className="text-button" onClick={() => void onLogout()}><LogOut size={16}/>로그아웃</button></div></header>
    {message && <div className="admin-notice" role="status">{message}</div>}
    {(data.jobs.failed > 0 || lowCredits) && <section className="admin-alert"><AlertTriangle size={19}/><div><strong>확인이 필요한 항목이 있습니다.</strong><p>{data.jobs.failed > 0 ? `실패한 AI Job ${data.jobs.failed}개` : ""}{data.jobs.failed > 0 && lowCredits ? " · " : ""}{lowCredits ? "AI 크레딧 20% 미만" : ""}</p></div></section>}

    <section className="admin-section"><div className="admin-section-title"><UsersRound size={19}/><div><h2>세션 현황</h2><p>사용자를 식별할 수 없는 운영 집계입니다.</p></div></div><div className="admin-metric-grid"><Metric label="만료 전 세션" value={data.sessions.total}/><Metric label="최근 15분 활성" value={data.sessions.active15m}/><Metric label="24시간 신규" value={data.sessions.new24h}/><Metric label="1시간 내 만료" value={data.sessions.expiring1h}/></div></section>
    <section className="admin-section"><div className="admin-section-title"><Activity size={19}/><div><h2>24시간 사용량</h2><p>원문 없이 기능 호출만 집계합니다.</p></div></div><div className="admin-metric-grid"><Metric label="개인 상사" value={data.usage.personalBosses}/><Metric label="대화 메시지" value={data.usage.chatMessages24h}/><Metric label="번역" value={data.usage.translations24h}/><Metric label="만료 미완료 업로드" value={data.uploads.expiredIncomplete}/></div></section>

    <section className="admin-section"><div className="admin-section-title"><Bot size={19}/><div><h2>AI 상태와 크레딧</h2><p>{credits.data ? `${credits.data.latencyMs}ms · ${credits.data.models.mode === "live" ? "실 API" : "데모"}` : credits.isError ? "조회 실패" : "조회 중"}</p></div></div>{credits.data?.available ? <div className="credit-grid"><CreditCard title="월별 크레딧" bucket={credits.data.monthly}/><CreditCard title="충전 크레딧" bucket={credits.data.purchased}/><CreditCard title="전체 크레딧" bucket={credits.data.total}/></div> : <div className="admin-inline-error"><AlertTriangle size={18}/><span>{credits.isError ? "크레딧 API에 연결하지 못했습니다." : credits.data?.error ?? "크레딧을 조회하는 중입니다."}</span>{credits.isError && <button className="small-button" type="button" onClick={() => void credits.refetch()}>다시 시도</button>}</div>}<div className="model-status"><span className={credits.data?.models.ok ? "status-ok" : "status-error"}/><strong>{credits.data?.models.ok ? "필수 모델 정상" : "필수 모델 확인 필요"}</strong>{credits.data?.models.missing.length ? <small>누락: {credits.data.models.missing.join(", ")}</small> : null}</div></section>

    <PersonalBossDefaultsCard/>
    <AiPromptSettingsCard/>
    <TranslationExamplesCard/>

    <section className="admin-section"><div className="admin-section-title"><Clock3 size={19}/><div><h2>AI Job</h2><p>오래 대기하거나 실패한 작업을 확인합니다.</p></div></div><div className="admin-metric-grid"><Metric label="대기" value={data.jobs.pending}/><Metric label="실행 중" value={data.jobs.running}/><Metric label="실패" value={data.jobs.failed}/><Metric label="최장 대기" value={data.jobs.oldestPendingMinutes === null ? "없음" : `${data.jobs.oldestPendingMinutes}분`}/></div>{data.jobs.failureReasons.length > 0 && <div className="failure-summary" aria-label="Job 실패 원인 요약">{data.jobs.failureReasons.map((item) => <span key={item.reason}>{item.reason} <strong>{item.count}</strong></span>)}</div>}{jobs.isError ? <div className="admin-inline-error"><AlertTriangle size={18}/><span>Job 목록을 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void jobs.refetch()}>다시 시도</button></div> : <div className="admin-table-wrap"><table><thead><tr><th>종류</th><th>상태</th><th>시도</th><th>시각</th><th>조치</th></tr></thead><tbody>{jobs.data?.items.map((job) => <tr key={job.id}><td>{job.type}</td><td><span className={`job-status status-${job.status.toLowerCase()}`}>{job.status}</span>{job.errorMessage && <small className="job-error">{job.errorMessage}</small>}</td><td>{job.attempts}/{job.maxAttempts}</td><td>{formatDate(job.updatedAt)}</td><td>{job.status === "FAILED" ? <button className="small-button" disabled={running === job.id} onClick={() => void operation(job.id, `/admin/jobs/${job.id}/retry`)}><Play size={14}/>재시도</button> : "—"}</td></tr>)}</tbody></table></div>}</section>

    <section className="admin-grid-two"><div className="admin-section"><div className="admin-section-title"><Database size={19}/><div><h2>최근 세션</h2><p>식별자는 마스킹됩니다.</p></div></div>{sessions.isError ? <div className="admin-inline-error"><AlertTriangle size={18}/><span>세션 목록을 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void sessions.refetch()}>다시 시도</button></div> : <><div className="admin-table-wrap"><table><thead><tr><th>세션</th><th>마지막 활동</th><th>상사</th><th>대화</th></tr></thead><tbody>{sessions.data?.items?.map((session) => <tr key={session.id}><td><code>{session.id}</code></td><td>{formatDate(session.lastSeenAt)}</td><td>{session.bossCount}</td><td>{session.chatMessageCount}</td></tr>)}</tbody></table></div>{sessions.data && sessions.data.totalPages > 1 && <nav className="admin-pagination" aria-label="최근 세션 페이지"><button className="small-button" type="button" disabled={sessionPage <= 1 || sessions.isFetching} onClick={() => setSessionPage((page) => Math.max(1, page - 1))}>이전</button><span>{sessionPage} / {sessions.data.totalPages}</span><button className="small-button" type="button" disabled={sessionPage >= sessions.data.totalPages || sessions.isFetching} onClick={() => setSessionPage((page) => page + 1)}>다음</button></nav>}</>}</div>
    <div className="admin-section"><div className="admin-section-title"><ShieldCheck size={19}/><div><h2>유지관리</h2><p>최근 활동이나 사용자 입력이 있는 세션은 변경하지 않습니다.</p></div></div><div className="maintenance-actions"><button className="secondary-button" disabled={Boolean(running)} onClick={() => void operation("cleanup", "/admin/maintenance/cleanup")}>만료 데이터 정리</button><button className="secondary-button" disabled={Boolean(running)} onClick={() => void operation("rollup", "/admin/maintenance/rollup")}>Analytics 집계</button><button className="secondary-button" disabled={Boolean(running)} onClick={() => void pruneMeaninglessSessions()}>무의미 세션 삭제</button></div><h3>최근 실행</h3><ul className="operation-list">{data.recentOperations.map((item) => <li key={item.id}><span>{item.detail.action === "PERSONAL_BOSS_PROMPT_VIEW" ? "PERSONAL_BOSS_PROMPT_VIEW" : item.type}</span><strong className={item.status === "SUCCEEDED" ? "success-text" : "error-text"}>{item.status}</strong><time>{formatDate(item.createdAt)}</time></li>)}{data.recentOperations.length === 0 && <li>실행 기록이 없습니다.</li>}</ul></div></section>
  </main>;
}

export function AdminPage() {
  const cache = useQueryClient();
  const location = useLocation();
  const auth = useQuery({ queryKey: ["admin", "auth"], queryFn: () => adminApi<{ authenticated: boolean; expiresAt: string | null }>("/admin/auth"), retry: false });
  const logout = async () => { try { await adminApi("/admin/logout", { method: "POST" }); } finally { cache.removeQueries({ queryKey: ["admin"] }); cache.setQueryData(["admin", "auth"], { authenticated: false, expiresAt: null }); } };
  if (auth.isLoading) return <div className="loading-state"><div><div className="spinner"/><p>관리자 연결을 확인하는 중입니다.</p></div></div>;
  if (auth.isError) return <AdminConnectionError onRetry={() => void auth.refetch()}/>;
  if (!auth.data?.authenticated) return <AdminLogin onSuccess={() => void cache.invalidateQueries({ queryKey: ["admin", "auth"] })}/>;
  if (location.pathname === "/admin/global-boss") return <GlobalBossAdmin onLogout={logout}/>;
  if (location.pathname === "/admin/personal-bosses") return <PersonalBossPromptsAdmin onLogout={logout}/>;
  return <AdminDashboardView onLogout={logout}/>;
}
