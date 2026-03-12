# BookSpace Deploy

BookSpace의 public 배포용 저장소입니다.  
Electron 기반 EPUB 저작/편집기 코드를 중심으로 유지하며, private 원본 저장소의 내부 운영 문서와 작업 로그는 포함하지 않습니다.

## 포함 범위
- 문서 구조 편집
- 본문 편집(Tiptap)
- 디자인 패널
- EPUB/DOCX/Markdown import-export
- Electron 데스크톱 앱 셸

## 제외 범위
- 내부 작업 로그와 운영 메모
- 사내 기획 초안과 실행 계획 문서
- 제3자 문서 덤프
- 릴리즈 산출물, 인증서, 로컬 임시 파일

## 요구사항
- Node.js 18+
- npm 9+

## 시작하기
```bash
npm install
npm run dev
```

Editor-only 개발 실행:

```bash
npm run dev:editor
```

프로덕션 빌드:

```bash
npm run build
```

패키징:

```bash
npm run package
```

## 주요 스크립트
- `npm run dev`: Vite + Electron 개발 실행
- `npm run dev:editor`: editor-only 개발 실행
- `npm run build`: renderer/electron 빌드
- `npm run package`: electron-builder 패키징
- `npm run lint`: ESLint 실행
- `npm run qa:functional`: 핵심 기능 회귀 QA
- `npm run qa:docx`: DOCX 시나리오 QA
- `npm run qa:epub:integrity`: EPUB exporter 정적 무결성 QA

## 디렉터리 개요
```text
electron/
src/
shared/
scripts/
server/
supabase/
public/
build/
```

## 공개 정책
- 이 저장소는 public 배포용 미러입니다.
- 실제 운영 비밀값, 인증서, 토큰은 포함하지 않습니다.
- private 원본 저장소의 내부 문서와 운영 절차는 별도로 관리합니다.

## 라이선스
아직 별도 LICENSE를 추가하지 않았습니다.  
공개 정책을 확정하면 라이선스 파일을 추가하세요.
