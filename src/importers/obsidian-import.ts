import { stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { Glob } from 'bun'
import createDebug from 'debug'
import { DateTime } from 'luxon'
import type { NewMemory } from '../types'

const d = createDebug('istoria:obsidian')

// Matches YYYY-MM-DD at the start of a filename (e.g., "2025-09-11.md" or "2025-09-11 Meeting Notes.md")
const YYYY_MM_DD_REGEX = /^(\d{4}-\d{2}-\d{2})/

// Matches ISO 8601 datetime (e.g., "2025-09-11T14:30:00" or "20250911T143000")
const ISO_DATETIME_REGEX =
  /^(\d{4}-?\d{2}-?\d{2}T\d{2}:?\d{2}:?\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/

/**
 * Extracts a date from a filename if it contains a timestamp.
 * Supports YYYY-MM-DD format (e.g., "2025-09-11.md") and ISO format.
 * Returns null if no date pattern is found.
 *
 * For YYYY-MM-DD dates without time, assumes local timezone at start of day.
 * For ISO dates with timezone info, preserves that timezone.
 * For ISO dates without timezone, assumes local timezone.
 */
function extractDateFromFilename(filename: string): DateTime | null {
  const name = basename(filename, '.md')

  // Try ISO datetime first (more specific)
  const isoMatch = name.match(ISO_DATETIME_REGEX)
  if (isoMatch?.[1]) {
    // fromISO will use the timezone in the string if present,
    // otherwise uses local timezone
    const parsed = DateTime.fromISO(isoMatch[1])
    if (parsed.isValid) {
      d('extracted ISO date from filename %s: %s', filename, parsed.toISO())
      return parsed
    }
  }

  // Try YYYY-MM-DD format - interpret in local timezone
  const dateMatch = name.match(YYYY_MM_DD_REGEX)
  if (dateMatch?.[1]) {
    // Parse as local date (start of day in local timezone)
    const parsed = DateTime.fromISO(dateMatch[1])
    if (parsed.isValid) {
      d(
        'extracted YYYY-MM-DD date from filename %s: %s (local timezone: %s)',
        filename,
        parsed.toISO(),
        parsed.zoneName
      )
      return parsed
    }
  }

  d('no date found in filename: %s', filename)
  return null
}

/**
 * Imports Obsidian notes from a directory.
 *
 * - Only reads Markdown (.md) files
 * - Ignores the .obsidian directory
 * - Uses filename timestamps (YYYY-MM-DD or ISO) for memoryCreatedAt when available,
 *   otherwise falls back to file mtime (modification time)
 * - All dates preserve timezone information
 */
export async function importObsidianNotes(
  rootDir: string
): Promise<NewMemory[]> {
  d('starting import from directory: %s', rootDir)
  const glob = new Glob('**/*.md')
  const memories: NewMemory[] = []

  for await (const relativePath of glob.scan({
    cwd: rootDir,
    dot: false, // Don't match dotfiles
    onlyFiles: true,
  })) {
    // Skip anything in .obsidian directory
    if (relativePath.startsWith('.obsidian/') || relativePath === '.obsidian') {
      d('skipping .obsidian path: %s', relativePath)
      continue
    }

    const fullPath = join(rootDir, relativePath)
    const filename = basename(relativePath)
    const title = basename(filename, '.md')
    d('processing file: %s (title: %s)', relativePath, title)

    // Try to extract date from filename, fall back to file mtime
    let memoryCreatedAt: DateTime
    const filenameDate = extractDateFromFilename(filename)

    if (filenameDate) {
      memoryCreatedAt = filenameDate
    } else {
      const fileStat = await stat(fullPath)
      // Convert JS Date to Luxon DateTime, preserving local timezone
      memoryCreatedAt = DateTime.fromJSDate(fileStat.mtime)
      d(
        'using file mtime for %s: %s (timezone: %s)',
        filename,
        memoryCreatedAt.toISO(),
        memoryCreatedAt.zoneName
      )
    }

    // Read the file content
    const content = await Bun.file(fullPath).text()
    d('read %d bytes from %s', content.length, relativePath)

    memories.push({
      source: 'obsidian',
      memoryCreatedAt,
      title,
      metadata: {
        originalPath: relativePath,
      },
      content,
    })
  }

  d('import complete, found %d notes', memories.length)
  return memories
}
