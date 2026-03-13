const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
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

    let browser = null;

    try {
        console.log(`Starting capture for: ${url}`);
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--no-zygote',
                '--disable-extensions',
                // --single-process는 불안정하여 'frame was detached'의 원인이 되므로 제거하고
                // 대신 메모리를 아끼는 다른 안정한 플래그들 사용
                '--disable-features=IsolateOrigins,site-per-process', 
                '--js-flags="--max-old-space-size=300"' // V8 엔진 메모리 제한
            ]
        });

        const page = await browser.newPage();

        // --- 리소스 최적화 (안정성을 위해 manifest 등 최최소 부가 요소만 차단) ---
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const resourceType = request.resourceType();
            // 폰트와 미디어는 디자인 반영을 위해 허용하고, 불필요한 메타데이터만 차단
            if (['manifest', 'other'].includes(resourceType)) {
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
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
        });

        const viewportWidth = parseInt(req.query.width) || 1920;
        const deviceScaleFactor = parseFloat(req.query.scale) || 1.0;
        const imageQuality = parseInt(req.query.quality) || 75;

        await page.setViewport({
            width: viewportWidth,
            height: 1080,
            deviceScaleFactor: deviceScaleFactor
        });

        // 페이지 이동 (안정성을 위해 load 대기 및 타임아웃 조정)
        try {
            await page.goto(url, { waitUntil: 'load', timeout: 45000 });
            await new Promise(r => setTimeout(r, 2000)); // 리다이렉션 및 초기 스크립트 실행 대기
        } catch (e) {
            console.warn(`Navigation warning for ${url}: ${e.message}`);
            // 핵심 로딩이 끝났다면 계속 진행
        }

        if (page.isClosed()) throw new Error('Page was closed during navigation');

        // 100vh 문제 해결 및 요소 가시성 확보
        const scrollInfo = await page.evaluate(async () => {
            // 1. 애니메이션 및 트랜지션 강제 비활성화 (AOS 및 각종 Fade-in 대응)
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

            // 2. 폰트 로딩 완료 대기 (입력창 아이콘 등 누락 방지)
            await document.fonts.ready;

            // 3. 부드러운 스크롤로 Lazy Load 트리거
            await new Promise((resolve) => {
                let totalHeight = 0;
                let distance = 400;
                let timer = setInterval(() => {
                    let scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight - window.innerHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });

            // 4. 조건부 높이 최적화 (100vh 등 높이가 고정된 사이트 대응)
            const bodyStyle = window.getComputedStyle(document.body);
            const isHeightRestricted = bodyStyle.height === '100vh' || bodyStyle.height === window.innerHeight + 'px';

            if (isHeightRestricted) {
                document.body.style.height = 'auto';
                document.body.style.minHeight = 'auto';
                document.documentElement.style.height = 'auto';
            }

            // 5. 실제 콘텐츠의 최대 높이 계산
            const getRealHeight = () => {
                const body = document.body;
                const html = document.documentElement;
                return Math.max(
                    body.scrollHeight, body.offsetHeight,
                    html.clientHeight, html.scrollHeight, html.offsetHeight
                );
            };

            window.scrollTo(0, 0); // 원위치
            return { height: getRealHeight(), wasRestricted: isHeightRestricted };
        });

        // 4. 페이지 높이에 따른 유기적 품질/스케일 계산 (Adaptive Logic)
        // 목표: 대략 500KB 이하 유지
        let finalScale = deviceScaleFactor;
        let finalQuality = imageQuality;

        // 사용자가 명시적으로 파라미터를 주지 않은 경우에만 자동 조정 수행
        const isAutoMode = !req.query.scale && !req.query.quality;

        if (isAutoMode) {
            const height = scrollInfo.height;

            if (height > 10000) {
                // 초장대 페이지 (10,000px 초과): 극한의 최적화
                finalScale = 0.5;
                finalQuality = 40;
            } else if (height > 5000) {
                // 장대 페이지 (5,000px ~ 10,000px): 과감한 최적화
                finalScale = 0.7;
                finalQuality = 50;
            } else if (height > 2500) {
                // 중간 페이지 (2,500px ~ 5,000px): 완만한 최적화
                finalScale = 0.9;
                finalQuality = 60;
            } else {
                // 일반 페이지: 기본값 유지
                finalScale = 1.0;
                finalQuality = 80;
            }
        }

        // 5. 뷰포트 및 스크린샷 설정 확정
        if (scrollInfo.wasRestricted) {
            // [Fix 모드] 100vh 사이트: 뷰포트를 전체 높이로 늘리고 캡쳐 (fullPage: false)
            await page.setViewport({
                width: viewportWidth,
                height: scrollInfo.height,
                deviceScaleFactor: finalScale
            });
            await new Promise(r => setTimeout(r, 1000));

            const imageBuffer = await page.screenshot({
                fullPage: false,
                type: 'jpeg',
                quality: finalQuality
            });
            return sendResponse(imageBuffer, finalScale, finalQuality, true);
        } else {
            // [Standard 모드] 일반 사이트: 뷰포트 높이는 유지하고 Puppeteer 표준 방식 사용 (fullPage: true)
            // 브라우저 창(Viewport)이 너무 길어지면 레이아웃이 깨지는 사이트들을 방지합니다.
            await page.setViewport({
                width: viewportWidth,
                height: 1080,
                deviceScaleFactor: finalScale
            });
            await new Promise(r => setTimeout(r, 500));

            const imageBuffer = await page.screenshot({
                fullPage: true,
                type: 'jpeg',
                quality: finalQuality
            });
            return sendResponse(imageBuffer, finalScale, finalQuality, false);
        }

        // 응답 헬퍼 함수
        function sendResponse(imageBuffer, scale, quality, fixApplied) {
            const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
            const outputSizeKB = Math.round(imageBuffer.length / 1024);

            console.log(`Successfully captured: ${url} (Height: ${scrollInfo.height}px, Scale: ${scale}, Quality: ${quality}, Size: ${outputSizeKB}KB, Fix: ${fixApplied})`);

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
                        adaptiveApplied: isAutoMode
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
