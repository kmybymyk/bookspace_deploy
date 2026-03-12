/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Pretendard', 'Noto Sans KR', 'sans-serif'],
            },
            colors: {
                neutral: {
                    850: '#1f1f1f',
                },
                brand: {
                    500: '#14B8A6',
                    600: '#0D9488',
                }
            }
        },
    },
    plugins: [
        require('@tailwindcss/typography'),
    ],
}
