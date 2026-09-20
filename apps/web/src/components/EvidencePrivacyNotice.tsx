import { ShieldAlert } from "lucide-react";

export function EvidencePrivacyNotice() {
  return <aside className="evidence-privacy-notice" role="note" aria-label="자료 업로드 개인정보 안내">
    <ShieldAlert size={20} aria-hidden="true"/>
    <div>
      <strong>기밀 정보나 개인 정보 노출이 없도록 주의해주세요!</strong>
      <p>이름, 연락처, 계정 정보, 고객정보와 회사 기밀은 업로드 전에 가리거나 삭제해 주세요.</p>
    </div>
  </aside>;
}
