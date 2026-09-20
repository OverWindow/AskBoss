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
  useEffect(() => {
    // Crossing the mobile breakpoint flips the sidebar between grid column and
    // off-canvas fixed positioning; suppress its transform transition during the
    // switch so it does not flash and slide away.
    const media = window.matchMedia("(max-width:850px)");
    let timer = 0;
    const suppress = () => {
      document.documentElement.classList.add("sidebar-no-motion");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.documentElement.classList.remove("sidebar-no-motion"), 320);
    };
    media.addEventListener("change", suppress);
    return () => {
      media.removeEventListener("change", suppress);
      window.clearTimeout(timer);
      document.documentElement.classList.remove("sidebar-no-motion");
    };
  }, []);
  useEffect(() => {
    if (!ui.mobileNavOpen || !window.matchMedia("(max-width:850px)").matches) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousRootOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousRootOverflow;
    };
  }, [ui.mobileNavOpen]);
  return <div className={`app-shell ${ui.sidebarCollapsed?"is-collapsed":""}`}><button className="mobile-nav-trigger" type="button" aria-label="메뉴 열기" aria-expanded={ui.mobileNavOpen} onClick={()=>ui.set({mobileNavOpen:true})}><Menu size={20}/></button>{ui.mobileNavOpen&&<button className="mobile-nav-backdrop" type="button" aria-label="메뉴 닫기" onClick={()=>ui.set({mobileNavOpen:false})}/>}<Sidebar/><main className="main-area" inert={ui.mobileNavOpen ? true : undefined}>{children}</main><ArchiveModal open={ui.archiveOpen} onClose={()=>ui.set({archiveOpen:false})}/></div>;
}
