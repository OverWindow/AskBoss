import { useState } from "react";
import { Activity, AlertTriangle, Bot, Clock3, Database, LogOut, Play, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdminCredits, AdminDashboard, AdminJobSummary, AdminSessionSummary } from "@askboss/shared";
import { api } from "../services/api-client";

function formatNumber(value: number) {
  return new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="admin-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</article>;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(undefined);
    try { await api("/admin/login", { method: "POST", body: JSON.stringify({ password }) }); setPassword(""); onSuccess(); }
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

function AdminDashboardView({ onLogout }: { onLogout: () => void }) {
  const cache = useQueryClient();
  const dashboard = useQuery({ queryKey: ["admin", "dashboard"], queryFn: () => api<AdminDashboard>("/admin/dashboard"), refetchInterval: 30_000 });
  const credits = useQuery({ queryKey: ["admin", "credits"], queryFn: () => api<AdminCredits>("/admin/credits"), refetchInterval: 60_000 });
  const sessions = useQuery({ queryKey: ["admin", "sessions"], queryFn: () => api<{ items: AdminSessionSummary[] }>("/admin/sessions") });
  const jobs = useQuery({ queryKey: ["admin", "jobs"], queryFn: () => api<{ items: AdminJobSummary[] }>("/admin/jobs") });
  const [running, setRunning] = useState<string>();
  const [message, setMessage] = useState<string>();

  const refresh = async () => { await cache.invalidateQueries({ queryKey: ["admin"] }); };
  const operation = async (key: string, path: string) => {
    setRunning(key); setMessage(undefined);
    try { await api(path, { method: "POST" }); setMessage("작업을 시작했습니다."); await refresh(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "작업을 실행하지 못했습니다."); }
    finally { setRunning(undefined); }
  };
  const logout = async () => { await api("/admin/logout", { method: "POST" }); cache.removeQueries({ queryKey: ["admin"] }); onLogout(); };
  const data = dashboard.data;

  if (dashboard.isLoading) return <div className="loading-state"><div><div className="spinner"/><p>운영 현황을 불러오는 중입니다.</p></div></div>;
  if (!data || dashboard.isError) return <div className="empty-state"><div><h1>운영 현황을 불러오지 못했습니다.</h1><button className="secondary-button" onClick={() => void refresh()}>다시 시도</button></div></div>;

  const totalCredits = credits.data?.total;
  const lowCredits = totalCredits && totalCredits.quota > 0 && totalCredits.remaining / totalCredits.quota < .2;
  return <main className="admin-page">
    <header className="admin-topbar"><div><p className="panel-kicker">ASKBOSS OPERATIONS</p><h1>운영 관리자</h1><p>마지막 집계 {formatDate(data.generatedAt)}</p></div><div className="admin-top-actions"><button className="secondary-button" onClick={() => void refresh()}><RefreshCw size={16}/>새로고침</button><button className="text-button" onClick={() => void logout()}><LogOut size={16}/>로그아웃</button></div></header>
    {message && <div className="admin-notice" role="status">{message}</div>}
    {(data.jobs.failed > 0 || lowCredits) && <section className="admin-alert"><AlertTriangle size={19}/><div><strong>확인이 필요한 항목이 있습니다.</strong><p>{data.jobs.failed > 0 ? `실패한 AI Job ${data.jobs.failed}개` : ""}{data.jobs.failed > 0 && lowCredits ? " · " : ""}{lowCredits ? "AI 크레딧 20% 미만" : ""}</p></div></section>}

    <section className="admin-section"><div className="admin-section-title"><UsersRound size={19}/><div><h2>세션 현황</h2><p>사용자를 식별할 수 없는 운영 집계입니다.</p></div></div><div className="admin-metric-grid"><Metric label="만료 전 세션" value={data.sessions.total}/><Metric label="최근 15분 활성" value={data.sessions.active15m}/><Metric label="24시간 신규" value={data.sessions.new24h}/><Metric label="1시간 내 만료" value={data.sessions.expiring1h}/></div></section>
    <section className="admin-section"><div className="admin-section-title"><Activity size={19}/><div><h2>24시간 사용량</h2><p>원문 없이 기능 호출만 집계합니다.</p></div></div><div className="admin-metric-grid"><Metric label="개인 상사" value={data.usage.personalBosses}/><Metric label="대화 메시지" value={data.usage.chatMessages24h}/><Metric label="번역" value={data.usage.translations24h}/><Metric label="만료 미완료 업로드" value={data.uploads.expiredIncomplete}/></div></section>

    <section className="admin-section"><div className="admin-section-title"><Bot size={19}/><div><h2>AI 상태와 크레딧</h2><p>{credits.data ? `${credits.data.latencyMs}ms · ${credits.data.models.mode === "live" ? "실 API" : "데모"}` : "조회 중"}</p></div></div>{credits.data?.available ? <div className="credit-grid"><CreditCard title="월별 크레딧" bucket={credits.data.monthly}/><CreditCard title="충전 크레딧" bucket={credits.data.purchased}/><CreditCard title="전체 크레딧" bucket={credits.data.total}/></div> : <div className="admin-inline-error"><AlertTriangle size={18}/>{credits.data?.error ?? "크레딧을 조회하는 중입니다."}</div>}<div className="model-status"><span className={credits.data?.models.ok ? "status-ok" : "status-error"}/><strong>{credits.data?.models.ok ? "필수 모델 정상" : "필수 모델 확인 필요"}</strong>{credits.data?.models.missing.length ? <small>누락: {credits.data.models.missing.join(", ")}</small> : null}</div></section>

    <section className="admin-section"><div className="admin-section-title"><Clock3 size={19}/><div><h2>AI Job</h2><p>오래 대기하거나 실패한 작업을 확인합니다.</p></div></div><div className="admin-metric-grid"><Metric label="대기" value={data.jobs.pending}/><Metric label="실행 중" value={data.jobs.running}/><Metric label="실패" value={data.jobs.failed}/><Metric label="최장 대기" value={data.jobs.oldestPendingMinutes === null ? "없음" : `${data.jobs.oldestPendingMinutes}분`}/></div>{data.jobs.failureReasons.length > 0 && <div className="failure-summary" aria-label="Job 실패 원인 요약">{data.jobs.failureReasons.map((item) => <span key={item.reason}>{item.reason} <strong>{item.count}</strong></span>)}</div>}<div className="admin-table-wrap"><table><thead><tr><th>종류</th><th>상태</th><th>시도</th><th>시각</th><th>조치</th></tr></thead><tbody>{jobs.data?.items.map((job) => <tr key={job.id}><td>{job.type}</td><td><span className={`job-status status-${job.status.toLowerCase()}`}>{job.status}</span>{job.errorMessage && <small className="job-error">{job.errorMessage}</small>}</td><td>{job.attempts}/{job.maxAttempts}</td><td>{formatDate(job.updatedAt)}</td><td>{job.status === "FAILED" ? <button className="small-button" disabled={running === job.id} onClick={() => void operation(job.id, `/admin/jobs/${job.id}/retry`)}><Play size={14}/>재시도</button> : "—"}</td></tr>)}</tbody></table></div></section>

    <section className="admin-grid-two"><div className="admin-section"><div className="admin-section-title"><Database size={19}/><div><h2>최근 세션</h2><p>식별자는 마스킹됩니다.</p></div></div><div className="admin-table-wrap"><table><thead><tr><th>세션</th><th>마지막 활동</th><th>상사</th><th>대화</th></tr></thead><tbody>{sessions.data?.items.map((session) => <tr key={session.id}><td><code>{session.id}</code></td><td>{formatDate(session.lastSeenAt)}</td><td>{session.bossCount}</td><td>{session.chatMessageCount}</td></tr>)}</tbody></table></div></div>
    <div className="admin-section"><div className="admin-section-title"><ShieldCheck size={19}/><div><h2>유지관리</h2><p>활성 세션은 변경하지 않습니다.</p></div></div><div className="maintenance-actions"><button className="secondary-button" disabled={Boolean(running)} onClick={() => void operation("cleanup", "/admin/maintenance/cleanup")}>만료 데이터 정리</button><button className="secondary-button" disabled={Boolean(running)} onClick={() => void operation("rollup", "/admin/maintenance/rollup")}>Analytics 집계</button></div><h3>최근 실행</h3><ul className="operation-list">{data.recentOperations.map((item) => <li key={item.id}><span>{item.type}</span><strong className={item.status === "SUCCEEDED" ? "success-text" : "error-text"}>{item.status}</strong><time>{formatDate(item.createdAt)}</time></li>)}{data.recentOperations.length === 0 && <li>실행 기록이 없습니다.</li>}</ul></div></section>
  </main>;
}

export function AdminPage() {
  const cache = useQueryClient();
  const auth = useQuery({ queryKey: ["admin", "auth"], queryFn: () => api<{ authenticated: boolean; expiresAt: string | null }>("/admin/auth"), retry: false });
  if (auth.isLoading) return <div className="loading-state"><div className="spinner"/></div>;
  if (!auth.data?.authenticated) return <AdminLogin onSuccess={() => void cache.invalidateQueries({ queryKey: ["admin", "auth"] })}/>;
  return <AdminDashboardView onLogout={() => void cache.invalidateQueries({ queryKey: ["admin", "auth"] })}/>;
}
