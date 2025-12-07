import createDebug from 'debug'
import JSZip from 'jszip'
import { DateTime } from 'luxon'
import type { NewMemory } from '../types'

const d = createDebug('istoria:daylio')

// Predefined mood names by predefined_name_id
const PREDEFINED_MOOD_NAMES: Record<number, string> = {
  1: 'Rad',
  2: 'Good',
  3: 'Meh',
  4: 'Bad',
  5: 'Awful',
}

interface DaylioMood {
  id: number
  custom_name: string
  predefined_name_id: number
}

interface DaylioTag {
  id: number
  name: string
}

interface DaylioEntry {
  id: number
  day: number
  month: number // 0-indexed in Daylio
  year: number
  hour: number
  minute: number
  datetime: number // ms timestamp
  timeZoneOffset: number // ms offset
  mood: number // references customMoods.id
  note: string
  tags: number[] // references tags[].id
}

interface DaylioBackup {
  customMoods: DaylioMood[]
  tags: DaylioTag[]
  dayEntries: DaylioEntry[]
}

/**
 * Gets the mood name for a mood ID using the lookup tables.
 * Prefers custom_name if set, otherwise uses predefined mood name.
 */
function getMoodName(
  moodId: number,
  moodLookup: Map<number, DaylioMood>
): string {
  const mood = moodLookup.get(moodId)
  if (!mood) {
    d('unknown mood id: %d', moodId)
    return 'Unknown'
  }

  if (mood.custom_name && mood.custom_name.trim()) {
    return mood.custom_name
  }

  return PREDEFINED_MOOD_NAMES[mood.predefined_name_id] ?? 'Unknown'
}

/**
 * Formats a single day entry as a line of text.
 * Format: [MoodName]: [note] (tag1, tag2, ...)
 */
function formatEntry(
  entry: DaylioEntry,
  moodLookup: Map<number, DaylioMood>,
  tagLookup: Map<number, string>
): string {
  const moodName = getMoodName(entry.mood, moodLookup)
  const tagNames = entry.tags
    .map((tagId) => tagLookup.get(tagId))
    .filter((name): name is string => name !== undefined)

  let line = `${moodName}: ${entry.note || ''}`
  if (tagNames.length > 0) {
    line += ` (${tagNames.join(', ')})`
  }

  return line.trim()
}

/**
 * Parses the base64-decoded JSON content from a Daylio backup.
 */
function parseDaylioJson(jsonContent: string): DaylioBackup {
  const data = JSON.parse(jsonContent)

  if (!Array.isArray(data.dayEntries)) {
    throw new Error('Invalid Daylio backup: missing dayEntries array')
  }

  return data as DaylioBackup
}

/**
 * Extracts and decodes the backup.daylio file from a .daylio ZIP archive.
 */
async function extractDaylioBackup(zipBuffer: ArrayBuffer): Promise<string> {
  d('loading zip file')
  const zip = await JSZip.loadAsync(zipBuffer)

  const backupFile = zip.file('backup.daylio')
  if (!backupFile) {
    throw new Error(
      'Invalid Daylio backup: missing backup.daylio file in archive'
    )
  }

  d('extracting backup.daylio')
  const base64Content = await backupFile.async('string')

  d('base64 decoding content (%d chars)', base64Content.length)
  const jsonContent = atob(base64Content)

  return jsonContent
}

/**
 * Imports Daylio entries from a .daylio backup file.
 *
 * The .daylio file is a ZIP archive containing a base64-encoded JSON file.
 * Entries are grouped by day, with all moods for that day combined into
 * a single Memory record.
 *
 * Output format for each entry line:
 * [MoodName]: [note] (tag1, tag2, ...)
 */
export async function importDaylioBackup(
  filePath: string
): Promise<NewMemory[]> {
  d('starting import from file: %s', filePath)

  // Read the .daylio file (it's a ZIP)
  const file = Bun.file(filePath)
  const zipBuffer = await file.arrayBuffer()
  d('read %d bytes from file', zipBuffer.byteLength)

  // Extract and decode the backup
  const jsonContent = await extractDaylioBackup(zipBuffer)
  const backup = parseDaylioJson(jsonContent)

  d(
    'parsed backup: %d moods, %d tags, %d entries',
    backup.customMoods.length,
    backup.tags.length,
    backup.dayEntries.length
  )

  // Build lookup tables
  const moodLookup = new Map<number, DaylioMood>()
  for (const mood of backup.customMoods) {
    moodLookup.set(mood.id, mood)
  }

  const tagLookup = new Map<number, string>()
  for (const tag of backup.tags) {
    tagLookup.set(tag.id, tag.name)
  }

  // Group entries by day (year-month-day)
  const entriesByDay = new Map<string, DaylioEntry[]>()
  for (const entry of backup.dayEntries) {
    // Daylio months are 0-indexed, so add 1 for display
    const dayKey = `${entry.year}-${String(entry.month + 1).padStart(2, '0')}-${String(entry.day).padStart(2, '0')}`
    const existing = entriesByDay.get(dayKey) ?? []
    existing.push(entry)
    entriesByDay.set(dayKey, existing)
  }

  d('grouped entries into %d days', entriesByDay.size)

  // Create memories for each day
  const memories: NewMemory[] = []

  for (const [dayKey, entries] of entriesByDay) {
    // Sort entries by time within the day (earliest first)
    entries.sort((a, b) => {
      const timeA = a.hour * 60 + a.minute
      const timeB = b.hour * 60 + b.minute
      return timeA - timeB
    })

    // Format each entry as a line
    const lines = entries.map((entry) =>
      formatEntry(entry, moodLookup, tagLookup)
    )
    const content = lines.join('\n')

    // Use the earliest entry's timestamp for the memory date
    const firstEntry = entries[0]
    if (!firstEntry) {
      continue // Skip empty entry arrays (shouldn't happen)
    }

    // Use the datetime timestamp directly and set the timezone
    // Daylio stores offset in ms (e.g., +01:00 = 3600000ms)
    const offsetMinutes = Math.round(firstEntry.timeZoneOffset / 60000)
    const memoryCreatedAt = DateTime.fromMillis(firstEntry.datetime, {
      zone: `UTC${offsetMinutes >= 0 ? '+' : ''}${offsetMinutes / 60}`,
    })

    d('created memory for %s: %d entries', dayKey, entries.length)

    memories.push({
      source: 'daylio',
      memoryCreatedAt,
      title: `Daylio: ${dayKey}`,
      metadata: {
        entryCount: String(entries.length),
        dayKey,
      },
      content,
    })
  }

  // Sort memories by date (oldest first)
  memories.sort((a, b) => {
    const dateA = a.memoryCreatedAt as DateTime
    const dateB = b.memoryCreatedAt as DateTime
    return dateA.toMillis() - dateB.toMillis()
  })

  d('import complete, created %d memories', memories.length)
  return memories
}
