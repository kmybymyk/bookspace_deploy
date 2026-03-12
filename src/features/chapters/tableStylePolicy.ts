const TABLE_CELL_PADDING = {
    editor: {
        sm: { y: '0.35rem', x: '0.5rem' },
        md: { y: '0.5rem', x: '0.65rem' },
        lg: { y: '0.7rem', x: '0.85rem' },
    },
    output: {
        sm: { y: '0.32em', x: '0.5em' },
        md: { y: '0.45em', x: '0.65em' },
        lg: { y: '0.62em', x: '0.82em' },
    },
} as const

export type TablePaddingScale = 'sm' | 'md' | 'lg'

export function buildSharedTableCss(selector: string, fontFamily: string, scale: 'editor' | 'output'): string {
    const padding = TABLE_CELL_PADDING[scale]

    return `
${selector} table {
  --table-cell-padding-y: ${padding.md.y};
  --table-cell-padding-x: ${padding.md.x};
  width: 100%;
  min-width: 0;
  max-width: 100%;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: fixed;
  margin: ${scale === 'editor' ? '1.2rem' : '1.2em'} 0;
  font-family: ${fontFamily};
}
${selector} .tableWrapper {
  width: auto;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  text-align: left;
  overflow-x: hidden;
  overflow-y: hidden;
  display: block;
}
${selector} table.table-gap-sm {
  --table-cell-padding-y: ${padding.sm.y};
  --table-cell-padding-x: ${padding.sm.x};
}
${selector} table.table-gap-md {
  --table-cell-padding-y: ${padding.md.y};
  --table-cell-padding-x: ${padding.md.x};
}
${selector} table.table-gap-lg {
  --table-cell-padding-y: ${padding.lg.y};
  --table-cell-padding-x: ${padding.lg.x};
}
${selector} th,
${selector} td {
  border: 1px solid #d1d5db;
  padding: var(--table-cell-padding-y) var(--table-cell-padding-x);
  vertical-align: top;
  position: relative;
  overflow-wrap: anywhere;
  word-break: break-word;
}
${selector} th {
  background: #f3f4f6;
  font-weight: 700;
}
`.trim()
}
