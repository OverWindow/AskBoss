# AskBoss 에이전트 작업 규칙

## UI/UX 코드 소유권 (반드시 준수)

이 프로젝트의 **UI/UX는 전담 담당자가 관리**합니다. 기능 개발 시 반드시 아래 규칙을 지킵니다.

- `apps/web/src/styles/globals.css` — UI/UX 담당자 관리 파일. **임의로 덮어쓰거나 대규모 재정렬 금지.** 스타일 변경이 필요하면 기존 규칙을 덮어쓰는 새 규칙을 파일 끝(또는 해당 미디어 쿼리 블록)에 최소 단위로 추가하고, 기존 선언은 건드리지 않습니다.
- `apps/web/src/pages/MainPage.tsx`, `apps/web/src/features/chat/ChatPanel.tsx`, `apps/web/src/features/hr/HrDashboard.tsx`, `apps/web/src/pages/SettingsPage.tsx`, `apps/web/src/components/Sidebar.tsx` — 모바일 레이아웃, 스와이프, 스크롤, 키보드 오프셋(`use-keyboard-offset.ts`) 동작은 UI/UX 담당자가 의도적으로 설계한 것입니다. 이 동작을 "버그"로 판단해 되돌리지 말고, 충돌이 예상되면 별도 조건 분기로 추가합니다.
- 시각적 변경(간격, 폰트 크기, sticky/플로팅, 색상, z-index, 모바일 미디어 쿼리)을 하기 전, 기존 주석/커밋 히스토리("0920 ..." 계열)에서 해당 스타일의 의도를 먼저 확인합니다.
- 불가피하게 위 영역을 수정해야 하면, PR/커밋 메시지에 변경 이유를 명시하고 UI/UX 담당자와 먼저 확인합니다.

## 일반 규칙

- 검증: `pnpm typecheck`, `pnpm test`(전체 그린 유지), `pnpm build`.
- 커밋 메시지는 기존 `MMDD 한글/영문 요약` 네이밍 규칙을 따릅니다.
- 환경변수는 `.env.example`만 추적하며, 실제 `.env*` 파일은 커밋하지 않습니다.
