import type { PropsWithChildren } from "react";
import { Menu } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { useUiStore } from "../stores/ui-store";
export function AppShell({children}:PropsWithChildren){const ui=useUiStore();return <div className={`app-shell ${ui.sidebarCollapsed?"is-collapsed":""}`}><button className="mobile-menu icon-button" aria-label="메뉴 열기" onClick={()=>ui.set({mobileNavOpen:true})}><Menu size={20}/></button><Sidebar/><main className="main-area">{children}</main></div>;}
