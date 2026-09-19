import { useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronDown, ChevronUp, MessageCircle, Trash2, X } from "lucide-react";
import type { TranslationArchiveDetail, TranslationArchiveSummary } from "@askboss/shared";
import { Dialog } from "../components/Dialog";
import { ActualResponseDialog } from "../features/archive/ActualResponseDialog";
import { api } from "../services/api-client";
import { useSession } from "../features/session/useSession";

function ArchiveCard({ summary, onDelete, deleting }: { summary: TranslationArchiveSummary; onDelete: () => void; deleting: boolean }) {
  const cache = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [actualOpen, setActualOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const detail = useQuery({
    queryKey: ["archive", summary.id],
    queryFn: () => api<{ archive: TranslationArchiveDetail }>(`/archives/${summary.id}`).then((response) => response.archive),
    enabled: expanded || actualOpen,
  });
  const archive = detail.data;
  const saveActual = async (content: string) => {
    setSaving(true); setError(undefined);
    try {
      const response = await api<{ archive: TranslationArchiveDetail; activeChat: { threadId: string; archiveId: string; messages: TranslationArchiveDetail["branches"][number]["messages"] } | null }>(`/archives/${summary.id}/actual-response`, { method: "PUT", body: JSON.stringify({ content }) });
      cache.setQueryData(["archive", summary.id], response.archive);
      if (response.activeChat) cache.setQueryData(["chat", response.archive.boss.id], { ...response.activeChat, nextCursor: null });
      await cache.invalidateQueries({ queryKey: ["archives"] });
      setActualOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "실제 답변을 저장하지 못했습니다."); }
    finally { setSaving(false); }
  };
  return <article className="archive-card">
    <div className="archive-card-heading-row">
      <button className="archive-card-heading" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
        <img src={`/avatars/${summary.boss.avatarKey}.png`} alt=""/>
        <span><small>{summary.boss.alias} · {new Date(summary.createdAt).toLocaleString("ko-KR")}</small><strong>{summary.inputText}</strong></span>
        {summary.actualResponse && <em>실제 답변 있음</em>}
        {expanded ? <ChevronUp size={18}/> : <ChevronDown size={18}/>}
      </button>
      <button className="archive-delete-button" type="button" aria-label="번역 아카이브 삭제" title={summary.inputText} disabled={deleting} onClick={onDelete}><Trash2 size={17}/></button>
    </div>
    {expanded && <div className="archive-card-body">
      {detail.isLoading && <p className="hint">아카이브를 불러오는 중입니다.</p>}
      {detail.isError && <p className="error-text">아카이브를 불러오지 못했습니다.</p>}
      {archive && <>
        <section><h3>쉽게 말하면</h3><p>{archive.result.plainMeaning}</p></section>
        <section><h3>가능성이 높은 의도</h3><ul>{archive.result.likelyIntent.map((intent) => <li key={intent}>{intent}</li>)}</ul></section>
        <section><h3>말투와 주의점</h3><p>{archive.result.tone}</p>{archive.result.caution && <p className="hint">{archive.result.caution}</p>}</section>
        <section><h3>추천 답변</h3>{archive.result.replies.map((reply, index) => <div className={`archive-reply${archive.lastCopiedReplyIndex === index ? " is-copied" : ""}`} key={reply.style}><span>{reply.style}</span><p>{reply.text}</p>{archive.lastCopiedReplyIndex === index && <small>마지막으로 복사한 답변</small>}</div>)}</section>
        <section className="archive-actual"><div><h3>실제 답변</h3>{archive.actualResponse ? <p>{archive.actualResponse.content}</p> : <p className="hint">아직 실제 답변이 없습니다.</p>}{archive.actualResponse?.replyText && <small>당시 보낸 답변: {archive.actualResponse.replyText}</small>}</div><button className="secondary-button" type="button" onClick={() => setActualOpen(true)}>{archive.actualResponse ? "수정" : "추가"}</button></section>
        <section><h3>저장된 대화</h3>{archive.branches.length === 0 ? <p className="hint">아직 연결된 시뮬레이션 대화가 없습니다.</p> : <div className="archive-branches">{archive.branches.map((branch) => <div className="archive-branch" key={branch.id}><div className="archive-branch-label"><MessageCircle size={14}/>{branch.kind === "PREDICTED" ? "예상 답변 기반 대화" : "실제 답변 기반 대화"}{branch.status === "ACTIVE" ? " · 현재 대화" : ""}</div>{branch.messages.map((message) => <div className={`archive-message ${message.role}`} key={message.id}>{message.kind === "ACTUAL_RESPONSE" && <small>실제 답변</small>}<p>{message.content}</p></div>)}</div>)}</div>}</section>
      </>}
    </div>}
    <ActualResponseDialog open={actualOpen} initialValue={archive?.actualResponse?.content ?? summary.actualResponse?.content} saving={saving} error={error} onClose={() => { setActualOpen(false); setError(undefined); }} onSubmit={(content) => void saveActual(content)}/>
  </article>;
}

export function ArchiveModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useSession();
  const cache = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<TranslationArchiveSummary>();
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const archives = useInfiniteQuery({
    queryKey: ["archives"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<{ items: TranslationArchiveSummary[]; nextCursor: string | null }>(`/archives${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: open && session.isSuccess,
  });
  const items = archives.data?.pages.flatMap((page) => page.items) ?? [];
  const deleteArchive = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await api<void>(`/archives/${deleteTarget.id}`, { method: "DELETE" });
      cache.removeQueries({ queryKey: ["archive", deleteTarget.id] });
      cache.setQueryData<{ pages: { items: TranslationArchiveSummary[]; nextCursor: string | null }[]; pageParams: unknown[] }>(["archives"], (current) => current ? {
        ...current,
        pages: current.pages.map((page) => ({ ...page, items: page.items.filter((item) => item.id !== deleteTarget.id) })),
      } : current);
      setDeleteTarget(undefined);
      await cache.resetQueries({ queryKey: ["archives"], exact: true });
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : "아카이브를 삭제하지 못했습니다.");
    } finally {
      setDeleting(false);
    }
  };
  if (!open) return null;
  return <div className="archive-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="archive-modal" role="dialog" aria-modal="true" aria-labelledby="archive-modal-title">
      <header className="archive-modal-header"><div><h1 id="archive-modal-title">번역 아카이브</h1><p>번역 당시 내용과 복사한 답변, 실제 답변, 이어진 대화를 이 기기에 보관합니다.</p></div><button className="icon-button" type="button" aria-label="아카이브 닫기" onClick={onClose}><X size={19}/></button></header>
      <div className="archive-modal-body">
        {session.isLoading ? <div className="loading-state"><div className="spinner"/><p>아카이브를 불러오는 중입니다.</p></div> : session.isError ? <div className="empty-state"><p className="error-text" role="alert">세션을 시작하지 못했습니다.</p></div> : archives.isLoading ? <div className="loading-state"><div className="spinner"/><p>아카이브를 불러오는 중입니다.</p></div> : archives.isError ? <p className="error-text" role="alert">아카이브를 불러오지 못했습니다.</p> : items.length === 0 ? <div className="archive-empty"><Archive size={28}/><h2>아직 저장된 번역이 없습니다.</h2><p>번역이 완료되면 자동으로 이곳에 저장됩니다.</p></div> : <div className="archive-list">{items.map((item) => <ArchiveCard key={item.id} summary={item} deleting={deleting && deleteTarget?.id === item.id} onDelete={() => { setDeleteError(undefined); setDeleteTarget(item); }}/>)}</div>}
        {archives.hasNextPage && <button className="secondary-button archive-more" type="button" disabled={archives.isFetchingNextPage} onClick={() => void archives.fetchNextPage()}>{archives.isFetchingNextPage ? "불러오는 중…" : "더 보기"}</button>}
      </div>
    </section>
    <Dialog open={Boolean(deleteTarget)} title="번역 아카이브 삭제" onClose={() => { if (!deleting) { setDeleteTarget(undefined); setDeleteError(undefined); } }}>
      <p>이 번역과 저장된 시뮬레이션 대화를 영구 삭제합니다. 현재 메인 대화와 이미 생성된 학습 근거는 유지됩니다.</p>
      <p className="hint">삭제한 아카이브는 복구할 수 없습니다.</p>
      {deleteError && <p className="error-text" role="alert">{deleteError}</p>}
      <div className="archive-delete-actions">
        <button className="secondary-button" type="button" disabled={deleting} onClick={() => { setDeleteTarget(undefined); setDeleteError(undefined); }}>취소</button>
        <button className="primary-button archive-delete-confirm" type="button" disabled={deleting} onClick={() => void deleteArchive()}>{deleting ? "삭제 중…" : "영구 삭제"}</button>
      </div>
    </Dialog>
  </div>;
}
