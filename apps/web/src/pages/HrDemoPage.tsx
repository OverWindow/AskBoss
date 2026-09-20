import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { HrDashboard } from "../features/hr/HrDashboard";
import { SERVICE_NAME } from "../config/brand";

const SECTIONS = [
  { id: "overview", label: "요약" },
  { id: "topics", label: "주요 주제" },
  { id: "topic-features", label: "주제·기능" },
  { id: "job-function-pairs", label: "직무 조합" },
  { id: "demographics", label: "직급·나이" },
  { id: "insights", label: "조직 인사이트" },
  { id: "repeated", label: "시뮬레이션 유형" },
];

export function HrDemoPage() {
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0]!.id);
  const [dataset, setDataset] = useState<"actual" | "mock">("actual");

  useEffect(() => {
    const onScroll = () => {
      const position = window.scrollY + window.innerHeight * 0.3;
      let current = SECTIONS[0]!.id;
      for (const section of SECTIONS) {
        const el = document.getElementById(section.id);
        if (el && el.offsetTop <= position) current = section.id;
      }
      // The last section (시뮬레이션 유형) is short and content follows it, so
      // its offsetTop can stay below the 30% line even at the page bottom —
      // pin the last section once the document is scrolled to the end.
      const atPageBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 1;
      if (atPageBottom) current = SECTIONS[SECTIONS.length - 1]!.id;
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => (event: React.MouseEvent) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return <motion.div className="hr-layout" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: .3, ease: "easeOut" }}>
    <aside className="hr-nav">
      <img className="hr-brand-logo" src="/image.svg?v=2" alt={SERVICE_NAME} />
      {SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`} className={activeSection === section.id ? "is-active" : ""} onClick={scrollTo(section.id)}>{section.label}</a>)}
    </aside>
    <div className="hr-content">
      <header id="overview" className="hr-page-header"><div className="settings-header-row"><Link className="settings-back-button" to="/" aria-label="사용자 화면으로 돌아가기"><ChevronLeft size={19}/></Link><h1>조직 커뮤니케이션 인사이트</h1></div></header>
      <div className="hr-dataset-tabs" role="tablist" aria-label="HR 데이터 선택">
        <button type="button" role="tab" aria-selected={dataset === "actual"} className={dataset === "actual" ? "is-active" : ""} onClick={() => setDataset("actual")}>실제 익명 집계</button>
        <button type="button" role="tab" aria-selected={dataset === "mock"} className={dataset === "mock" ? "is-active" : ""} onClick={() => setDataset("mock")}>가상 데모</button>
        <span className={`hr-dataset-tab-indicator${dataset === "mock" ? " is-mock" : ""}`} aria-hidden="true"/>
      </div>
      <HrDashboard dataset={dataset}/>
    </div>
  </motion.div>;
}
