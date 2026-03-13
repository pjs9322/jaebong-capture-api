# Jaebong Capture API Server

URL 기반의 웹페이지를 캡처하여 이미지를 반환하는 Node.js 기반 Puppeteer API 서버입니다. 
저사양 클라우드 환경에서도 안정적으로 작동할 수 있도록 최적화된 로직을 포함하고 있습니다.

## 🚀 주요 기능
- **Smart URL Recovery**: 불완전한 URL 파라미터를 자동으로 감지하고 복구합니다.
- **Adaptive Quality/Scale**: 페이지 높이에 따라 이미지 품질과 스케일을 자동으로 조절하여 페이로드 크기를 최적화합니다 (목표: 500KB 이하).
- **Stealth Mode**: 봇 감지를 우회하기 위한 고급 Stealth 브라우저 설정을 적용합니다.
- **Resource Optimization**: 불필요한 리소스(manifest 등) 차단 및 메모리 사용량 제한 설정을 포함합니다.

---

## ☁️ 클라우드 배포 분석 (무료 티어 검증)

상용 무료 클라우드(Render, Vercel 등)에 배포하여 실 서비스 사용이 가능한지에 대한 분석 결과입니다.

### 1. Render (Free Tier)
- **적합성**: ⭐⭐ (낮음~보통)
- **장점**: `Dockerfile` 기반 배포가 가장 쉽고 직관적입니다.
- **리스크**: 
    - **Cold Start (심각)**: 15분간 요청이 없으면 서버가 절전 모드로 전환됩니다. 첫 접속 시 다시 켜지는 데 **최소 1분에서 최대 3분**까지 소요될 수 있어 사용자 경험이 좋지 않습니다.
    - **RAM 부족 (512MB)**: Puppeteer 실행 시 OOM 위험이 큽니다.
- **대책**: `start_with_ram.js`를 통해 메모리를 최적화했으나, Cold Start 리스크는 상존합니다.

### 2. Vercel (Free Tier)
- **적합성**: ⭐ (추천하지 않음)
- **장점**: 배포가 매우 빠르고 무제한 요청 처리가 가능합니다.
- **리스크**: 
    - **Serverless 제한**: Vercel의 무료 함수(Lambda)는 최대 실행 시간이 **10초**입니다. Puppeteer의 `page.goto`와 렌더링 대기 시간은 보통 10초를 초과하기 때문에 타임아웃 오류가 발생할 가능성이 매우 높습니다.
    - **Chromium 바이너리**: Chromium을 별도로 포함해야 하므로 설정이 매우 복잡해지며 성능 저하가 발생합니다.

### 2. Koyeb (Free Tier - Nano/Eco)
- **적합성**: ⭐⭐⭐⭐ (추천)
- **장점**: 
    - **빠른 Cold Start**: 1시간 동안 요청이 없으면 "Deep Sleep"에 들어가지만, 다시 깨어나는 시간이 **약 1~5초 내외**로 Render보다 압도적으로 빠릅니다.
    - **비용**: 완전 무료 티어(Nano)를 제공하며 `Dockerfile` 배포가 가능합니다.
- **리스크**: 역시 512MB RAM 수준이므로 다량의 동시 요청 처리에는 한계가 있습니다.

---

## 🛠️ 실 서비스 운영을 위한 리스크 및 해결 방법

| 리스크 종류 | 원인 | 해결 방안 |
| :--- | :--- | :--- |
| **메모리 부족 (OOM)** | Chromium 브라우저의 높은 RAM 점유 | `start_with_ram.js` 사용, 동시 요청 수를 1~2개로 제한하는 큐잉 시스템 도입 고려 |
| **속도 저하 (Timeout)** | 다국어 폰트, 무거운 스크립트 로딩 | `waitUntil: 'load'` 조정 및 `Adaptive Quality`를 통한 스크린샷 처리 속도 향상 |
| **봇 차단 (Blocked)** | 캡처 대상 사이트의 보안 정책 | 현재 적용된 `Stealth Plan` (User-Agent, Headers, Webdriver 감추기) 강화 유지 |

---

## 📋 권장 실행 환경

1. **테스트/개인용**: Render Free Tier 또는 Koyeb 무료 티어 (`Dockerfile` 활용).
2. **실 서비스 (안정적 운영)**:
    - **Render (Individual/Starter)**: 월 $7, 512MB~1GB RAM - Cold Start 방지.
    - **Oracle Cloud (Free Tier)**: ARM A1 인스턴스 (최대 24GB RAM 무료) - 최고의 성능과 완전 무료.
    - **Specialized API**: 직접 서버 운영이 힘들 경우 전용 캡처 서비스 API 연동 고려.

## ⚙️ 로컬 실행 방법
```bash
# 기본 실행
npm install
npm start

# 메모리 자동 할당 실행 (추천)
npm run start:auto
```
