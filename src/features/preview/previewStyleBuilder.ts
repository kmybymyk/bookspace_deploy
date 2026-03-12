import { buildSharedTableCss } from '../chapters/tableStylePolicy'

interface PreviewStyleBuilderParams {
    previewFontFaceCss: string
    fontCssStack: string
    contrastFontCssStack: string
    serifFontCssStack: string
    sansFontCssStack: string
    subheadFontCssStack: string
    titleFontCssStack: string
    style1FontCssStack: string
    style2FontCssStack: string
    style3FontCssStack: string
    effectiveBodyFontSize: number
    effectiveSubheadFontSize: number
    effectiveTitleFontSize: number
    effectiveTitleAlign: string
    effectiveTitleSpacing: number
    h4FontSize: number
    h5FontSize: number
    h6FontSize: number
    lineHeight: number
    letterSpacing: number
    paragraphSpacing: number
    textIndent: number
    suppressFirstParagraphIndent: boolean
    chapterTitleDivider: boolean
    imageMaxWidth: number
}

export function buildPreviewCommonCss(params: PreviewStyleBuilderParams): string {
    const {
        previewFontFaceCss,
        fontCssStack,
        contrastFontCssStack,
        serifFontCssStack,
        sansFontCssStack,
        subheadFontCssStack,
        titleFontCssStack,
        style1FontCssStack,
        style2FontCssStack,
        style3FontCssStack,
        effectiveBodyFontSize,
        effectiveSubheadFontSize,
        effectiveTitleFontSize,
        effectiveTitleAlign,
        effectiveTitleSpacing,
        h4FontSize,
        h5FontSize,
        h6FontSize,
        lineHeight,
        letterSpacing,
        paragraphSpacing,
        textIndent,
        suppressFirstParagraphIndent,
        chapterTitleDivider,
        imageMaxWidth,
    } = params

    return `
${previewFontFaceCss}
.preview-book-content {
  font-family: ${fontCssStack};
  font-size: ${effectiveBodyFontSize}px;
  line-height: ${lineHeight};
  letter-spacing: ${letterSpacing}em;
  color: #1f2937;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.preview-book-content p {
  margin: 0 0 ${paragraphSpacing}em;
  text-indent: ${textIndent}em;
}
.preview-book-content h1,.preview-book-content h2,.preview-book-content h3,.preview-book-content h4,.preview-book-content h5,.preview-book-content h6 { margin: 1.2em 0 0.6em; }
.preview-book-content h1 { text-align: ${effectiveTitleAlign}; margin-bottom: ${effectiveTitleSpacing}em; font-size: ${effectiveTitleFontSize}px; font-family: ${titleFontCssStack}; border-bottom: ${chapterTitleDivider ? '1px solid #e5e7eb' : '0'}; padding-bottom: ${chapterTitleDivider ? '0.45em' : '0'}; }
.preview-book-content h2 { font-size: ${effectiveSubheadFontSize}px; font-family: ${subheadFontCssStack}; }
.preview-book-content h3 { font-size: ${effectiveBodyFontSize}px; font-family: ${fontCssStack}; }
.preview-book-content h4 { font-size: ${h4FontSize}px; font-family: ${style1FontCssStack}; }
.preview-book-content h5 { font-size: ${h5FontSize}px; font-family: ${style2FontCssStack}; }
.preview-book-content h6 { font-size: ${h6FontSize}px; font-family: ${style3FontCssStack}; }
.preview-book-content sup, .preview-book-content sub { font-family: ${contrastFontCssStack}; }
.preview-book-content [data-block-font='serif'] { font-family: ${serifFontCssStack} !important; }
.preview-book-content [data-block-font='sans'] { font-family: ${sansFontCssStack} !important; }
.preview-book-content blockquote { border: 0; padding: 0.35em 0; margin: 1.4em 0; color: #4b5563; text-align: center; font-family: ${serifFontCssStack}; }
.preview-book-content blockquote p { text-indent: 0 !important; }
.preview-book-content blockquote::before, .preview-book-content blockquote::after { display: block; font-size: 2.5em; line-height: 1; color: #9ca3af; text-align: inherit; font-family: ${serifFontCssStack}; font-style: normal; font-weight: 700; letter-spacing: 0.08em; }
.preview-book-content blockquote::before { content: "❝"; margin-bottom: 0.35em; }
.preview-book-content blockquote::after { content: "❞"; margin-top: 0.35em; }
.preview-book-content blockquote.callout { background: #f3f4f6; border-left: 4px solid #4b5563; padding: 0.85em 1em; border-radius: 0.4em; }
.preview-book-content blockquote.quote-note { border: 0; background: #f3f4f6; color: #1f2937; padding: 0.85em 1em; border-radius: 0; text-align: left; }
.preview-book-content blockquote.quote-note::before, .preview-book-content blockquote.quote-note::after { content: none; }
.preview-book-content blockquote.quote-note, .preview-book-content blockquote.quote-note * { font-style: normal !important; }
.preview-book-content blockquote.quote-emphasis { border-left-color: #f59e0b; background: #fffbeb; padding: 0.85em 1em; border-radius: 0.4em; font-style: normal; }
${suppressFirstParagraphIndent ? '.preview-book-content p:first-of-type { text-indent: 0; }' : ''}
.preview-book-content img { max-width: ${imageMaxWidth}%; height: auto; }
.preview-book-content figure.book-image-figure { margin: 1em auto; }
.preview-book-content figure.book-image-figure img { display: block; width: 100%; max-width: 100%; height: auto; }
.preview-book-content figure.book-image-figure figcaption { margin-top: 0.5em; text-indent: 0; font-size: 0.9em; line-height: 1.5; text-align: center; color: #4b5563; }
.preview-book-content p.footnote, .preview-book-content p.endnote { font-size: 0.9em; line-height: 1.6; text-indent: 0; color: #4b5563; }
.preview-book-content p.footnote-start, .preview-book-content p.endnote-start { border-top: 1px solid #d1d5db; padding-top: 0.75em; margin-top: 1.5em; }
.preview-book-content a.note-ref, .preview-book-content a[href^="#"], .preview-book-content a sup, .preview-book-content sup a { text-decoration: none !important; color: inherit; }
.preview-book-content a:not(.note-ref):not([href^="#"]) { text-decoration-thickness: 1px; text-underline-offset: 0.08em; text-decoration-skip-ink: auto; }
.preview-book-content ul, .preview-book-content ol { margin: 0 0 ${paragraphSpacing}em 1.4em; padding: 0; }
.preview-book-content li { margin: 0.2em 0; }
.preview-book-content ul.list-circle { list-style-type: circle; }
.preview-book-content ul.list-square { list-style-type: square; }
.preview-book-content hr.rule-solid { border: 0; border-top: 1px solid #9ca3af; margin: 2em 0; height: 0; }
.preview-book-content hr.rule-dotted { border: 0; border-top: 2px dotted #9ca3af; margin: 2em 0; height: 0; }
.preview-book-content hr.rule-double { border: 0; border-top: 3px double #9ca3af; margin: 2em 0; height: 0; }
${buildSharedTableCss('.preview-book-content', sansFontCssStack, 'output')}
`
}
