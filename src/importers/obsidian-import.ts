import { Glob } from 'bun'
import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { NewMemory } from '../types'

// Matches YYYY-MM-DD at the start of a filename (e.g., "2025-09-11.md" or "2025-09-11 Meeting Notes.md")
const YYYY_MM_DD_REGEX = /^(\d{4}-\d{2}-\d{2})/

// Matches ISO 8601 datetime (e.g., "2025-09-11T14:30:00" or "20250911T143000")
const ISO_DATETIME_REGEX =
  /^(\d{4}-?\d{2}-?\d{2}T\d{2}:?\d{2}:?\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/

/**
 * Extracts a date from a filename if it contains a timestamp.
 * Supports YYYY-MM-DD format (e.g., "2025-09-11.md") and ISO format.
 * Returns null if no date pattern is found.
 */
function extractDateFromFilename(filename: string): Date | null {
  const name = basename(filename, '.md')

  // Try ISO datetime first (more specific)
  const isoMatch = name.match(ISO_DATETIME_REGEX)
  if (isoMatch?.[1]) {
    const parsed = new Date(isoMatch[1])
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }

  // Try YYYY-MM-DD format
  const dateMatch = name.match(YYYY_MM_DD_REGEX)
  if (dateMatch?.[1]) {
    const parsed = new Date(dateMatch[1])
    if (!isNaN(parsed.getTime())) {
      return parsed
    }
  }

  return null
}

/**
 * Imports Obsidian notes from a directory.
 *
 * - Only reads Markdown (.md) files
 * - Ignores the .obsidian directory
 * - Uses filename timestamps (YYYY-MM-DD or ISO) for memoryCreatedAt when available,
 *   otherwise falls back to file ctime
 */
export async function importObsidianNotes(
  rootDir: string
): Promise<NewMemory[]> {
  const glob = new Glob('**/*.md')
  const memories: NewMemory[] = []

  for await (const relativePath of glob.scan({
    cwd: rootDir,
    dot: false, // Don't match dotfiles
    onlyFiles: true,
  })) {
    // Skip anything in .obsidian directory
    if (relativePath.startsWith('.obsidian/') || relativePath === '.obsidian') {
      continue
    }

    const fullPath = join(rootDir, relativePath)
    const filename = basename(relativePath)
    const title = basename(filename, '.md')

    // Try to extract date from filename, fall back to file ctime
    let memoryCreatedAt: Date
    const filenameDate = extractDateFromFilename(filename)

    if (filenameDate) {
      memoryCreatedAt = filenameDate
    } else {
      const fileStat = await stat(fullPath)
      memoryCreatedAt = fileStat.ctime
    }

    // Read the file content
    const content = await Bun.file(fullPath).text()

    memories.push({
      source: `obsidian:${relativePath}`,
      memoryCreatedAt: memoryCreatedAt.toISOString(),
      title,
      metadata: {
        originalPath: relativePath,
        importedFrom: 'obsidian',
      },
      content,
    })
  }

  return memories
}
