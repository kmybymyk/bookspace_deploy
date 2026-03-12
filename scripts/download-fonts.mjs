import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const FONTS_DIR = path.join(ROOT_DIR, 'public', 'fonts');
const NODE_MODULES = path.join(ROOT_DIR, 'node_modules');

if (!fs.existsSync(FONTS_DIR)) {
    fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// 1. Copy from node_modules
const copyTasks = [
    // Noto Serif KR
    {
        src: path.join(NODE_MODULES, '@fontsource/noto-serif-kr/files/noto-serif-kr-korean-400-normal.woff2'),
        dest: 'NotoSerifKR-Regular.woff2'
    },
    {
        src: path.join(NODE_MODULES, '@fontsource/noto-serif-kr/files/noto-serif-kr-korean-700-normal.woff2'),
        dest: 'NotoSerifKR-Bold.woff2'
    },
    // Noto Sans KR
    {
        src: path.join(NODE_MODULES, '@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff2'),
        dest: 'NotoSansKR-Regular.woff2'
    },
    {
        src: path.join(NODE_MODULES, '@fontsource/noto-sans-kr/files/noto-sans-kr-korean-700-normal.woff2'),
        dest: 'NotoSansKR-Bold.woff2'
    },
    // Nanum Myeongjo
    {
        src: path.join(NODE_MODULES, '@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-400-normal.woff2'),
        dest: 'NanumMyeongjo-Regular.woff2'
    },
    {
        src: path.join(NODE_MODULES, '@fontsource/nanum-myeongjo/files/nanum-myeongjo-korean-700-normal.woff2'),
        dest: 'NanumMyeongjo-Bold.woff2'
    },
    // Pretendard (Use dist/public/static/alternative for woff2 if available, or just standard)
    // Pretendard package structure: dist/web/static/woff2/Pretendard-Regular.woff2
    {
        src: path.join(NODE_MODULES, 'pretendard/dist/web/static/woff2/Pretendard-Regular.woff2'),
        dest: 'Pretendard-Regular.woff2'
    },
    {
        src: path.join(NODE_MODULES, 'pretendard/dist/web/static/woff2/Pretendard-Bold.woff2'),
        dest: 'Pretendard-Bold.woff2'
    },
    // Jua
    {
        src: path.join(NODE_MODULES, '@fontsource/jua/files/jua-korean-400-normal.woff2'),
        dest: 'BM-Jua.woff2'
    },
    // Do Hyeon
    {
        src: path.join(NODE_MODULES, '@fontsource/do-hyeon/files/do-hyeon-korean-400-normal.woff2'),
        dest: 'BM-DoHyeon.woff2'
    },
    // Yeon Sung
    {
        src: path.join(NODE_MODULES, '@fontsource/yeon-sung/files/yeon-sung-korean-400-normal.woff2'),
        dest: 'BM-YeonSung.woff2'
    },
];

// 2. Download missing ones (Maru Buri, SUIT, Nanum Square Neo, Spoqa, Gmarket)
// Using jsDelivr for GitHub repos which is very stable.
const downloadTasks = [
    // Maru Buri - Naver doesn't have a simple npm package ? `maru-buri` exists but maybe old?
    // Using CDN for raw files.
    {
        name: 'MaruBuri-Regular',
        url: 'https://cdn.jsdelivr.net/gh/naver/maruburi@main/data/MaruBuri-Regular.ttf', // Attempting jsdelivr on repo
        ext: 'ttf'
    },
    {
        name: 'MaruBuri-Bold',
        url: 'https://cdn.jsdelivr.net/gh/naver/maruburi@main/data/MaruBuri-Bold.ttf',
        ext: 'ttf'
    },
    // SUIT
    {
        name: 'SUIT-Regular',
        url: 'https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT-Regular.woff2',
        ext: 'woff2'
    },
    {
        name: 'SUIT-Bold',
        url: 'https://cdn.jsdelivr.net/gh/sunn-us/SUIT/fonts/static/woff2/SUIT-Bold.woff2',
        ext: 'woff2'
    },
    // Gmarket Sans
    {
        name: 'GmarketSans-Medium',
        url: 'https://cdn.jsdelivr.net/gh/GmarketSans/GmarketSans/GmarketSansMedium.otf',
        ext: 'otf'
    },
    {
        name: 'GmarketSans-Bold',
        url: 'https://cdn.jsdelivr.net/gh/GmarketSans/GmarketSans/GmarketSansBold.otf',
        ext: 'otf'
    },
    // Spoqa Han Sans Neo
    {
        name: 'SpoqaHanSansNeo-Regular',
        url: 'https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@main/Subset/SpoqaHanSansNeo/SpoqaHanSansNeo-Regular.woff2',
        ext: 'woff2'
    },
    {
        name: 'SpoqaHanSansNeo-Bold',
        url: 'https://cdn.jsdelivr.net/gh/spoqa/spoqa-han-sans@main/Subset/SpoqaHanSansNeo/SpoqaHanSansNeo-Bold.woff2',
        ext: 'woff2'
    },
    // Nanum Square Neo - This is tricky. 
    // Trying a known mirror or repo.
    // If this fails, we might skip or ask user.
    // Let's try to find a raw link that works. 
    // Using `nanum-square-neo` repo if possible?
    // It seems Naver distributes it via zip usually. 
    // I will try to use a CDN that hosts it.
    {
        name: 'NanumSquareNeo-Variable',
        url: 'https://cdn.jsdelivr.net/gh/Haweaso/NanumSquareNeo/NanumSquareNeo-Variable.woff2', // Community mirror?
        ext: 'woff2'
    }
];


async function copyFonts() {
    console.log('Copying fonts from node_modules...');
    for (const task of copyTasks) {
        const destPath = path.join(FONTS_DIR, task.dest);
        try {
            if (fs.existsSync(task.src)) {
                fs.copyFileSync(task.src, destPath);
                console.log(`[COPIED] ${task.dest}`);
            } else {
                console.warn(`[MISSING] Source not found: ${task.src}`);
            }
        } catch (e) {
            console.error(`[ERROR] Copy failed for ${task.dest}: ${e.message}`);
        }
    }
}

const downloadFile = (url, dest, fontName) => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(dest)) {
            console.log(`[SKIP] ${fontName} already exists.`);
            resolve();
            return;
        }

        console.log(`[DOWNLOADING] ${fontName}...`);
        const file = fs.createWriteStream(dest);
        const request = https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                downloadFile(response.headers.location, dest, fontName)
                    .then(resolve)
                    .catch(reject);
                return;
            }

            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(dest, () => { });
                reject(new Error(`Status Code ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                console.log(`[SUCCESS] ${fontName}`);
                resolve();
            });
        });

        request.on('error', (err) => {
            console.log(`[ERROR] Network error for ${fontName}: ${err.message}`);
            fs.unlink(dest, () => { });
            reject(err);
        });
    });
};

async function downloadFonts() {
    console.log('Downloading fonts...');
    const promises = downloadTasks.map(async (font) => {
        const dest = path.join(FONTS_DIR, `${font.name}.${font.ext}`);
        try {
            await downloadFile(font.url, dest, font.name);
        } catch (e) {
            console.error(`[FAIL] ${font.name}: ${e.message}`);
        }
    });

    await Promise.all(promises);
}

async function main() {
    await copyFonts();
    await downloadFonts();
    console.log('Font setup complete.');
}

main();
