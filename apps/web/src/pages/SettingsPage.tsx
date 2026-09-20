import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { motion } from "framer-motion";
import {
  AGE_BANDS,
  AVATARS,
  BOSS_RANKS,
  BOSS_TENURE_BANDS,
  ENTRY_PATHS,
  JOB_FUNCTIONS,
  profileSchema,
  USER_RANKS,
  USER_TENURE_BANDS,
  WEAKNESSES,
  type Boss,
  type UserProfile,
} from "@askboss/shared";
import { AppShell } from "../components/AppShell";
import { BossEvidenceManager } from "../features/boss/BossEvidenceManager";
import { useBosses } from "../features/boss/useBosses";
import { waGwa } from "../lib/korean";
import { api, ApiError } from "../services/api-client";

const Options = ({ values }: { values: readonly (string | number)[] }) => <>{values.map((value) => <option key={value} value={value}>{typeof value === "number" ? `${value}대${value === 60 ? "+" : ""}` : value}</option>)}</>;
const PERSONA_REQUEST_TIMEOUT_MS = 60_000;
const weaknessOptions = new Set<string>(WEAKNESSES);
const normalizeProfileWeaknesses = (profile: UserProfile): UserProfile => ({ ...profile, weaknesses: profile.weaknesses.filter((item) => weaknessOptions.has(item)) });

export function SettingsPage() {
  const cache = useQueryClient();
  const navigate = useNavigate();
  const profileQuery = useQuery({ queryKey: ["profile"], queryFn: () => api<{ profile: UserProfile | null }>("/profile").then((result) => result.profile) });
  const { data: bosses = [] } = useBosses();
  const personal = bosses.filter((item) => item.scope === "SESSION");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bossId, setBossId] = useState("");
  const selected = personal.find((item) => item.id === bossId) ?? personal[0];
  const [boss, setBoss] = useState<Boss | null>(null);
  const [message, setMessage] = useState("");
  const [evidenceProcessing, setEvidenceProcessing] = useState(false);

  useEffect(() => setProfile(profileQuery.data ? normalizeProfileWeaknesses(profileQuery.data) : null), [profileQuery.data]);
  useEffect(() => {
    if (selected) {
      setBoss(selected);
      setBossId(selected.id);
    }
  }, [selected?.id]);

  const saveProfile = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse(profile);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "내 정보를 확인해 주세요.");
      return api<{ profile: UserProfile }>("/profile", { method: "PUT", body: JSON.stringify(parsed.data) });
    },
    onMutate: () => setMessage(""),
    onSuccess: ({ profile: saved }) => {
      setProfile(saved);
      cache.setQueryData(["profile"], saved);
      setMessage("내 정보를 저장했습니다.");
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "내 정보를 저장하지 못했습니다."),
  });

  const wait = async (id: string) => {
    const deadline = Date.now() + 8 * 60_000;
    while (Date.now() < deadline) {
      try {
        const { job } = await api<{ job: { status: string; errorMessage?: string; attempts?: number } }>(`/jobs/${id}`);
        if (job.status === "SUCCEEDED") return;
        if (job.status === "FAILED") throw new Error(job.errorMessage ?? "페르소나 재분석에 실패했습니다.");
        setMessage((job.attempts ?? 0) > 1 ? "페르소나를 자동 재시도하고 있습니다…" : "페르소나를 재분석하고 있습니다…");
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "REQUEST_TIMEOUT") throw error;
        setMessage("서버 응답이 지연되어 페르소나 작업 상태를 다시 확인하고 있습니다…");
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error("페르소나 재분석이 계속 진행 중입니다. 잠시 후 다시 시도해 주세요.");
  };

  const saveBoss = useMutation({
    mutationFn: async () => {
      if (!boss) return;
      await api(`/bosses/${boss.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          alias: boss.alias,
          avatarKey: boss.avatarKey,
          jobFunction: boss.jobFunction,
          yearsOfServiceBand: boss.yearsOfServiceBand,
          rank: boss.rank,
          companyName: boss.companyName,
          ageBand: boss.ageBand,
          hierarchyScore: boss.hierarchyScore,
          companyResearch: boss.companyResearch,
        }),
        timeoutMs: PERSONA_REQUEST_TIMEOUT_MS,
      });
      const { jobId } = await api<{ jobId: string }>(`/bosses/${boss.id}/persona/rebuild`, { method: "POST", timeoutMs: PERSONA_REQUEST_TIMEOUT_MS });
      await wait(jobId);
    },
    onSuccess: async () => {
      setMessage("상사 정보와 대화 자료를 반영해 페르소나를 다시 만들었습니다.");
      await cache.invalidateQueries({ queryKey: ["bosses"] });
    },
    onError: (error) => setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."),
  });

  const removeBoss = async () => {
    if (!boss || !confirm(`${boss.alias}${waGwa(boss.alias)} 관련된 세션 데이터를 삭제할까요?`)) return;
    await api(`/bosses/${boss.id}`, { method: "DELETE" });
    await cache.invalidateQueries({ queryKey: ["bosses"] });
    setBoss(null);
    setBossId("");
  };

  return <AppShell><div className="settings-panel">
    <header><div className="settings-header-row"><button className="settings-back-button" type="button" onClick={() => navigate("/")} aria-label="메인으로 돌아가기"><ChevronLeft size={19}/></button><h1>내 정보 · 상사 관리</h1></div></header>
    {message && <p className="settings-message" role="status">{message}</p>}
    <section className="settings-section">
      <h2>내 정보</h2>
      {profile ? <div className="settings-form">
        <label>사용자 ID<input className="input" value={profile.handle} onChange={(event) => setProfile({ ...profile, handle: event.target.value })}/></label>
        <label>나이대<select className="select" value={profile.ageBand} onChange={(event) => setProfile({ ...profile, ageBand: Number(event.target.value) })}><Options values={AGE_BANDS}/></select></label>
        <label>연차<select className="select" value={profile.yearsOfServiceBand} onChange={(event) => setProfile({ ...profile, yearsOfServiceBand: event.target.value })}><Options values={USER_TENURE_BANDS}/></select></label>
        <label>직무<select className="select" value={profile.jobFunction} onChange={(event) => setProfile({ ...profile, jobFunction: event.target.value })}><Options values={JOB_FUNCTIONS}/></select></label>
        <label>직급<select className="select" value={profile.rank} onChange={(event) => setProfile({ ...profile, rank: event.target.value })}><Options values={USER_RANKS}/></select></label>
        <label>입사 경로<select className="select" value={profile.entryPath} onChange={(event) => setProfile({ ...profile, entryPath: event.target.value })}><Options values={ENTRY_PATHS}/></select></label>
        <fieldset><legend>업무 대화의 어려움</legend>{WEAKNESSES.map((item) => <label className="check-label" key={item}><input type="checkbox" checked={profile.weaknesses.includes(item)} onChange={() => setProfile({ ...profile, weaknesses: profile.weaknesses.includes(item) ? profile.weaknesses.filter((value) => value !== item) : [...profile.weaknesses, item] })}/>{item}</label>)}</fieldset>
        <button className="primary-button" disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>내 정보 저장</button>
      </div> : <p>아직 내 정보가 없습니다.</p>}
    </section>
    <section className="settings-section">
      <h2>상사 정보</h2>
      {personal.length > 0 && <select className="select" value={bossId} onChange={(event) => setBossId(event.target.value)}>{personal.map((item) => <option key={item.id} value={item.id}>{item.alias}</option>)}</select>}
      {boss ? <div className="settings-form">
        <div className="avatar-options compact">{AVATARS.map((key) => { const active = boss.avatarKey === key; return <button key={key} type="button" className={`avatar-option ${active ? "is-selected" : ""}`} onClick={() => setBoss({ ...boss, avatarKey: key })}>{active && <motion.span className="avatar-selection" layoutId="settings-selected-boss-avatar" transition={{ type: "spring", stiffness: 420, damping: 34 }}/>}<img src={`/avatars/${key}.png`} alt={key}/></button>; })}</div>
        <label>별칭<input className="input" value={boss.alias} onChange={(event) => setBoss({ ...boss, alias: event.target.value })}/></label>
        <label>직무<select className="select" value={boss.jobFunction ?? ""} onChange={(event) => setBoss({ ...boss, jobFunction: event.target.value })}><Options values={JOB_FUNCTIONS}/></select></label>
        <label>연차<select className="select" value={boss.yearsOfServiceBand ?? ""} onChange={(event) => setBoss({ ...boss, yearsOfServiceBand: event.target.value })}><Options values={BOSS_TENURE_BANDS}/></select></label>
        <label>직급<select className="select" value={boss.rank ?? ""} onChange={(event) => setBoss({ ...boss, rank: event.target.value })}><Options values={BOSS_RANKS}/></select></label>
        <label>회사<input className="input" value={boss.companyName ?? ""} onChange={(event) => setBoss({ ...boss, companyName: event.target.value })}/></label>
        <label>나이대<select className="select" value={boss.ageBand ?? 40} onChange={(event) => setBoss({ ...boss, ageBand: Number(event.target.value) })}><Options values={AGE_BANDS}/></select></label>
        <label>위계도 <b>{boss.hierarchyScore}</b><input className="range" type="range" min="0" max="100" value={boss.hierarchyScore ?? 50} onChange={(event) => setBoss({ ...boss, hierarchyScore: Number(event.target.value) })}/></label>
        <BossEvidenceManager
          key={boss.id}
          bossId={boss.id}
          onProcessingChange={setEvidenceProcessing}
          onPersonaJob={wait}
          onPersonaUpdated={async () => { await cache.invalidateQueries({ queryKey: ["bosses"] }); }}
        />
        {evidenceProcessing && <p className="hint settings-evidence-processing">자료 분석이 끝나면 정보와 함께 페르소나를 재분석할 수 있습니다.</p>}
        <div className="settings-actions">
          <button className="primary-button" disabled={saveBoss.isPending || evidenceProcessing} onClick={() => saveBoss.mutate()}>{evidenceProcessing ? "자료 분석 중…" : saveBoss.isPending ? "재분석 중…" : "저장 후 페르소나 재분석"}</button>
          <button className="text-button danger-button" onClick={() => void removeBoss()}>상사 삭제</button>
        </div>
      </div> : <p>등록한 개인 상사가 없습니다.</p>}
    </section>
  </div></AppShell>;
}
