# AskBoss

관찰 자료를 바탕으로 가상의 상사 Persona를 만들고 대화·번역·답변 추천을 제공하는 세션 기반 웹 애플리케이션입니다.

## 로컬 실행

```bash
pnpm install
cp .env.example .env.development
pnpm dev
```

개발 서버는 저장소 루트의 `.env.development`를 자동으로 읽으며, 셸에서 미리 export한 값이 항상 우선합니다. 모든 실제 `.env*` 파일은 Git에서 제외되고 `.env.example`만 추적합니다.

기본 로컬 모드는 외부 자격 증명 없이 메모리 저장소와 데모 AI로 동작합니다. 실제 연동 시 `DATABASE_URL`에는 Supabase Dashboard의 **Transaction Pooler URI**를 사용하고, Supabase와 Mindlogic 환경변수를 채웁니다. 직접 DB 호스트의 `5432` 주소는 로컬·Vercel 기본 연결로 사용하지 않습니다.

관리자 콘솔은 공개 메뉴에 표시되지 않으며 `/admin`에서 직접 접근합니다. 개발용 비밀값은 다음처럼 만들 수 있습니다.

```bash
openssl rand -base64 24 # ADMIN_PASSWORD 후보
openssl rand -hex 32    # ADMIN_SESSION_SECRET
```

생성한 값을 `.env.development`의 `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`에 각각 넣습니다. 운영 환경에서는 두 값이 없으면 API가 시작되지 않습니다.

## 데이터베이스

`supabase/migrations`의 `0001`부터 `0007`까지 순서대로 적용하고 `boss-evidence` Bucket이 private인지 확인합니다. `0005_admin_operations.sql`은 관리자 세션·로그인 시도·운영 작업 기록과 Job 재시도 연결을, `0006_global_boss_admin.sql`은 모두의 상사 관찰 자료·설문·업로드 저장소를, `0007_personal_boss_defaults.sql`은 개인 상사 공통 AI 기본 성격을 추가합니다. HR 데모 데이터는 `pnpm seed:hr`로 생성합니다.

## 배포

루트 Vercel 프로젝트 하나에서 Web 정적 빌드와 `/api` Node Function을 동일 origin으로 제공합니다. `/admin` 하위 경로도 SPA로 rewrite됩니다. 배포 전에 `.env.example`의 서버 환경변수를 Vercel에 등록하고 `/api/health/ai`에서 필수 모델을 확인합니다. 운영 관리자 로그인을 위해 `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`을 반드시 설정하고, `WEB_ORIGIN`은 실제 운영 origin(예: `https://ask-boss-mauve.vercel.app`)으로 설정합니다. 같은 배포 도메인의 `/admin` 요청은 Host와 Origin이 일치할 때도 허용됩니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```
