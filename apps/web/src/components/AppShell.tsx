import { useEffect, type PropsWithChildren } from "react";
import { Menu } from "lucide-react";
import { useUiStore } from "../stores/ui-store";
import { Sidebar } from "./Sidebar";
import { ArchiveModal } from "../pages/ArchivePage";

const TABLET_MEDIA = "(max-width:1024px)";

export function AppShell({children}:PropsWithChildren){
  const ui=useUiStore();
  useEffect(() => {
    const media = window.matchMedia(TABLET_MEDIA);
    const apply = () => ui.set({ sidebarCollapsed: media.matches });
    if (media.matches) apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return <div className={`app-shell ${ui.sidebarCollapsed?"is-collapsed":""}`}><button className="mobile-nav-trigger" type="button" aria-label="메뉴 열기" aria-expanded={ui.mobileNavOpen} onClick={()=>ui.set({mobileNavOpen:true})}><Menu size={20}/></button>{ui.mobileNavOpen&&<button className="mobile-nav-backdrop" type="button" aria-label="메뉴 닫기" onClick={()=>ui.set({mobileNavOpen:false})}/>}<Sidebar/><main className="main-area">{children}</main><ArchiveModal open={ui.archiveOpen} onClose={()=>ui.set({archiveOpen:false})}/></div>;
}
