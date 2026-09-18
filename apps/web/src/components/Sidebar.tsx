import { BarChart3,ChevronLeft,ChevronRight,Plus,UserRound,X } from "lucide-react";
import { Link,useNavigate } from "react-router-dom";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { useBosses } from "../features/boss/useBosses";
import { api } from "../services/api-client";
import { useUiStore } from "../stores/ui-store";
import type { UserProfile } from "@askboss/shared";

export function Sidebar(){
  const ui=useUiStore();const navigate=useNavigate();const queryClient=useQueryClient();const {data:bosses=[]}=useBosses();
  const {data:profile}=useQuery({queryKey:["profile"],queryFn:()=>api<{profile:UserProfile|null}>("/profile").then(r=>r.profile)});
  const reset=async()=>{if(!confirm("이 세션의 개인 상사와 대화 자료를 모두 초기화할까요? 복구할 수 없습니다."))return;await api("/session",{method:"DELETE"});sessionStorage.clear();queryClient.clear();location.href="/";};
  return <aside className={`sidebar ${ui.mobileNavOpen?"is-mobile-open":""}`} aria-label="주요 메뉴">
    <div className="brand"><span className="brand-mark">AB</span><span className="hide-collapsed">AskBoss</span></div>
    <button className="sidebar-toggle" onClick={()=>ui.set({sidebarCollapsed:!ui.sidebarCollapsed})} aria-label={ui.sidebarCollapsed?"사이드바 펼치기":"사이드바 접기"}>{ui.sidebarCollapsed?<ChevronRight size={16}/>:<ChevronLeft size={16}/>}</button>
    {ui.mobileNavOpen&&<button className="icon-button" style={{position:"absolute",right:12,top:24}} onClick={()=>ui.set({mobileNavOpen:false})} aria-label="메뉴 닫기"><X size={18}/></button>}
    <nav className="boss-nav"><div className="nav-section-label hide-collapsed">상사</div>{bosses.map((boss,index)=><button key={boss.id} className={`boss-nav-item ${ui.selectedBossId===boss.id||(!ui.selectedBossId&&index===0)?"is-active":""}`} onClick={()=>{ui.set({selectedBossId:boss.id,mobileNavOpen:false});navigate("/");}} title={boss.alias}><img className="mini-avatar" src={`/avatars/${boss.avatarKey}.png`} alt=""/><span className="hide-collapsed">{boss.alias}</span></button>)}<div className="nav-divider"/><Link to="/boss/new" className="boss-nav-item add-boss" onClick={()=>ui.set({mobileNavOpen:false})} title="상사 추가"><Plus size={18}/><span className="hide-collapsed">상사 추가</span></Link></nav>
    <div className="sidebar-bottom"><Link className="nav-link" to="/hr-demo" title="HR Demo"><BarChart3 size={19}/><span className="hide-collapsed">HR Demo</span></Link><button className="sidebar-user" onClick={()=>ui.set({settingsOpen:!ui.settingsOpen})} title={profile?`@${profile.handle}`:"사용자 설정"}><UserRound size={19}/><span className="hide-collapsed">{profile?`@${profile.handle}`:"사용자 설정"}</span></button>{ui.settingsOpen&&<div className="profile-menu"><Link to="/settings" onClick={()=>ui.set({settingsOpen:false})}>내 정보 · 상사 관리</Link><button onClick={()=>{sessionStorage.removeItem("askboss:tutorial-seen");ui.set({tutorialOpen:true,settingsOpen:false});navigate("/");}}>Tutorial 다시 보기</button><button className="danger-button" onClick={reset}>Session 데이터 초기화</button></div>}</div>
  </aside>;
}
