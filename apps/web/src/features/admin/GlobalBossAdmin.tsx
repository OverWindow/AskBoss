import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bot, FileText, Image, LogOut, RefreshCw, Save, Settings2, Trash2, Upload } from "lucide-react";
import { AGE_BANDS, AVATARS, BOSS_RANKS, BOSS_TENURE_BANDS, JOB_FUNCTIONS, type AdminGlobalBossDetail, type Boss, type BossSurveyQuestion, type CompanyResearch, type GlobalBossDefaults, type GlobalBossPromptPreview } from "@askboss/shared";
import { api } from "../../services/api-client";
import { uploadToSignedUrl } from "../../services/upload-client";

const TIMEOUT = 60_000;
const READ_TIMEOUT = 12_000;
const adminApi = <T,>(path: string, options: RequestInit = {}) => api<T>(path, { ...options, timeoutMs: TIMEOUT });
const adminReadApi = <T,>(path: string) => api<T>(path, { timeoutMs: READ_TIMEOUT });
const Options = ({ values }: { values: readonly (string | number)[] }) => <>{values.map((value) => <option key={value} value={value}>{typeof value === "number" ? `${value}대${value === 60 ? "+" : ""}` : value}</option>)}</>;

interface Props { onLogout: () => Promise<void> }

export function GlobalBossAdmin({ onLogout }: Props) {
  const detail = useQuery({
    queryKey: ["admin", "global-boss"],
    queryFn: () => adminReadApi<AdminGlobalBossDetail>("/admin/global-boss"),
    refetchInterval: (query) => query.state.data?.evidence.some((item) => item.status === "PENDING" || item.status === "PROCESSING") ? 1_200 : false,
    retry: false,
  });
  const promptSettings = useQuery({
    queryKey: ["admin", "global-boss-defaults"],
    queryFn: () => adminReadApi<GlobalBossDefaults>("/admin/global-boss-defaults"),
    retry: false,
  });
  const promptPreview = useQuery({
    queryKey: ["admin", "global-boss", "prompt-preview"],
    queryFn: () => adminReadApi<GlobalBossPromptPreview>("/admin/global-boss/prompt-preview"),
    retry: false,
  });
  const [boss, setBoss] = useState<Boss | null>(null);
  const [globalPrompt, setGlobalPrompt] = useState("");
  const [textEvidence, setTextEvidence] = useState("");
  const [questions, setQuestions] = useState<BossSurveyQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, { selectedOption: string | null; freeText: string }>>({});
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");

  useEffect(() => { if (!boss && detail.data?.boss) setBoss(detail.data.boss); }, [boss, detail.data?.boss]);
  useEffect(() => { if (typeof promptSettings.data?.prompt === "string") setGlobalPrompt(promptSettings.data.prompt); }, [promptSettings.data?.prompt]);
  useEffect(() => {
    if (questions.length || !detail.data?.surveyAnswers.length) return;
    setQuestions(detail.data.surveyAnswers.map((item) => item.questionSnapshot as unknown as BossSurveyQuestion));
    setAnswers(Object.fromEntries(detail.data.surveyAnswers.map((item) => [item.questionId, { selectedOption: item.selectedOption, freeText: item.freeText ?? "" }])));
  }, [detail.data?.surveyAnswers, questions.length]);

  const patchBoss = <K extends keyof Boss>(key: K, value: Boss[K]) => setBoss((current) => current ? { ...current, [key]: value } : current);
  const saveBoss = async () => {
    if (!boss) return;
    setBusy("save"); setMessage("");
    try {
      const { boss: saved } = await adminApi<{ boss: Boss }>("/admin/global-boss", { method: "PATCH", body: JSON.stringify({ alias: boss.alias, avatarKey: boss.avatarKey, jobFunction: boss.jobFunction, yearsOfServiceBand: boss.yearsOfServiceBand, rank: boss.rank, companyName: boss.companyName, ageBand: boss.ageBand, hierarchyScore: boss.hierarchyScore, companyResearch: boss.companyResearch }) });
      setBoss(saved); setMessage("모두의 상사 기본 정보를 저장했습니다."); await Promise.all([detail.refetch(), promptPreview.refetch()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const saveGlobalPrompt = async () => {
    setBusy("global-prompt"); setMessage("");
    try {
      const saved = await adminApi<GlobalBossDefaults>("/admin/global-boss-defaults", { method: "PUT", body: JSON.stringify({ prompt: globalPrompt }) });
      setGlobalPrompt(saved.prompt); setMessage(saved.prompt ? "모두의 상사 전용 프롬프트를 저장했습니다." : "모두의 상사 전용 프롬프트를 비활성화했습니다."); await Promise.all([promptSettings.refetch(), promptPreview.refetch()]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "전용 프롬프트를 저장하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const researchCompany = async () => {
    if (!boss?.companyName) return;
    setBusy("research"); setMessage("");
    try { const result = await adminApi<{ research: CompanyResearch | null; warning?: string }>("/admin/global-boss/company-research", { method: "POST", body: JSON.stringify({ companyName: boss.companyName }) }); patchBoss("companyResearch", result.research); setMessage(result.warning ?? "회사 공개 정보를 불러왔습니다. 저장 버튼을 눌러 반영하세요."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "회사 정보를 불러오지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const addTextEvidence = async () => {
    if (!textEvidence.trim()) return;
    setBusy("evidence"); setMessage("");
    try { await adminApi("/admin/global-boss/evidence", { method: "POST", body: JSON.stringify({ type: "TEXT", rawText: textEvidence.trim() }) }); setTextEvidence(""); setMessage("대화 자료를 분석 목록에 추가했습니다."); await detail.refetch(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "자료를 추가하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const uploadFile = async (file: File) => {
    setBusy("evidence"); setMessage(`${file.name} 업로드 중…`);
    try {
      const { upload } = await adminApi<{ upload: { intentId: string; signedUrl: string | null; token: string | null } }>("/admin/global-boss/uploads/sign", { method: "POST", body: JSON.stringify({ fileName: file.name, contentType: file.type, size: file.size }) });
      if (upload.signedUrl) await uploadToSignedUrl(upload.signedUrl, file, upload.token);
      await adminApi("/admin/global-boss/evidence", { method: "POST", body: JSON.stringify({ type: file.type === "text/plain" ? "TXT" : "IMAGE", uploadIntentId: upload.intentId }) });
      setMessage(`${file.name}을 분석 목록에 추가했습니다.`); await detail.refetch();
    } catch (error) { setMessage(error instanceof Error ? error.message : "파일을 추가하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const deleteEvidence = async (id: string) => {
    if (!window.confirm("이 관찰 자료를 삭제할까요? 다음 재생성부터 제외됩니다.")) return;
    setBusy(id); setMessage("");
    try { await adminApi(`/admin/global-boss/evidence/${id}`, { method: "DELETE" }); setMessage("관찰 자료를 삭제했습니다."); await detail.refetch(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "자료를 삭제하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const generateSurvey = async () => {
    setBusy("survey-generate"); setMessage("");
    try { const result = await adminApi<{ questions: BossSurveyQuestion[] }>("/admin/global-boss/survey/generate", { method: "POST" }); setQuestions(result.questions); setAnswers({}); setMessage("새 상황 질문을 만들었습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "질문을 만들지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const saveSurvey = async () => {
    setBusy("survey-save"); setMessage("");
    try { await adminApi("/admin/global-boss/survey/answers", { method: "PUT", body: JSON.stringify({ answers: questions.map((question) => ({ questionId: question.id, questionSnapshot: question, selectedOption: answers[question.id]?.selectedOption ?? null, freeText: answers[question.id]?.freeText || null })) }) }); setMessage("설문 답변을 저장했습니다."); await detail.refetch(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "설문을 저장하지 못했습니다."); }
    finally { setBusy(undefined); }
  };
  const waitForJob = async (jobId: string) => {
    for (let attempt = 0; attempt < 120; attempt++) {
      const { job } = await adminApi<{ job: { status: string; errorMessage?: string } }>(`/admin/jobs/${jobId}`);
      if (job.status === "SUCCEEDED") return;
      if (job.status === "FAILED") throw new Error(job.errorMessage ?? "페르소나 재생성에 실패했습니다.");
      await new Promise((resolve) => window.setTimeout(resolve, 1_000));
    }
    throw new Error("재생성이 예상보다 오래 걸리고 있습니다. Job 목록에서 상태를 확인해 주세요.");
  };
  const rebuild = async () => {
    setBusy("rebuild"); setMessage("기존 페르소나를 유지한 채 새 버전을 만들고 있습니다…");
    try { const { jobId } = await adminApi<{ jobId: string }>("/admin/global-boss/persona/rebuild", { method: "POST" }); await waitForJob(jobId); const [refreshed] = await Promise.all([detail.refetch(), promptPreview.refetch()]); if (refreshed.data?.boss) setBoss(refreshed.data.boss); setMessage("새 페르소나를 사용자에게 반영했습니다."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "페르소나를 재생성하지 못했습니다."); }
    finally { setBusy(undefined); }
  };

  if (detail.isLoading) return <div className="loading-state"><div className="spinner"/></div>;
  if (detail.isError || !boss) return <main className="admin-page"><div className="admin-section"><p className="error-text">모두의 상사 정보를 불러오지 못했습니다.</p><button className="secondary-button" onClick={() => void detail.refetch()}>다시 시도</button></div></main>;
  const evidence = detail.data?.evidence ?? [];
  const processing = evidence.some((item) => item.status === "PENDING" || item.status === "PROCESSING");

  return <main className="admin-page global-boss-admin">
    <header className="admin-topbar"><div><p className="panel-kicker">ASKBOSS OPERATIONS</p><h1>모두의 상사 관리</h1><p>입력 자료를 검토한 뒤 새 페르소나를 명시적으로 반영합니다.</p></div><div className="admin-top-actions"><Link className="secondary-button" to="/admin"><ArrowLeft size={16}/>운영 현황</Link><button className="text-button" onClick={() => void onLogout()}><LogOut size={16}/>로그아웃</button></div></header>
    {message && <div className="admin-notice" role="status">{message}</div>}

    <section className="admin-section"><div className="admin-section-title"><Bot/><div><h2>기본 정보</h2><p>저장 즉시 기본 정보가 반영되며 페르소나는 재생성 전까지 유지됩니다.</p></div></div>
      <div className="admin-boss-form"><div className="avatar-options compact">{AVATARS.map((key) => <button type="button" key={key} className={`avatar-option ${boss.avatarKey === key ? "is-selected" : ""}`} onClick={() => patchBoss("avatarKey", key)}><img src={`/avatars/${key}.png`} alt={key}/></button>)}</div>
        <label>별칭<input className="input" value={boss.alias} onChange={(event) => patchBoss("alias", event.target.value)}/></label>
        <label>직무<select className="select" value={boss.jobFunction ?? ""} onChange={(event) => patchBoss("jobFunction", event.target.value || null)}><option value="">미지정</option><Options values={JOB_FUNCTIONS}/></select></label>
        <label>연차<select className="select" value={boss.yearsOfServiceBand ?? ""} onChange={(event) => patchBoss("yearsOfServiceBand", event.target.value || null)}><option value="">미지정</option><Options values={BOSS_TENURE_BANDS}/></select></label>
        <label>직급<select className="select" value={boss.rank ?? ""} onChange={(event) => patchBoss("rank", event.target.value || null)}><option value="">미지정</option><Options values={BOSS_RANKS}/></select></label>
        <label>회사<input className="input" value={boss.companyName ?? ""} onChange={(event) => { patchBoss("companyName", event.target.value || null); patchBoss("companyResearch", null); }}/></label>
        <label>나이대<select className="select" value={boss.ageBand ?? ""} onChange={(event) => patchBoss("ageBand", event.target.value ? Number(event.target.value) : null)}><option value="">미지정</option><Options values={AGE_BANDS}/></select></label>
        <label>위계도 <b>{boss.hierarchyScore ?? 50}</b><input className="range" type="range" min="0" max="100" value={boss.hierarchyScore ?? 50} onChange={(event) => patchBoss("hierarchyScore", Number(event.target.value))}/></label>
        <div className="admin-form-actions"><button className="secondary-button" disabled={!boss.companyName || Boolean(busy)} onClick={() => void researchCompany()}><RefreshCw size={16}/>{busy === "research" ? "조사 중…" : "회사 정보 조사"}</button><button className="primary-button" disabled={Boolean(busy)} onClick={() => void saveBoss()}><Save size={16}/>{busy === "save" ? "저장 중…" : "기본 정보 저장"}</button></div>
        {boss.companyResearch && <div className="company-research-preview"><strong>{boss.companyResearch.industry ?? "업종 미확인"}</strong><p>{boss.companyResearch.businessSummary}</p><small>신뢰도 {Math.round(boss.companyResearch.confidence * 100)}%</small></div>}
      </div>
    </section>

    <section className="admin-section"><div className="admin-section-title"><Settings2/><div><h2>모두의 상사 전용 프롬프트</h2><p>모두의 상사에게만 적용되며 개인 상사 공통 기본 성격과 완전히 분리됩니다.</p></div></div>
      {promptSettings.isError ? <div className="admin-inline-error"><span>전용 프롬프트를 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void promptSettings.refetch()}>다시 시도</button></div> : <div className="admin-prompt-form">
        <label htmlFor="global-boss-base-prompt">시스템 프롬프트형 기본 성격</label>
        <textarea id="global-boss-base-prompt" className="textarea" maxLength={5_000} value={globalPrompt} disabled={promptSettings.isLoading || busy === "global-prompt"} onChange={(event) => setGlobalPrompt(event.target.value)} placeholder="비워서 모두의 상사 전용 지침을 비활성화할 수 있습니다."/>
        <div className="admin-prompt-meta"><small>{globalPrompt.length.toLocaleString("ko-KR")} / 5,000자</small>{promptSettings.data?.updatedAt && <small>마지막 저장 {new Date(promptSettings.data.updatedAt).toLocaleString("ko-KR")}</small>}</div>
        <p className="hint">저장 즉시 새 대화·번역·시뮬레이션·혼잣말에 적용됩니다. 현재 페르소나는 다음 재생성 때 갱신됩니다.</p>
        <div className="admin-form-actions"><button className="primary-button" type="button" disabled={promptSettings.isLoading || Boolean(busy)} onClick={() => void saveGlobalPrompt()}>{busy === "global-prompt" ? "저장 중…" : "전용 프롬프트 저장"}</button></div>
      </div>}
      <div className="admin-prompt-preview">
        <div className="admin-prompt-preview-title"><div><h3>AI 전달 프롬프트 원문</h3><p className="hint">저장된 실사용 설정과 페르소나에 관리자 미리보기용 가상 프로필·대화·질문을 결합합니다. 실제 사용자 데이터는 포함하지 않습니다.</p></div><button className="small-button" type="button" disabled={promptPreview.isFetching} onClick={() => void promptPreview.refetch()}><RefreshCw size={14}/>{promptPreview.isFetching ? "갱신 중…" : "새로고침"}</button></div>
        {promptPreview.isError ? <div className="admin-inline-error"><span>프롬프트 원문을 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void promptPreview.refetch()}>다시 시도</button></div> : promptPreview.isLoading ? <p className="hint">프롬프트 원문을 조립하는 중입니다.</p> : <>
          <div className="admin-prompt-sources"><h4>구성요소 출처</h4><div className="admin-table-wrap"><table><thead><tr><th>역할</th><th>구성요소</th><th>가져온 곳</th><th>설명</th></tr></thead><tbody>{promptPreview.data?.sources.map((source) => <tr key={`${source.role}:${source.component}`}><td><code>{source.role}</code></td><td>{source.component}{source.usesMockData && <span className="prompt-source-mock">가상</span>}</td><td>{source.origin}</td><td>{source.description}</td></tr>)}</tbody></table></div></div>
          {promptPreview.data?.messages.map((promptMessage) => <div className="admin-prompt-raw" key={promptMessage.role}><strong>{promptMessage.role}</strong><pre>{promptMessage.content}</pre></div>)}
        </>}
      </div>
    </section>

    <section className="admin-section"><div className="admin-section-title"><FileText/><div><h2>관찰 자료</h2><p>카톡 대화 붙여넣기와 TXT·이미지 자료를 영구 보관합니다.</p></div></div>
      <div className="admin-evidence-input"><textarea className="textarea" value={textEvidence} onChange={(event) => setTextEvidence(event.target.value)} placeholder="대화 내용을 붙여넣으세요."/><button className="primary-button" disabled={!textEvidence.trim() || Boolean(busy)} onClick={() => void addTextEvidence()}><Upload size={16}/>텍스트 추가</button></div>
      <div className="admin-upload-actions"><label className="secondary-button"><FileText size={16}/>TXT 업로드<input hidden type="file" accept=".txt,text/plain" onChange={(event) => { const file=event.target.files?.[0];if(file)void uploadFile(file);event.currentTarget.value=""; }}/></label><label className="secondary-button"><Image size={16}/>이미지 업로드<input hidden type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" onChange={(event) => { const file=event.target.files?.[0];if(file)void uploadFile(file);event.currentTarget.value=""; }}/></label></div>
      <div className="admin-evidence-list">{evidence.map((item) => <article key={item.id}><div><strong>{item.sourceName ?? item.type}</strong><span className={`job-status status-${item.status.toLowerCase()}`}>{item.status}</span><small>{new Date(item.createdAt).toLocaleString("ko-KR")}</small>{item.rawText && <p>{item.rawText}</p>}{item.errorMessage && <p className="error-text">{item.errorMessage}</p>}</div><button className="icon-button" aria-label={`${item.sourceName ?? item.type} 삭제`} disabled={busy === item.id} onClick={() => void deleteEvidence(item.id)}><Trash2 size={16}/></button></article>)}{!evidence.length && <p className="hint">등록된 관찰 자료가 없습니다.</p>}</div>
    </section>

    <section className="admin-section"><div className="admin-section-title"><FileText/><div><h2>상황 설문</h2><p>모두의 상사에게 맞는 상황 질문을 생성하고 답변합니다.</p></div></div><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void generateSurvey()}><RefreshCw size={16}/>{questions.length ? "질문 다시 생성" : "질문 생성"}</button>
      <div className="admin-survey-list">{questions.map((question) => { const answer=answers[question.id]??{selectedOption:null,freeText:""};return <article key={question.id}><span className="step-kicker">{question.category}</span><h3>{question.situation}</h3><div className="choice-grid">{question.options.map((option) => <button type="button" key={option.id} className={`choice ${answer.selectedOption === option.id ? "is-selected" : ""}`} onClick={() => setAnswers((old) => ({ ...old, [question.id]: { ...answer, selectedOption: option.id } }))}>{option.id}. {option.label}</button>)}</div>{question.allowFreeText && <textarea className="textarea" value={answer.freeText} onChange={(event) => setAnswers((old) => ({ ...old, [question.id]: { ...answer, freeText: event.target.value } }))} placeholder="직접 입력"/>}</article>;})}</div>
      {questions.length > 0 && <button className="primary-button" disabled={Boolean(busy)} onClick={() => void saveSurvey()}>{busy === "survey-save" ? "저장 중…" : "설문 답변 저장"}</button>}
    </section>

    <section className="admin-section"><div className="admin-section-title"><Bot/><div><h2>페르소나 반영</h2><p>현재 사용자에게 제공 중인 버전을 유지한 채 새 버전을 생성합니다.</p></div></div><div className="persona-preview"><strong>버전 {detail.data?.boss.personaVersion ?? 0}</strong><p>{detail.data?.boss.persona?.summary ?? "아직 생성된 페르소나가 없습니다."}</p><small>PKI {detail.data?.boss.pki?.score ?? 0} · 준비된 자료 {evidence.filter((item) => item.status === "READY").length}개</small></div>{processing && <p className="hint">자료 분석이 끝나면 재생성할 수 있습니다.</p>}<button className="primary-button" disabled={processing || Boolean(busy)} onClick={() => void rebuild()}><Bot size={17}/>{busy === "rebuild" ? "재생성 중…" : "페르소나 재생성 후 반영"}</button></section>
  </main>;
}
