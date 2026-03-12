export type FontEmbedMode = 'none' | 'selected'

export type FontAssetFormat = 'woff2' | 'woff' | 'truetype' | 'opentype'

export interface FontAsset {
    fileName: string
    publicPath: string
    format: FontAssetFormat
    weight: number
    style: 'normal' | 'italic'
}

export interface FontPreset {
    id: string
    label: string
    category: 'myeongjo' | 'gothic' | 'decorative'
    fontFamily: string
    fallback: string
    license: 'OFL-1.1' | 'USER-PROVIDED'
    embedAssets: FontAsset[]
}

export const FONT_PRESETS: FontPreset[] = [
    {
        id: 'noto-serif-kr',
        label: 'Noto Serif KR',
        category: 'myeongjo',
        fontFamily: 'Noto Serif KR',
        fallback: `'Source Han Serif K', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NotoSerifKR-Regular.otf',
                publicPath: 'fonts/noto-serif-kr/NotoSerifKR-Regular.otf',
                format: 'opentype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NotoSerifKR-Bold.otf',
                publicPath: 'fonts/noto-serif-kr/NotoSerifKR-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'source-han-serif',
        label: 'Source Han Serif',
        category: 'myeongjo',
        fontFamily: 'Source Han Serif',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SourceHanSerif-Regular.otf',
                publicPath: 'fonts/source-han-serif/SourceHanSerif-Regular.otf',
                format: 'opentype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SourceHanSerif-Bold.otf',
                publicPath: 'fonts/source-han-serif/SourceHanSerif-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'source-han-serif-k',
        label: 'Source Han Serif K',
        category: 'myeongjo',
        fontFamily: 'Source Han Serif K',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', 'Batang', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SourceHanSerifK-Regular.otf',
                publicPath: 'fonts/source-han-serif-k/SourceHanSerifK-Regular.otf',
                format: 'opentype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SourceHanSerifK-Bold.otf',
                publicPath: 'fonts/source-han-serif-k/SourceHanSerifK-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'source-han-serif-sc',
        label: 'Source Han Serif SC',
        category: 'myeongjo',
        fontFamily: 'Source Han Serif SC',
        fallback: `'Source Han Serif', 'Noto Serif KR', 'PingFang SC', 'Noto Serif CJK SC', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SourceHanSerifSC-Regular.otf',
                publicPath: 'fonts/source-han-serif-sc/SourceHanSerifSC-Regular.otf',
                format: 'opentype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SourceHanSerifSC-Bold.otf',
                publicPath: 'fonts/source-han-serif-sc/SourceHanSerifSC-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'source-han-serif-tc',
        label: 'Source Han Serif TC',
        category: 'myeongjo',
        fontFamily: 'Source Han Serif TC',
        fallback: `'Source Han Serif', 'Noto Serif KR', 'PingFang TC', 'Noto Serif CJK TC', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SourceHanSerifTC-Regular.otf',
                publicPath: 'fonts/source-han-serif-tc/SourceHanSerifTC-Regular.otf',
                format: 'opentype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SourceHanSerifTC-Bold.otf',
                publicPath: 'fonts/source-han-serif-tc/SourceHanSerifTC-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-myeongjo',
        label: 'Nanum Myeongjo',
        category: 'myeongjo',
        fontFamily: 'Nanum Myeongjo',
        fallback: `'Noto Serif KR', 'AppleMyungjo', 'Batang', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumMyeongjo-Regular.ttf',
                publicPath: 'fonts/nanum-myeongjo/NanumMyeongjo-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumMyeongjo-Bold.ttf',
                publicPath: 'fonts/nanum-myeongjo/NanumMyeongjo-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'maru-buri',
        label: 'Maru Buri',
        category: 'myeongjo',
        fontFamily: 'Maru Buri',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MaruBuri-Regular.ttf',
                publicPath: 'fonts/maru-buri/MaruBuri-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'MaruBuri-Bold.ttf',
                publicPath: 'fonts/maru-buri/MaruBuri-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'noto-sans-kr',
        label: 'Noto Sans KR',
        category: 'gothic',
        fontFamily: 'Noto Sans KR',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NotoSansKR-Regular.ttf',
                publicPath: 'fonts/noto-sans-kr/NotoSansKR-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NotoSansKR-Bold.ttf',
                publicPath: 'fonts/noto-sans-kr/NotoSansKR-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'pretendard',
        label: 'Pretendard',
        category: 'gothic',
        fontFamily: 'Pretendard',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'Pretendard-Regular.ttf',
                publicPath: 'fonts/pretendard/Pretendard-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'Pretendard-Bold.otf',
                publicPath: 'fonts/pretendard/Pretendard-Bold.otf',
                format: 'opentype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'suit',
        label: 'SUIT',
        category: 'gothic',
        fontFamily: 'SUIT',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SUIT-Regular.woff2',
                publicPath: 'fonts/suit/SUIT-Regular.woff2',
                format: 'woff2',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SUIT-Bold.woff2',
                publicPath: 'fonts/suit/SUIT-Bold.woff2',
                format: 'woff2',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-square-neo',
        label: 'NanumSquare Neo',
        category: 'gothic',
        fontFamily: 'NanumSquareNeo',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumSquareNeo-Regular.ttf',
                publicPath: 'fonts/nanum-square-neo/NanumSquareNeo-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumSquareNeo-Bold.ttf',
                publicPath: 'fonts/nanum-square-neo/NanumSquareNeo-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'spoqa-han-sans-neo',
        label: 'Spoqa Han Sans Neo',
        category: 'gothic',
        fontFamily: 'Spoqa Han Sans Neo',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SpoqaHanSansNeo-Regular.woff2',
                publicPath: 'fonts/spoqa-han-sans-neo/SpoqaHanSansNeo-Regular.woff2',
                format: 'woff2',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SpoqaHanSansNeo-Bold.woff2',
                publicPath: 'fonts/spoqa-han-sans-neo/SpoqaHanSansNeo-Bold.woff2',
                format: 'woff2',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'paperlogy',
        label: 'Paperlogy',
        category: 'decorative',
        fontFamily: 'Paperlogy',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'USER-PROVIDED',
        embedAssets: [
            {
                fileName: 'Paperlogy-Regular.ttf',
                publicPath: 'fonts/paperlogy/Paperlogy-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'Paperlogy-Bold.ttf',
                publicPath: 'fonts/paperlogy/Paperlogy-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-gothic',
        label: 'Nanum Gothic',
        category: 'gothic',
        fontFamily: 'Nanum Gothic',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumGothic-Regular.ttf',
                publicPath: 'fonts/nanum-gothic/NanumGothic-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumGothic-Bold.ttf',
                publicPath: 'fonts/nanum-gothic/NanumGothic-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-barun-gothic',
        label: 'NanumBarunGothic',
        category: 'gothic',
        fontFamily: 'Nanum Barun Gothic',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumBarunGothic-Regular.ttf',
                publicPath: 'fonts/nanum-barun-gothic/NanumBarunGothic-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumBarunGothic-Bold.ttf',
                publicPath: 'fonts/nanum-barun-gothic/NanumBarunGothic-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-square',
        label: 'NanumSquare',
        category: 'gothic',
        fontFamily: 'Nanum Square',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumSquare-Regular.ttf',
                publicPath: 'fonts/nanum-square/NanumSquare-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumSquare-Bold.ttf',
                publicPath: 'fonts/nanum-square/NanumSquare-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-square-round',
        label: 'NanumSquare Round',
        category: 'gothic',
        fontFamily: 'Nanum Square Round',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumSquareRound-Regular.ttf',
                publicPath: 'fonts/nanum-square-round/NanumSquareRound-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'NanumSquareRound-Bold.ttf',
                publicPath: 'fonts/nanum-square-round/NanumSquareRound-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-pen',
        label: 'Nanum Pen Script',
        category: 'decorative',
        fontFamily: 'Nanum Pen',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', cursive`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumPen-Regular.ttf',
                publicPath: 'fonts/nanum-pen/NanumPen-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'nanum-brush',
        label: 'Nanum Brush Script',
        category: 'decorative',
        fontFamily: 'Nanum Brush',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', cursive`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'NanumBrush-Regular.ttf',
                publicPath: 'fonts/nanum-brush/NanumBrush-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'bm-dohyeon',
        label: 'BM DoHyeon',
        category: 'decorative',
        fontFamily: 'BM DoHyeon',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'USER-PROVIDED',
        embedAssets: [
            {
                fileName: 'BMDoHyeon-Regular.ttf',
                publicPath: 'fonts/bm-dohyeon/BMDoHyeon-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'bm-jua',
        label: 'BM Jua',
        category: 'decorative',
        fontFamily: 'BM Jua',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'USER-PROVIDED',
        embedAssets: [
            {
                fileName: 'BMJua-Regular.ttf',
                publicPath: 'fonts/bm-jua/BMJua-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'bm-yeonsung',
        label: 'BM YeonSung',
        category: 'decorative',
        fontFamily: 'BM YeonSung',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', cursive`,
        license: 'USER-PROVIDED',
        embedAssets: [
            {
                fileName: 'BMYeonSung-Regular.ttf',
                publicPath: 'fonts/bm-yeonsung/BMYeonSung-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'ria-sans',
        label: 'Ria Sans',
        category: 'decorative',
        fontFamily: 'Ria Sans',
        fallback: `'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'USER-PROVIDED',
        embedAssets: [
            {
                fileName: 'RiaSans-Regular.ttf',
                publicPath: 'fonts/ria-sans/RiaSans-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'RiaSans-Bold.ttf',
                publicPath: 'fonts/ria-sans/RiaSans-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'seoul-namsan',
        label: 'Seoul Namsan',
        category: 'myeongjo',
        fontFamily: 'Seoul Namsan',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SeoulNamsan-Regular.ttf',
                publicPath: 'fonts/seoul-namsan/SeoulNamsan-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SeoulNamsan-Bold.ttf',
                publicPath: 'fonts/seoul-namsan/SeoulNamsan-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'seoul-hangang',
        label: 'Seoul Hangang',
        category: 'gothic',
        fontFamily: 'Seoul Hangang',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'SeoulHangang-Regular.ttf',
                publicPath: 'fonts/seoul-hangang/SeoulHangang-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
            {
                fileName: 'SeoulHangang-Bold.ttf',
                publicPath: 'fonts/seoul-hangang/SeoulHangang-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'kopub-world-batang',
        label: 'KoPub Batang',
        category: 'myeongjo',
        fontFamily: 'KoPub World Batang',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'KoPubWorldBatang-Light.ttf',
                publicPath: 'fonts/kopub-batang/KoPubWorldBatang-Light.ttf',
                format: 'truetype',
                weight: 300,
                style: 'normal',
            },
            {
                fileName: 'KoPubWorldBatang-Medium.ttf',
                publicPath: 'fonts/kopub-batang/KoPubWorldBatang-Medium.ttf',
                format: 'truetype',
                weight: 500,
                style: 'normal',
            },
            {
                fileName: 'KoPubWorldBatang-Bold.ttf',
                publicPath: 'fonts/kopub-batang/KoPubWorldBatang-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'kopub-world-dotum',
        label: 'KoPub Dotum',
        category: 'gothic',
        fontFamily: 'KoPub World Dotum',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'KoPubWorldDotum-Light.ttf',
                publicPath: 'fonts/kopub-dotum/KoPubWorldDotum-Light.ttf',
                format: 'truetype',
                weight: 300,
                style: 'normal',
            },
            {
                fileName: 'KoPubWorldDotum-Medium.ttf',
                publicPath: 'fonts/kopub-dotum/KoPubWorldDotum-Medium.ttf',
                format: 'truetype',
                weight: 500,
                style: 'normal',
            },
            {
                fileName: 'KoPubWorldDotum-Bold.ttf',
                publicPath: 'fonts/kopub-dotum/KoPubWorldDotum-Bold.ttf',
                format: 'truetype',
                weight: 700,
                style: 'normal',
            },
        ],
    },
    {
        id: 'jeju-myeongjo',
        label: 'Jeju Myeongjo',
        category: 'myeongjo',
        fontFamily: 'Jeju Myeongjo',
        fallback: `'Noto Serif KR', 'Nanum Myeongjo', 'AppleMyungjo', serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'JejuMyeongjo-Regular.ttf',
                publicPath: 'fonts/jeju-myeongjo/JejuMyeongjo-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'jeju-gothic',
        label: 'Jeju Gothic',
        category: 'gothic',
        fontFamily: 'Jeju Gothic',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'JejuGothic-Regular.ttf',
                publicPath: 'fonts/jeju-gothic/JejuGothic-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'jeju-hallasan',
        label: 'Jeju Hallasan',
        category: 'decorative',
        fontFamily: 'Jeju Hallasan',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', cursive`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'JejuHallasan-Regular.ttf',
                publicPath: 'fonts/jeju-hallasan/JejuHallasan-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-agape',
        label: 'Mapo Agape',
        category: 'decorative',
        fontFamily: 'Mapo Agape',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoAgape-Regular.ttf',
                publicPath: 'fonts/mapo-agape/MapoAgape-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-backpacking',
        label: 'Mapo Backpacking',
        category: 'decorative',
        fontFamily: 'Mapo Backpacking',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoBackpacking-Regular.ttf',
                publicPath: 'fonts/mapo-backpacking/MapoBackpacking-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-dpp',
        label: 'Mapo DPP',
        category: 'decorative',
        fontFamily: 'Mapo DPP',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoDPP-Regular.ttf',
                publicPath: 'fonts/mapo-dpp/MapoDPP-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-dacapo',
        label: 'Mapo Dacapo',
        category: 'decorative',
        fontFamily: 'Mapo Dacapo',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoDacapo-Regular.ttf',
                publicPath: 'fonts/mapo-dacapo/MapoDacapo-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-flower-island',
        label: 'Mapo Flower Island',
        category: 'decorative',
        fontFamily: 'Mapo Flower Island',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoFlowerIsland-Regular.ttf',
                publicPath: 'fonts/mapo-flower-island/MapoFlowerIsland-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-golden-pier',
        label: 'Mapo Geumbitnaru',
        category: 'decorative',
        fontFamily: 'Mapo Golden Pier',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoGoldenPier-Regular.ttf',
                publicPath: 'fonts/mapo-golden-pier/MapoGoldenPier-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-hongdae-freedom',
        label: 'Mapo Hongdae Freedom',
        category: 'decorative',
        fontFamily: 'Mapo Hongdae Freedom',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoHongdaeFreedom-Regular.ttf',
                publicPath: 'fonts/mapo-hongdae-freedom/MapoHongdaeFreedom-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-maponaru',
        label: 'Mapo Maponaru',
        category: 'decorative',
        fontFamily: 'Mapo Maponaru',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoMaponaru-Regular.ttf',
                publicPath: 'fonts/mapo-maponaru/MapoMaponaru-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
    {
        id: 'mapo-peacefull',
        label: 'Mapo Peace',
        category: 'decorative',
        fontFamily: 'Mapo Peacefull',
        fallback: `'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`,
        license: 'OFL-1.1',
        embedAssets: [
            {
                fileName: 'MapoPeacefull-Regular.ttf',
                publicPath: 'fonts/mapo-peacefull/MapoPeacefull-Regular.ttf',
                format: 'truetype',
                weight: 400,
                style: 'normal',
            },
        ],
    },
]

export function getFontPresetByFamily(fontFamily: string) {
    return FONT_PRESETS.find((preset) => preset.fontFamily === fontFamily)
}

export function getFontCssStack(fontFamily: string) {
    const preset = getFontPresetByFamily(fontFamily)
    if (!preset) return `'${fontFamily}', serif`
    return `'${preset.fontFamily}', ${preset.fallback}`
}

export function getContrastFontFamily(fontFamily: string) {
    const preset = getFontPresetByFamily(fontFamily)
    if (preset?.category === 'myeongjo') return 'Noto Sans KR'
    return 'Noto Serif KR'
}

export function getContrastFontCssStack(fontFamily: string) {
    return getFontCssStack(getContrastFontFamily(fontFamily))
}

export function getFontFamilyByCategory(baseFontFamily: string, category: 'myeongjo' | 'gothic') {
    const basePreset = getFontPresetByFamily(baseFontFamily)
    if (basePreset?.category === category) return basePreset.fontFamily
    const fallback =
        category === 'myeongjo'
            ? FONT_PRESETS.find((preset) => preset.id === 'noto-serif-kr')
            : FONT_PRESETS.find((preset) => preset.id === 'noto-sans-kr')
    return fallback?.fontFamily ?? (category === 'myeongjo' ? 'Noto Serif KR' : 'Noto Sans KR')
}

export function getCategoryFontCssStack(baseFontFamily: string, category: 'myeongjo' | 'gothic') {
    return getFontCssStack(getFontFamilyByCategory(baseFontFamily, category))
}

export function buildFontFaceCss(fontFamilies: string[]) {
    const uniqueFamilies = Array.from(new Set(fontFamilies))
    const presets = uniqueFamilies
        .map((family) => getFontPresetByFamily(family))
        .filter((preset): preset is FontPreset => Boolean(preset))

    return presets
        .flatMap((preset) =>
            preset.embedAssets.map(
                (asset) => `@font-face {
  font-family: '${preset.fontFamily}';
  src: url('/${asset.publicPath}') format('${asset.format}');
  font-weight: ${asset.weight};
  font-style: ${asset.style};
}`,
            ),
        )
        .join('\n')
}
