import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wordcloud } from "@visx/wordcloud";
import { Text } from "@visx/text";
import { JOB_FUNCTIONS, type HrDashboard } from "@askboss/shared";
import { api } from "../../services/api-client";

const featureLabel=(feature:string)=>({TRANSLATE:"번역",CHAT:"대화",SIMULATE:"시뮬레이션",MONOLOGUE:"혼잣말",PERSONA_REBUILD:"페르소나 재생성"}[feature]??feature);
const MOCK_COLORS = ["#375DF3", "#7B61FF", "#EC6F91", "#F6A94A", "#28A78C", "#49A4E8"];

export function HrDashboard({ dataset }: { dataset: "actual" | "mock" }) {
  const query = useQuery({
    queryKey: ["hr-dashboard", dataset],
    queryFn: () => api<HrDashboard>(`/hr/dashboard?dataset=${dataset}`),
  });

  if (query.isLoading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
      </div>
    );
  }

  if (!query.data) {
    return <div className="empty-state">집계 데이터를 불러오지 못했습니다.</div>;
  }

  const d = query.data;
  const isMock = d.dataSource === "MOCK";

  return (
    <main className={`hr-main${isMock ? " is-mock" : ""}`}>
      {d.overview.summary && <p className="hr-summary">{d.overview.summary}</p>}

      <div className="metric-line overview-metrics">
        <div>
          <strong>{d.overview.totalUses.toLocaleString()}</strong>
          <span>AI 기능 사용</span>
        </div>
        <div>
          <strong>{d.overview.activeSubjects}</strong>
          <span>익명 사용자</span>
        </div>
        <div>
          <strong>{featureLabel(d.overview.topFeature)}</strong>
          <span>가장 많이 쓴 기능</span>
        </div>
      </div>

      <section id="topics" className="chart-section">
        <h3>자주 등장한 주제</h3>
        {d.topics.length > 0 ? <TopicCloud words={d.topics} colorful/> : <EmptyPlaceholder>아직 집계된 대화 주제가 없습니다.</EmptyPlaceholder>}
      </section>

      <section id="topic-features" className="chart-section">
        <h3>주제별 기능 사용</h3>
        <p className="hint">각 주제가 번역, 대화, 시뮬레이션 등 어떤 기능에서 등장했는지 보여줍니다.</p>
        {(d.topicFeature ?? []).length > 0 ? (
          <TopicFeatureHeatmap data={d.topicFeature}/>
        ) : (
          <EmptyPlaceholder>아직 주제와 기능을 함께 비교할 데이터가 없습니다.</EmptyPlaceholder>
        )}
      </section>

      <section id="job-function-pairs" className="chart-section">
        <h3>사용자 직무 × 상사 직무</h3>
        <p className="hint">행은 사용자 직무, 열은 상사 직무입니다. 색이 진할수록 해당 조합에서 AI 기능을 사용한 횟수가 많습니다.</p>
        {(d.jobFunctionPairs ?? []).length > 0 ? (
          <JobFunctionHeatmap data={d.jobFunctionPairs}/>
        ) : (
          <EmptyPlaceholder>아직 사용자·상사 직무를 함께 비교할 데이터가 없습니다.</EmptyPlaceholder>
        )}
      </section>

      <div id="demographics" className="chart-grid">
        <Chart title="직급 차이별 사용량" data={d.rankGap} colorful/>
        <Chart title="나이 차이별 사용량" data={d.ageGap} colorful/>
      </div>

      <div id="insights" className="chart-grid">
        <section className="chart-section">
          <h3>상사 소속 부서별 사용량</h3>
          {d.sameJobFunctionDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={d.sameJobFunctionDistribution.map((item) => ({
                  label: item.bucket === "SAME" ? "같은 부서 상사" : "타 부서 상사",
                  value: item.count,
                }))}
              >
                <CartesianGrid stroke="rgba(33,34,50,.1)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#375DF3" radius={[4, 4, 0, 0]}>{d.sameJobFunctionDistribution.map((item, index) => <Cell key={item.bucket} fill={MOCK_COLORS[(index + 3) % MOCK_COLORS.length]}/>)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyPlaceholder>아직 부서 비교 데이터가 충분하지 않습니다.</EmptyPlaceholder>
          )}
        </section>

        <section className="chart-section gap-rate-section">
          <h3>표면·실제 메시지 괴리율</h3>
          <div className="metric-line" style={{ marginBottom: 16 }}>
            <div>
              <strong>{d.surfaceActualGapRate===null?"집계 대기":`${d.surfaceActualGapRate}%`}</strong>
              <span>전체 괴리율</span>
            </div>
          </div>
          <p className="hint">상사 발언의 표면적 표현과 해석된 실제 메시지의 차이를 집계합니다.</p>
        </section>
      </div>

      <section id="repeated" className="chart-section">
        <h3>반복 시뮬레이션 유형</h3>
        <p className="hint">같은 발언이 두 번 이상 시뮬레이션된 횟수를 원문 노출 없이 유형별로 집계합니다.</p>
        {d.repeatedSimulationTypes.length > 0 ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>발언 유형</th>
                  <th>반복 횟수</th>
                </tr>
              </thead>
              <tbody>
                {d.repeatedSimulationTypes.map((item) => (
                  <tr key={item.type}>
                    <td>{item.type}</td>
                    <td>{item.count}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPlaceholder>아직 반복 시뮬레이션 유형을 집계할 데이터가 없습니다.</EmptyPlaceholder>
        )}
      </section>
    </main>
  );
}

function EmptyPlaceholder({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: 180,
        display: "grid",
        placeItems: "center",
        color: "var(--hr-muted)",
        fontSize: "0.92rem",
        textAlign: "center",
        padding: "24px",
      }}
    >
      {children}
    </div>
  );
}

function TopicCloud({ words, colorful }: { words: { text: string; value: number }[]; colorful: boolean }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const maxValue = Math.max(...words.map((word) => word.value), 1);
  return (
    <div className="word-cloud">
      <svg viewBox="0 0 720 240" role="img" aria-label="주요 대화 주제 워드 클라우드">
        <Wordcloud
          words={words}
          width={720}
          height={240}
          font="Pretendard, sans-serif"
          fontSize={(word) => 18 + (word.value / maxValue) * 30}
          padding={5}
          spiral="archimedean"
          rotate={() => 0}
          random={() => 0.5}
        >
          {(cloudWords) => {
            const ordered = hovered ? [...cloudWords.filter((word) => word.text !== hovered), ...cloudWords.filter((word) => word.text === hovered)] : cloudWords;
            return (
            <>
              {ordered.map((word, index) => {
                const count = (word as unknown as { value: number }).value;
                const size = word.size ?? 20;
                return (
              <g key={word.text} className="word-cloud-word-group" transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`} onMouseEnter={() => setHovered(word.text ?? null)} onMouseLeave={() => setHovered((current) => (current === word.text ? null : current))}>
                <Text
                  className="word-cloud-word"
                  fill={colorful ? MOCK_COLORS[cloudWords.indexOf(word) % MOCK_COLORS.length] : "#375DF3"}
                  textAnchor="middle"
                  fontSize={size}
                  fontFamily={word.font}
                >
                  {word.text}
                </Text>
                <g className="word-cloud-tooltip" transform={`translate(0, ${-size / 2 - 16})`} aria-hidden="true">                  <rect x={-(String(count).length * 8 + 24) / 2} y={-11} width={String(count).length * 8 + 24} height={22} rx={7} fill="#212232"/>
                  <text textAnchor="middle" dominantBaseline="central" fill="#fff" fontSize={12} fontFamily="Pretendard, sans-serif">{count}회</text>
                </g>
              </g>
                );
              })}
            </>
          );}}
        </Wordcloud>
      </svg>
    </div>
  );
}

function TopicFeatureHeatmap({ data }: { data: HrDashboard["topicFeature"] }) {
  const preferredFeatures = ["TRANSLATE", "CHAT", "SIMULATE", "MONOLOGUE", "PERSONA_REBUILD"];
  const presentFeatures = new Set(data.map((item) => item.feature));
  const features = [
    ...preferredFeatures.filter((feature) => presentFeatures.has(feature)),
    ...[...presentFeatures].filter((feature) => !preferredFeatures.includes(feature)).sort((a, b) => a.localeCompare(b, "ko")),
  ];
  const topicTotals = data.reduce((totals, item) => totals.set(item.topic, (totals.get(item.topic) ?? 0) + item.value), new Map<string, number>());
  const topics = [...topicTotals].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([topic]) => topic);
  const values = new Map(data.map((item) => [`${item.topic}\u0000${item.feature}`, item.value]));
  const maxValue = Math.max(...data.map((item) => item.value), 1);

  return (
    <>
      <div className="topic-feature-heatmap-scroll">
        <table className="topic-feature-heatmap" aria-label="주제별 기능 사용량 히트맵">
          <thead>
            <tr>
              <th scope="col">주제</th>
              {features.map((feature) => <th key={feature} scope="col">{featureLabel(feature)}</th>)}
            </tr>
          </thead>
          <tbody>
            {topics.map((topic) => (
              <tr key={topic}>
                <th scope="row">{topic}</th>
                {features.map((feature) => {
                  const value = values.get(`${topic}\u0000${feature}`) ?? 0;
                  const ratio = value / maxValue;
                  const alpha = value === 0 ? 0.035 : 0.1 + ratio * 0.8;
                  return (
                    <td key={feature} aria-label={`${topic} · ${featureLabel(feature)}: ${value}건`}>
                      <span
                        className={`topic-feature-cell${ratio >= 0.58 ? " is-strong" : ""}`}
                        style={{ backgroundColor: `rgba(55, 93, 243, ${alpha})` }}
                      >
                        {value > 0 ? value.toLocaleString() : "–"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="topic-feature-legend" aria-label="색 농도 범례">
        <span>낮음</span><i aria-hidden="true"/><span>높음</span>
      </div>
    </>
  );
}

function JobFunctionHeatmap({ data }: { data: HrDashboard["jobFunctionPairs"] }) {
  const preferredOrder = new Map<string, number>(JOB_FUNCTIONS.map((jobFunction, index) => [jobFunction, index]));
  const compareJobFunctions = (left: string, right: string) => (preferredOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (preferredOrder.get(right) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right, "ko");
  const userJobFunctions = [...new Set(data.map((item) => item.userJobFunction))].sort(compareJobFunctions);
  const bossJobFunctions = [...new Set(data.map((item) => item.bossJobFunction))].sort(compareJobFunctions);
  const values = new Map(data.map((item) => [`${item.userJobFunction}\u0000${item.bossJobFunction}`, item.count]));
  const maxValue = Math.max(...data.map((item) => item.count), 1);

  return (
    <>
      <div className="job-function-heatmap-scroll">
        <table className="job-function-heatmap" aria-label="사용자 직무와 상사 직무별 AI 기능 사용량 히트맵" style={{ minWidth: Math.max(560, bossJobFunctions.length * 92 + 132) }}>
          <thead>
            <tr>
              <th scope="col">사용자 ↓ / 상사 →</th>
              {bossJobFunctions.map((jobFunction) => <th key={jobFunction} scope="col">{jobFunction}</th>)}
            </tr>
          </thead>
          <tbody>
            {userJobFunctions.map((userJobFunction) => (
              <tr key={userJobFunction}>
                <th scope="row">{userJobFunction}</th>
                {bossJobFunctions.map((bossJobFunction) => {
                  const value = values.get(`${userJobFunction}\u0000${bossJobFunction}`) ?? 0;
                  const ratio = value / maxValue;
                  const alpha = value === 0 ? 0.035 : 0.1 + ratio * 0.8;
                  return (
                    <td key={bossJobFunction} aria-label={`${userJobFunction} 사용자 · ${bossJobFunction} 상사: ${value}건`}>
                      <span
                        className={`job-function-heatmap-cell${ratio >= 0.58 ? " is-strong" : ""}`}
                        style={{ backgroundColor: `rgba(55, 93, 243, ${alpha})` }}
                      >
                        {value > 0 ? value.toLocaleString() : "–"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="topic-feature-legend" aria-label="색 농도 범례">
        <span>낮음</span><i aria-hidden="true"/><span>높음</span>
      </div>
    </>
  );
}

function Chart({ title, data, colorful }: { title: string; data: { label: string; value: number }[]; colorful: boolean }) {
  return (
    <section className="chart-section">
      <h3>{title}</h3>
      {data.length > 0 ? <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(33,34,50,.1)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#375DF3" radius={[4, 4, 0, 0]}>{data.map((item, index) => <Cell key={item.label} fill={colorful ? MOCK_COLORS[index % MOCK_COLORS.length] : "#375DF3"}/>)}</Bar>
        </BarChart>
      </ResponsiveContainer> : <EmptyPlaceholder>아직 집계된 데이터가 없습니다.</EmptyPlaceholder>}
    </section>
  );
}
