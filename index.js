const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

const allowedOrigins = [
    'https://susunzip.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1 || origin.endsWith('.koyeb.app')) {
            callback(null, true);
        } else {
            console.log(`[CORS] Rejected origin: ${origin}`);
            callback(null, true); // 일단 모든 오리진 허용 (디버깅 편의를 위해 true 유지하되 로그만 남김)
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(express.json());

// 메인 페이지 안내
app.get('/', (req, res) => {
    res.send('Jaebong Capture API Server is running.');
});

app.get('/capture', async (req, res) => {
    // 1. URL 추출 및 정규화 (Smart URL Recovery)
    let url = req.query.url;

    if (!url) {
        // url= 파라미터를 빼먹고 ?http... 로 바로 시작한 경우 대응
        const fullUrl = req.originalUrl;
        const queryIdx = fullUrl.indexOf('?');
        if (queryIdx !== -1) {
            const rawQuery = fullUrl.substring(queryIdx + 1);
            const match = rawQuery.match(/https?:\/\/.+/);
            if (match) url = match[0];
        }
    }

    if (!url) {
        return res.status(400).json({ status: 'error', message: 'URL is required' });
    }

    // Capture API 자체 파라미터(width, quality, scale)가 타겟 URL 뒤에 붙어있을 경우 분리
    const apiParams = ['width=', 'quality=', 'scale='];
    apiParams.forEach(param => {
        if (url.includes('&' + param)) {
            url = url.split('&' + param)[0];
        }
    });

    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
    }

    const startTime = Date.now();
    let browser = null;

    try {
        console.log(`[1/5] Launching browser for: ${url}`);
        browser = await puppeteer.launch({
            headless: 'new',
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || null,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--no-zygote',
                '--disable-extensions',
                '--disable-features=IsolateOrigins,site-per-process', 
                '--js-flags="--max-old-space-size=256"' // V8 엔진 메모리 제한을 더 조여서 시스템 여유 확보
            ]
        });

        const page = await browser.newPage();
        console.log(`[2/5] Page instance created. Starting navigation...`);

        // --- 리소스 최적화 (광고, 트래커는 차단하되 폰트/미디어는 가시성을 위해 허용) ---
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            const url = request.url().toLowerCase();
            
            // --- 초강력 리소스 차단 (메모리 절약 및 속도 향상의 핵심) ---
            const blockedDomains = [
                'google-analytics.com', 'googletagmanager.com', 'doubleclick.net', 'adservice.google', 
                'facebook.net', 'facebook.com', 'amplitude.com', 'sentry.io', 'hotjar.com', 'clarity.ms',
                'pixel.daangn.com', 'megadata.co.kr', 'channel.io', 'linkedin.com', 'tiktok.com',
                'usergram.info', 'im-log.app', 'toast.com', 'crashlytics.com', 'app-measurement.com'
            ];
            
            const blockedKeywords = [
                'analytics', 'tracking', 'telemetry', 'pixel', 'sentry', 'amplitude', 'tracker',
                'kakao-pixel', 'daumcdn.net/tiara', 'googlesyndication', 'hotjar', 'clarity'
            ];
            
            const isBlocked = 
                blockedDomains.some(domain => url.includes(domain)) ||
                blockedKeywords.some(keyword => url.includes(keyword));

            if (
                ['manifest', 'other', 'ping'].includes(resourceType) || 
                isBlocked ||
                (resourceType === 'image' && (url.includes('ads') || url.includes('metric')))
            ) {
                request.abort();
            } else {
                request.continue();
            }
        });

        // --- 고급 Stealth 설정 ---
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            window.chrome = { runtime: {} };
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
            Object.defineProperty(navigator, 'languages', { get: () => ['ko-KR', 'ko', 'en-US', 'en'] });
        });

        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        const viewportWidth = parseInt(req.query.width) || 1920;
        const deviceScaleFactor = parseFloat(req.query.scale) || 1.0;
        const imageQuality = parseInt(req.query.quality) || 75;

        // 초기 뷰포트를 작게 설정 (메모리 로드 감소)
        await page.setViewport({
            width: viewportWidth,
            height: 1080,
            deviceScaleFactor: deviceScaleFactor
        });

        // 페이지 이동 (안정성을 위해 domcontentloaded 대기 및 타임아웃 조정)
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); // 30초 내에 구조만 뜨면 즉시 진행
            console.log(`[3/5] Navigation complete (DOM content loaded). Waiting 2s for assets to start...`);
            await new Promise(r => setTimeout(r, 2000)); // 이미지 로딩 시작을 위한 최소 대기
            
            // --- 동적 대기 전략 (Dynamic Wait Strategy) ---
            // 구글 이미지 상세 패널이나 SPA 사이트들은 load 이후에도 렌더링 시간이 필요합니다.
            let waitTime = 3000; // 기본 대기 시간 3초로 상향
            
            if (url.includes('google.com') || url.includes('google.co.kr')) {
                console.log('[Wait Strategy] Google detected. Increasing wait time to 5s for dynamic panel hydration...');
                waitTime = 5500; // 구글은 특히 무거우므로 5.5초 대기
            }
            
            await new Promise(r => setTimeout(r, waitTime));
        } catch (e) {
            console.warn(`Navigation warning for ${url}: ${e.message}`);
        }

        if (page.isClosed()) throw new Error('Page was closed during navigation');

        // 100vh 문제 해결 및 요소 가시성 확보
        console.log(`[4/5] Evaluating page elements and triggering lazy-load...`);
        const scrollInfo = await page.evaluate(async () => {
            const style = document.createElement('style');
            style.innerHTML = `
                *, *::before, *::after {
                    transition: none !important;
                    animation: none !important;
                    transition-duration: 0s !important;
                    animation-duration: 0s !important;
                }
                [data-aos] {
                    opacity: 1 !important;
                    transform: none !important;
                    visibility: visible !important;
                }
            `;
            document.head.appendChild(style);

            await document.fonts.ready;

            // 3. 부드러운 스크롤로 Lazy Load 트리거
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 600;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });

            const bodyStyle = window.getComputedStyle(document.body);
            const isHeightRestricted = bodyStyle.height === '100vh' || bodyStyle.height === window.innerHeight + 'px';

            if (isHeightRestricted) {
                document.body.style.height = 'auto';
                document.body.style.minHeight = 'auto';
                document.documentElement.style.height = 'auto';
            }

            const getRealHeight = () => {
                const body = document.body;
                const html = document.documentElement;
                return Math.max(
                    body.scrollHeight, body.offsetHeight,
                    html.clientHeight, html.scrollHeight, html.offsetHeight
                );
            };

            window.scrollTo(0, 0); 
            return { height: getRealHeight(), wasRestricted: isHeightRestricted };
        });

        // 4. 울트라-로우 메모리 최적화 (Adaptive Logic 강화)
        let finalScale = deviceScaleFactor;
        let finalQuality = imageQuality;
        const isAutoMode = !req.query.scale && !req.query.quality;

        if (isAutoMode) {
            const height = scrollInfo.height;
            // 스케일을 줄이는 것이 메모리 절약에 가장 효과적입니다.
            if (height > 15000) {
                finalScale = 0.2; // 초고고도 페이지 대응 (OOM 방지)
                finalQuality = 30;
                console.log(`[Wait Strategy] Extreme height detected (${height}px). Reducing scale to 0.2 for safety.`);
            } else if (height > 10000) {
                finalScale = 0.4; // 더 공격적인 스케일 축소
                finalQuality = 35;
            } else if (height > 5000) {
                finalScale = 0.6;
                finalQuality = 45;
            } else if (height > 2500) {
                finalScale = 0.8;
                finalQuality = 55;
            } else {
                finalScale = 1.0;
                finalQuality = 75;
            }
        }

        // 5. 뷰포트 및 스크린샷 설정 확정
        const usedMemory = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(`[5/5] Finalizing viewport and taking screenshot... (Height: ${scrollInfo.height}px, Current Heap: ${usedMemory}MB)`);
        
        try {
            if (scrollInfo.wasRestricted) {
                // [Fix 모드] 512MB 환경에서는 뷰포트를 전체로 늘릴 때 크래시 위험이 크므로 스케일을 강제 조정
                const safeScale = Math.min(finalScale, 0.7); 
                
                await page.setViewport({
                    width: viewportWidth,
                    height: scrollInfo.height,
                    deviceScaleFactor: safeScale
                });
                await new Promise(r => setTimeout(r, 1000));

                console.log(`[Action] Calling screenshot (fixed mode)...`);
                const imageBuffer = await page.screenshot({
                    fullPage: false,
                    type: 'jpeg',
                    quality: finalQuality
                });
                return sendResponse(imageBuffer, safeScale, finalQuality, true);
            } else {
                await page.setViewport({
                    width: viewportWidth,
                    height: 1080,
                    deviceScaleFactor: finalScale
                });
                await new Promise(r => setTimeout(r, 500));

                console.log(`[Action] Calling screenshot (fullPage mode)...`);
                const imageBuffer = await page.screenshot({
                    fullPage: true,
                    type: 'jpeg',
                    quality: finalQuality
                });
                return sendResponse(imageBuffer, finalScale, finalQuality, false);
            }
        } catch (screenshotError) {
            console.error(`[Error] Screenshot operation failed: ${screenshotError.message}`);
            
            // 만약 너무 길어서 실패했다면 억지로라도 부분 캡처 시도
            if (screenshotError.message.includes('Memory') || scrollInfo.height > 10000) {
                console.log(`[Fallback] Trying partial capture of top 5000px...`);
                await page.setViewport({ width: viewportWidth, height: 5000, deviceScaleFactor: 0.5 });
                const fallbackBuffer = await page.screenshot({ fullPage: false, type: 'jpeg', quality: 30 });
                return sendResponse(fallbackBuffer, 0.5, 30, true);
            }
            throw screenshotError;
        }

        function sendResponse(imageBuffer, scale, quality, fixApplied) {
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            const outputSizeKB = Math.round(imageBuffer.length / 1024);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`Successfully captured: ${url} (Height: ${scrollInfo.height}px, Scale: ${scale}, Quality: ${quality}, Size: ${outputSizeKB}KB, Fix: ${fixApplied}, Time: ${duration}s)`);

            return res.json({
                status: 'success',
                data: {
                    screenshot: {
                        url: base64Image,
                        width: viewportWidth,
                        height: scrollInfo.height,
                        scale: scale,
                        quality: quality,
                        estimatedSizeKB: outputSizeKB,
                        fixApplied: fixApplied,
                        adaptiveApplied: isAutoMode,
                        durationSec: duration
                    }
                }
            });
        }

    } catch (error) {
        console.error(`Capture failed for ${url}:`, error.message);
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(port, () => {
    console.log(`Puppeteer screenshot API server running on port ${port}`);
});
