import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import createDebug from 'debug'
import type { Kysely } from 'kysely'
import { DateTime } from 'luxon'
import { getAllMemories } from '../db-operations'
import type { DatabaseSchema, Memory } from '../types'

const d = createDebug('istoria:notebooklm')

export type ExportInterval = 'month' | 'year'

/**
 * Serialize a memory to a compact text format.
 * Excludes id and source to minimize size.
 */
function serializeMemory(memory: Memory): string {
  const time = (memory.memoryCreatedAt as DateTime).toFormat('HH:mm')
  const lines: string[] = []

  lines.push(`## ${memory.title}`)
  lines.push(`Time: ${time}`)

  if (memory.content) {
    lines.push(memory.content)
  }

  return lines.join('\n')
}

/**
 * Format all memories for a single day wrapped in <date> tags.
 */
function formatDay(dateStr: string, memories: Memory[]): string {
  const serialized = memories.map(serializeMemory).join('\n\n---\n\n')
  return `<date>${dateStr}</date>\n${serialized}\n`
}

/**
 * Get the file key (filename without extension) for a given date and interval.
 * Returns "March2025" for month interval, "2017" for year interval.
 */
function getFileKey(date: DateTime, interval: ExportInterval): string {
  if (interval === 'year') {
    return date.toFormat('yyyy')
  }
  return date.toFormat('MMMM yyyy').replace(' ', '')
}

/**
 * Get the day key for grouping memories by day.
 */
function getDayKey(date: DateTime): string {
  return date.toFormat('yyyy-MM-dd')
}

/**
 * Export all memories to NotebookLM-compatible text files.
 * Groups memories by day, then writes files per month or year.
 */
export async function exportToNotebookLM(
  db: Kysely<DatabaseSchema>,
  outputDir: string,
  interval: ExportInterval
): Promise<void> {
  d('starting export with interval: %s', interval)

  const memories = await getAllMemories(db)
  d('fetched %d memories for export', memories.length)

  if (memories.length === 0) {
    d('no memories to export')
    return
  }

  // Group memories by day
  const memoriesByDay = new Map<string, Memory[]>()
  for (const memory of memories) {
    const dayKey = getDayKey(memory.memoryCreatedAt as DateTime)
    const existing = memoriesByDay.get(dayKey) ?? []
    existing.push(memory)
    memoriesByDay.set(dayKey, existing)
  }
  d('grouped memories into %d days', memoriesByDay.size)

  // Group days by file (month or year)
  const daysByFile = new Map<string, Map<string, Memory[]>>()
  for (const [dayKey, dayMemories] of memoriesByDay) {
    const date = DateTime.fromISO(dayKey)
    const fileKey = getFileKey(date, interval)

    if (!daysByFile.has(fileKey)) {
      daysByFile.set(fileKey, new Map())
    }
    daysByFile.get(fileKey)!.set(dayKey, dayMemories)
  }
  d('grouped days into %d files', daysByFile.size)

  // Write each file
  for (const [fileKey, days] of daysByFile) {
    // Sort days chronologically
    const sortedDays = [...days.entries()].sort(([a], [b]) =>
      a.localeCompare(b)
    )

    // Format each day
    const content = sortedDays
      .map(([dayKey, dayMemories]) => formatDay(dayKey, dayMemories))
      .join('\n')

    const filePath = path.join(outputDir, `${fileKey}.txt`)
    await writeFile(filePath, content, 'utf-8')
    d('wrote %s with %d days', filePath, sortedDays.length)
  }

  d('export complete')
}
