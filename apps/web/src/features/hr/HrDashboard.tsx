import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Wordcloud } from "@visx/wordcloud";
import { Text } from "@visx/text";
import type { HrDashboard } from "@askboss/shared";
import { api } from "../../services/api-client";

const featureLabel=(feature:string)=>({TRANSLATE:"번역",CHAT:"대화",SIMULATE:"시뮬레이션",MONOLOGUE:"혼잣말",PERSONA_REBUILD:"페르소나 재생성"}[feature]??feature);

export function HrDashboard() {
  const query = useQuery({
    queryKey: ["hr-dashboard"],
    queryFn: () => api<HrDashboard>("/hr/dashboard"),
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

  return (
    <main className="hr-main">
      <header id="overview" className="hr-title-row">
        <div>
          <h2>조직 커뮤니케이션 인사이트</h2>
        </div>
        {d.includesDemo && <span className="demo-badge">데모 데이터 포함</span>}
      </header>

      <p className="hr-summary">{d.overview.summary}</p>

      <div className="metric-line">
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
        <TopicCloud words={d.topics} />
      </section>

      <div id="demographics" className="chart-grid">
        <Chart title="직급 차이별 사용량" data={d.rankGap} />
        <Chart title="나이 차이별 사용량" data={d.ageGap} />
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
                <Bar dataKey="value" fill="#375DF3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyPlaceholder>아직 부서 비교 데이터가 충분하지 않습니다.</EmptyPlaceholder>
          )}
        </section>

        <section className="chart-section">
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
        <h3>반복 시뮬레이션된 상사 발언</h3>
        <p className="hint">사용자가 같은 발언의 대응 방식을 반복해서 확인한 횟수입니다. 주의가 필요하거나 문제가 반복되는 언행을 파악하는 데 활용할 수 있습니다.</p>
        {d.topRepeatedPhrases.length > 0 ? (
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>발언</th>
                  <th>시뮬레이션 횟수</th>
                </tr>
              </thead>
              <tbody>
                {d.topRepeatedPhrases.map((item) => (
                  <tr key={item.phrase}>
                    <td>{item.phrase}</td>
                    <td>{item.count}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyPlaceholder>아직 반복적으로 시뮬레이션된 상사 발언이 없습니다.</EmptyPlaceholder>
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

function TopicCloud({ words }: { words: { text: string; value: number }[] }) {
  return (
    <div className="word-cloud">
      <svg viewBox="0 0 720 240" role="img" aria-label="주요 대화 주제 워드 클라우드">
        <Wordcloud
          words={words}
          width={720}
          height={240}
          font="Pretendard, sans-serif"
          fontSize={(word) => Math.max(16, Math.min(46, word.value / 2))}
          padding={5}
          spiral="archimedean"
          rotate={() => 0}
          random={() => 0.5}
        >
          {(cloudWords) =>
            cloudWords.map((word) => (
              <Text
                key={word.text}
                fill="#375DF3"
                textAnchor="middle"
                transform={`translate(${word.x}, ${word.y}) rotate(${word.rotate})`}
                fontSize={word.size}
                fontFamily={word.font}
              >
                {word.text}
              </Text>
            ))
          }
        </Wordcloud>
      </svg>
    </div>
  );
}

function Chart({ title, data }: { title: string; data: { label: string; value: number }[] }) {
  return (
    <section className="chart-section">
      <h3>{title}</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data}>
          <CartesianGrid stroke="rgba(33,34,50,.1)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="value" fill="#375DF3" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}
