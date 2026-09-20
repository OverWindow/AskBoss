import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useModalFocus } from "../lib/use-modal-focus";

export function Dialog({open,title,onClose,compact,className,children}:{open:boolean;title:string;onClose:()=>void;compact?:boolean;className?:string;children:ReactNode}) {
  const dialogRef = useModalFocus<HTMLElement>(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open && <motion.div className="dialog-backdrop" role="presentation" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .2 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <motion.section ref={dialogRef} tabIndex={-1} className={`dialog${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={title} initial={{ opacity: 0, y: 18, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: .98 }} transition={{ duration: .24, ease: [0.22, 1, 0.36, 1] }}>
          <header className="dialog-header"><h2>{title}</h2><button className="icon-button" type="button" onClick={onClose} aria-label="닫기"><X size={18}/></button></header>
          <div className="dialog-content">{children}</div>
        </motion.section>
      </motion.div>}
    </AnimatePresence>,
    document.body,
  );
}
