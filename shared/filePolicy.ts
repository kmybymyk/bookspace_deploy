export const PROJECT_FILE_EXTENSION = 'bksp' as const
export const PROJECT_FILE_EXTENSIONS = [PROJECT_FILE_EXTENSION] as const
export const PROJECT_FILE_FILTER = {
  name: 'BookSpace 프로젝트',
  extensions: [...PROJECT_FILE_EXTENSIONS],
} as const

export const IMPORT_FILE_EXTENSIONS = ['epub', 'docx', 'md', 'markdown'] as const
export type ImportFileExtension = (typeof IMPORT_FILE_EXTENSIONS)[number]

export function isProjectExtension(ext: string | undefined): boolean {
  return ext?.toLowerCase() === PROJECT_FILE_EXTENSION
}

export function isImportExtension(ext: string | undefined): ext is ImportFileExtension {
  const normalized = ext?.toLowerCase()
  return normalized === 'epub' || normalized === 'docx' || normalized === 'md' || normalized === 'markdown'
}
