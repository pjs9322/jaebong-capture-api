const { execSync, spawn } = require('child_process');
const os = require('os');

/**
 * 시스템 전체 RAM의 약 80%를 계산하여 노드 서버를 실행하는 헬퍼 스크립트입니다.
 */

try {
    const totalMemoryByte = os.totalmem();
    const totalMemoryMB = Math.floor(totalMemoryByte / (1024 * 1024));
    const allocatedMemoryMB = Math.floor(totalMemoryMB * 0.40);

    console.log(`[Memory Manager] Total System RAM: ${totalMemoryMB}MB`);
    console.log(`[Memory Manager] Allocating 40%: ${allocatedMemoryMB}MB for Node.js Heap (Prioritizing Chromium/Puppeteer)`);

    // 상용 서버 환경에서 실행할 명령어 구성
    const args = [
        `--max-old-space-size=${allocatedMemoryMB}`,
        'index.js'
    ];

    console.log(`[Memory Manager] Running: node ${args.join(' ')}`);

    const child = spawn('node', args, { stdio: 'inherit' });

    child.on('close', (code) => {
        process.exit(code);
    });

} catch (error) {
    console.error('[Memory Manager] Failed to calculate memory or start server:', error);
    process.exit(1);
}
