import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Eye, LogOut, RefreshCw, ShieldAlert, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT, CHAT_CONTEXT_TOTAL_MESSAGE_LIMIT, type AdminPersonalBossPage, type AdminPersonalBossPromptPreview, type AdminPersonalBossPromptSource, type AdminPromptMessage, type UserProfile } from "@askboss/shared";
import { api } from "../../services/api-client";

const READ_TIMEOUT_MS = 12_000;
const adminReadApi = <T,>(path: string) => api<T>(path, { timeoutMs: READ_TIMEOUT_MS });

interface Props { onLogout: () => Promise<void> }

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function PromptSources({ sources }: { sources: AdminPersonalBossPromptSource[] }) {
  return <div className="admin-table-wrap admin-prompt-source-table"><table><thead><tr><th>역할</th><th>구성요소</th><th>출처</th><th>설명</th><th>개인정보</th></tr></thead><tbody>
    {sources.map((source, index) => <tr key={`${source.role}-${source.component}-${index}`}><td><code>{source.role}</code></td><td>{source.component}</td><td>{source.origin}</td><td>{source.description}</td><td>{source.containsPersonalData ? <strong className="sensitive-text">포함</strong> : "없음"}</td></tr>)}
  </tbody></table></div>;
}

function PromptMessages({ messages }: { messages: AdminPromptMessage[] }) {
  return <div className="admin-personal-prompt-messages">{messages.map((message, index) => <div className="admin-prompt-raw" key={`${message.role}-${index}`}><strong>{message.role}</strong><pre>{message.content}</pre></div>)}</div>;
}

function ProfileSummary({ profile }: { profile: UserProfile | null }) {
  if (!profile) return <p className="hint">저장된 사용자 프로필이 없습니다.</p>;
  return <dl className="admin-personal-profile">
    <div><dt>사용자 ID</dt><dd>{profile.handle}</dd></div><div><dt>연령대</dt><dd>{profile.ageBand}대</dd></div>
    <div><dt>직급</dt><dd>{profile.rank}</dd></div><div><dt>직무</dt><dd>{profile.jobFunction || "—"}</dd></div>
    <div><dt>경력</dt><dd>{profile.yearsOfServiceBand}</dd></div><div><dt>입사 경로</dt><dd>{profile.entryPath}</dd></div>
    <div className="admin-personal-profile-wide"><dt>보완점</dt><dd>{profile.weaknesses.length ? profile.weaknesses.join(", ") : "—"}</dd></div>
  </dl>;
}

export function PersonalBossPromptsAdmin({ onLogout }: Props) {
  const cache = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedBossId, setSelectedBossId] = useState<string>();
  const [revealedBossId, setRevealedBossId] = useState<string>();
  const [activeTab, setActiveTab] = useState<"persona" | "chat">("persona");
  const list = useQuery({
    queryKey: ["admin", "personal-bosses", page],
    queryFn: () => adminReadApi<AdminPersonalBossPage>(`/admin/personal-bosses?page=${page}`),
    retry: false,
  });
  const preview = useQuery({
    queryKey: ["admin", "personal-bosses", "prompt", revealedBossId],
    queryFn: () => adminReadApi<AdminPersonalBossPromptPreview>(`/admin/personal-bosses/${revealedBossId}/prompt-preview`),
    enabled: Boolean(revealedBossId),
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  useEffect(() => () => { cache.removeQueries({ queryKey: ["admin", "personal-bosses", "prompt"] }); }, [cache]);
  useEffect(() => {
    if (list.data && page > list.data.totalPages) setPage(Math.max(1, list.data.totalPages));
  }, [list.data, page]);

  const selected = list.data?.items.find((item) => item.id === selectedBossId);
  const selectBoss = (id: string) => {
    cache.removeQueries({ queryKey: ["admin", "personal-bosses", "prompt"] });
    setSelectedBossId(id);
    setRevealedBossId(undefined);
    setActiveTab("persona");
  };
  const movePage = (next: number) => {
    cache.removeQueries({ queryKey: ["admin", "personal-bosses", "prompt"] });
    setSelectedBossId(undefined);
    setRevealedBossId(undefined);
    setActiveTab("persona");
    setPage(next);
  };

  return <main className="admin-page personal-boss-prompts-admin">
    <header className="admin-topbar"><div><p className="panel-kicker">ASKBOSS OPERATIONS</p><h1>사용자 상사·프롬프트</h1><p>개인 상사의 현재 생성 문맥과 실제 대화 전달 형식을 조회합니다.</p></div><div className="admin-top-actions"><Link className="secondary-button" to="/admin"><ArrowLeft size={16}/>운영 현황</Link><button className="text-button" type="button" onClick={() => void onLogout()}><LogOut size={16}/>로그아웃</button></div></header>

    <section className="admin-alert admin-sensitive-alert" role="note"><ShieldAlert size={20}/><div><strong>이 화면에는 실제 사용자 프로필과 대화 원문이 포함될 수 있습니다.</strong><p>필요한 상사만 선택해 확인하세요. 원문 조회는 운영 감사 기록에 남으며 브라우저에 지속 저장하지 않습니다.</p></div></section>

    <section className="admin-personal-boss-layout">
      <div className="admin-section admin-personal-boss-list"><div className="admin-section-title"><UsersRound size={19}/><div><h2>사용자가 만든 상사</h2><p>만료되지 않은 개인 상사를 최근 활동순으로 표시합니다.</p></div></div>
        {list.isLoading ? <div className="admin-list-loading"><div className="spinner"/><p>개인 상사를 불러오는 중입니다.</p></div> : list.isError ? <div className="admin-inline-error"><ShieldAlert size={18}/><span>개인 상사 목록을 불러오지 못했습니다.</span><button className="small-button" type="button" onClick={() => void list.refetch()}><RefreshCw size={14}/>다시 시도</button></div> : list.data?.items.length ? <>
          <div className="admin-table-wrap"><table><thead><tr><th>사용자</th><th>상사</th><th>상태</th><th>대화</th><th>최근 활동</th><th>조회</th></tr></thead><tbody>
            {list.data.items.map((boss) => <tr key={boss.id} className={selectedBossId === boss.id ? "is-selected" : undefined}><td>{boss.ownerHandle ?? "프로필 없음"}</td><td><strong>{boss.alias}</strong><small>v{boss.personaVersion} · 파악도 {boss.pkiScore === null ? "—" : `${Math.round(boss.pkiScore)}%`}</small></td><td><span className={`job-status status-${boss.status.toLowerCase()}`}>{boss.status}</span></td><td>{boss.chatMessageCount}</td><td>{formatDate(boss.lastActivityAt)}</td><td><button className="small-button" type="button" aria-pressed={selectedBossId === boss.id} onClick={() => selectBoss(boss.id)}>선택</button></td></tr>)}
          </tbody></table></div>
          {list.data.totalPages > 1 && <nav className="admin-pagination" aria-label="개인 상사 페이지"><button className="small-button" type="button" disabled={page <= 1 || list.isFetching} onClick={() => movePage(Math.max(1, page - 1))}>이전</button><span>{page} / {list.data.totalPages}</span><button className="small-button" type="button" disabled={page >= list.data.totalPages || list.isFetching} onClick={() => movePage(page + 1)}>다음</button></nav>}
        </> : <div className="admin-empty-state"><Bot size={24}/><strong>조회할 개인 상사가 없습니다.</strong><p>사용자가 만든 상사가 생기면 이곳에 표시됩니다.</p></div>}
      </div>

      <div className="admin-section admin-personal-boss-detail"><div className="admin-section-title"><Bot size={19}/><div><h2>프롬프트 원문</h2><p>현재 저장 상태를 기준으로 재조립합니다.</p></div></div>
        {!selected ? <div className="admin-empty-state"><Eye size={24}/><strong>상사를 선택해 주세요.</strong><p>왼쪽 목록에서 확인할 상사를 선택하면 상세 조회 안내가 표시됩니다.</p></div> : revealedBossId !== selected.id ? <div className="admin-prompt-reveal"><h3>{selected.ownerHandle ?? "프로필 없음"} · {selected.alias}</h3><p>사용자 프로필, 상사 정보, 관찰 자료와 실제 채팅 원문을 불러옵니다. 조회 사실은 감사 기록에 저장됩니다.</p><button className="primary-button" type="button" onClick={() => setRevealedBossId(selected.id)}><Eye size={16}/>민감정보 포함 원문 보기</button></div> : preview.isLoading ? <div className="admin-list-loading"><div className="spinner"/><p>프롬프트를 안전하게 불러오는 중입니다.</p></div> : preview.isError || !preview.data ? <div className="admin-inline-error"><ShieldAlert size={18}/><span>프롬프트 원문을 불러오지 못했습니다. 상사가 만료되었거나 감사 기록 저장에 실패했을 수 있습니다.</span><button className="small-button" type="button" onClick={() => void preview.refetch()}><RefreshCw size={14}/>다시 시도</button></div> : <div className="admin-personal-prompt-detail">
          <div className="admin-prompt-reconstruction-note"><strong>현재 상태 재조립</strong><span>{formatDate(preview.data.reconstructedAt)} · 페르소나 v{preview.data.boss.personaVersion ?? 0}</span><p>과거 호출 당시를 저장한 스냅샷이 아닙니다. 관리자 지침이나 페르소나가 변경되면 표시되는 원문도 달라집니다.</p></div>
          <div className="persona-preview"><strong>{preview.data.boss.alias}</strong><p>{preview.data.boss.companyName ?? "회사 미입력"} · {preview.data.boss.rank ?? "직급 미입력"} · {preview.data.boss.jobFunction ?? "직무 미입력"}</p><small>{preview.data.boss.persona?.summary ?? "아직 생성된 페르소나가 없습니다."}</small></div>
          <ProfileSummary profile={preview.data.profile}/>
          <div className="admin-prompt-tabs" role="tablist" aria-label="개인 상사 프롬프트 종류"><button id="personal-prompt-persona-tab" role="tab" aria-selected={activeTab === "persona"} aria-controls="personal-prompt-persona-panel" type="button" onClick={() => setActiveTab("persona")}>페르소나 생성</button><button id="personal-prompt-chat-tab" role="tab" aria-selected={activeTab === "chat"} aria-controls="personal-prompt-chat-panel" type="button" onClick={() => setActiveTab("chat")}>상사 대화</button></div>
          {activeTab === "persona" ? <section id="personal-prompt-persona-panel" role="tabpanel" aria-labelledby="personal-prompt-persona-tab" className="admin-prompt-tab-panel"><p className="hint">페르소나 생성 호출에는 사용자 프로필·상사 정보·관찰 근거·설문이 들어갑니다. 채팅 원문은 이 호출에 직접 포함되지 않으며 ‘상사 대화’ 탭에서 확인할 수 있습니다.</p><div className="admin-prompt-stats"><span>관찰 근거 <strong>{preview.data.personaGeneration.evidenceCount}</strong></span><span>설문 응답 <strong>{preview.data.personaGeneration.surveyAnswerCount}</strong></span></div><PromptSources sources={preview.data.personaGeneration.sources}/><PromptMessages messages={preview.data.personaGeneration.messages}/></section> : <section id="personal-prompt-chat-panel" role="tabpanel" aria-labelledby="personal-prompt-chat-tab" className="admin-prompt-tab-panel"><p className="hint">현재 설정과 최근 일반 대화를 조합한 재구성 결과입니다. 마지막 질문 뒤의 AI 답변과 직전 {CHAT_CONTEXT_HISTORY_MESSAGE_LIMIT}개보다 오래된 메시지는 입력 문맥에서 제외되며, 현재 질문을 포함해 최대 {CHAT_CONTEXT_TOTAL_MESSAGE_LIMIT}개를 사용합니다.</p>{preview.data.chat.status === "NO_CHAT_HISTORY" ? <div className="admin-empty-state"><Bot size={22}/><strong>일반 대화 기록이 없습니다.</strong><p>{preview.data.chat.reason}{preview.data.chat.totalMessageCount > 0 ? ` 활성 스레드에는 시뮬레이션 메시지 ${preview.data.chat.totalMessageCount}개만 있습니다.` : ""}</p></div> : <><div className="admin-prompt-stats"><span>직전 이력 <strong>{preview.data.chat.historyMessageCount}</strong></span><span>전체 포함 <strong>{preview.data.chat.includedMessageCount}</strong></span><span>활성 대화 전체 <strong>{preview.data.chat.totalMessageCount}</strong></span><span>마지막 질문 <strong>{formatDate(preview.data.chat.lastQuestionAt)}</strong></span></div><PromptSources sources={preview.data.chat.sources}/><PromptMessages messages={preview.data.chat.messages}/></>}</section>}
        </div>}
      </div>
    </section>
  </main>;
}
