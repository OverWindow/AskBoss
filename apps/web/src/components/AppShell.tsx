import type { PropsWithChildren } from "react";
import { Sidebar } from "./Sidebar";
import { useUiStore } from "../stores/ui-store";
export function AppShell({children}:PropsWithChildren){const ui=useUiStore();return <div className={`app-shell ${ui.sidebarCollapsed?"is-collapsed":""}`}><Sidebar/><main className="main-area">{children}</main></div>;}
