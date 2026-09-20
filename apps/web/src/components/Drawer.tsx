import { X } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { useModalFocus } from "../lib/use-modal-focus";

export function Drawer({open,title,onClose,children,footer}:{open:boolean;title:string;onClose:()=>void;children:ReactNode;footer?:ReactNode}) {
  const drawerRef = useModalFocus<HTMLElement>(open, onClose);
  if (!open) return null;
  return <div className="drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={drawerRef} tabIndex={-1} className="drawer" role="dialog" aria-modal="true" aria-label={title}>
      <header className="drawer-header"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="닫기" title="닫기"><X size={19}/></button></header>
      <div className="drawer-body">{children}</div>{footer}
    </section>
  </div>;
}
export function DrawerSection({children}:PropsWithChildren){return <section className="result-section">{children}</section>;}
