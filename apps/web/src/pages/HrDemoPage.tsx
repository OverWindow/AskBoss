import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { HrDashboard } from "../features/hr/HrDashboard";
import { SERVICE_NAME } from "../config/brand";

const SECTIONS = [
  { id: "overview", label: "요약" },
  { id: "topics", label: "주요 주제" },
  { id: "demographics", label: "직급·나이" },
  { id: "insights", label: "조직 인사이트" },
  { id: "repeated", label: "반복 시뮬레이션" },
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
      <img className="hr-brand-logo" src="/image.png" alt={SERVICE_NAME} />
      <Link to="/"><ChevronLeft size={15} style={{ verticalAlign: "middle" }} /> 사용자 화면</Link>
      {SECTIONS.map((section) => <a key={section.id} href={`#${section.id}`} className={activeSection === section.id ? "is-active" : ""} onClick={scrollTo(section.id)}>{section.label}</a>)}
    </aside>
    <div className="hr-content">
      <div className="hr-dataset-tabs" role="tablist" aria-label="HR 데이터 선택">
        <button type="button" role="tab" aria-selected={dataset === "actual"} className={dataset === "actual" ? "is-active" : ""} onClick={() => setDataset("actual")}>실제 익명 집계</button>
        <button type="button" role="tab" aria-selected={dataset === "mock"} className={dataset === "mock" ? "is-active" : ""} onClick={() => setDataset("mock")}>Mock 데모</button>
      </div>
      <HrDashboard dataset={dataset}/>
    </div>
  </motion.div>;
}
