import { useEffect, type PropsWithChildren } from "react";
import { Menu } from "lucide-react";
import { useUiStore } from "../stores/ui-store";
import { Sidebar } from "./Sidebar";
import { ArchiveModal } from "../pages/ArchivePage";

const TABLET_MEDIA = "(max-width:1024px)";

export function AppShell({children}:PropsWithChildren){
  const ui=useUiStore();
  useEffect(() => {
    // Below the mobile breakpoint the sidebar is an off-canvas drawer (sandwich
    // button); above it the sidebar is always expanded. Collapsing manually is
    // only possible while expanded — auto-switch on resize in both directions.
    const media = window.matchMedia(TABLET_MEDIA);
    const apply = () => ui.set({ sidebarCollapsed: media.matches });
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  useEffect(() => {
    // Crossing the breakpoint flips the sidebar between the off-canvas drawer
    // and the expanded grid column. Animate whichever element appears so the
    // switch reads as a smooth hand-off instead of a layout jump.
    const media = window.matchMedia("(max-width:1024px)");
    let timer = 0;
    const animate = () => {
      const cls = media.matches ? "sidebar-anim-out" : "sidebar-anim-in";
      document.documentElement.classList.remove("sidebar-anim-in", "sidebar-anim-out");
      void document.documentElement.offsetWidth;
      document.documentElement.classList.add(cls);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => document.documentElement.classList.remove(cls), 380);
    };
    media.addEventListener("change", animate);
    return () => {
      media.removeEventListener("change", animate);
      window.clearTimeout(timer);
      document.documentElement.classList.remove("sidebar-anim-in", "sidebar-anim-out");
      document.documentElement.classList.remove("sidebar-no-motion");
    };
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(max-width:1024px)");
    const closeNav = () => { if (!media.matches) ui.set({ mobileNavOpen: false }); };
    closeNav();
    media.addEventListener("change", closeNav);
    return () => media.removeEventListener("change", closeNav);
  }, []);
  useEffect(() => {
    if (!ui.mobileNavOpen || !window.matchMedia("(max-width:1024px)").matches) return;
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
  return <div className={`app-shell ${ui.sidebarCollapsed?"is-collapsed":""}`}><button className="mobile-nav-trigger" type="button" aria-label="메뉴 열기" aria-expanded={ui.mobileNavOpen} onClick={()=>ui.set({mobileNavOpen:true})}><Menu size={20}/></button><img className="mobile-brand-logo" src="/image.svg?v=2" alt="AskBoss" />{ui.mobileNavOpen&&<button className="mobile-nav-backdrop" type="button" aria-label="메뉴 닫기" onClick={()=>ui.set({mobileNavOpen:false})}/>}<Sidebar/><main className="main-area" inert={ui.mobileNavOpen ? true : undefined}>{children}</main><ArchiveModal open={ui.archiveOpen} onClose={()=>ui.set({archiveOpen:false})}/></div>;
}
