# Koyeb 배포 계획 (Koyeb Deployment Plan)

이 문서는 `jaebong-api` 서비스를 Koyeb 클라우드에 성공적으로 배포하기 위한 단계별 가이드를 제공합니다.

---

## 📅 단계별 절차

### 1단계: 코드 준비 및 GitHub 업로드
1. **GitHub 리포지토리 생성**: 새 리포지토리를 생성합니다 (예: `jaebong-api`).
2. **코드 푸시**: 로컬 프로젝트 코드를 해당 리포지토리에 푸시합니다.
   - `Dockerfile`, `index.js`, `package.json`, `start_with_ram.js`가 반드시 포함되어야 합니다.
   - `node_modules`는 `.gitignore`를 통해 제외되었는지 확인하세요.

### 2단계: Koyeb 계정 설정
1. [Koyeb 공식 사이트](https://www.koyeb.com/)에서 계정을 생성합니다.
2. (필수) 결제 수단을 등록할 필요는 없으나, 무료 티어(Nano) 사용을 위해 이메일 인증을 완료하세요.

### 3단계: 서비스 생성 및 배포 설정
1. **Create Service** 버튼을 클릭합니다.
2. **Deployment Method**: `GitHub`를 선택하고 계정을 연동한 후, 생성한 리포지토리를 선택합니다.
3. **Builder**: `Docker`를 선택합니다 (프로젝트에 `Dockerfile`이 이미 있으므로 자동으로 감지됩니다).
4. **App Name**: 앱 이름을 지정합니다 (예: `jaebong-api`).

### 4단계: 리소스 및 환경 설정
1. **Instance**: `Nano` (무료 티어 - 512MB RAM)를 선택합니다.
2. **Exposed Port**: `3000` (기본값)으로 설정되어 있는지 확인합니다.
3. **Environment Variables**:
   - `PORT`: `3000` (Dockerfile에 명시되어 있으나, 명시적으로 추가하는 것을 권장)
4. **Health Check**: (선택 사항) 기본 설정을 유지합니다.

### 5단계: 배포 실행 및 확인
1. **Deploy**를 클릭하여 배포를 시작합니다.
2. 로그 탭에서 `npm install` 및 서버 실행 로그를 모니터링합니다.
3. 배포 완료 후 제공되는 `***.koyeb.app` 주소로 접속하여 확인합니다.

---

## ✅ 정상 작동 확인 방법
배포된 URL 뒤에 테스트 쿼리를 붙여 호출해 보세요:
`https://[본인-앱-이름].koyeb.app/capture?url=https://www.google.com`

---

## ⚠️ 주의사항 및 팁
- **Cold Start**: Koyeb은 1시간 비활성 시 Deep Sleep 상태가 됩니다. 첫 요청 시 약 5초 정도의 대기 시간이 발생할 수 있습니다.
- **메모리 관리**: 512MB RAM은 타이트한 사양입니다. 만약 서버가 자주 재시작된다면, `start_with_ram.js`에서 할당 비율을 80%에서 70%로 조금 더 낮추어 시스템 여유 메모리를 확보해 보세요.
- **지역 선택**: 사용자가 많은 지역과 가까운 리전(예: Frankfurt, Washington DC, Tokyo 등 중 선택 가능 시)을 선택하면 지연 시간을 줄일 수 있습니다. (무료 티어는 리전이 제한될 수 있음)
