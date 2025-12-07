import { describe, expect, test } from 'bun:test'
import { importDaylioBackup } from './daylio-import'

const DAYLIO_BACKUP_PATH = process.env['DAYLIO_TEST_BACKUP_PATH']

describe('importDaylioBackup', () => {
  test.skipIf(!DAYLIO_BACKUP_PATH)(
    'imports entries from Daylio backup',
    async () => {
      const memories = await importDaylioBackup(DAYLIO_BACKUP_PATH!)

      expect(memories.length).toBeGreaterThan(0)

      // Verify each memory has required fields
      for (const memory of memories) {
        expect(memory.source).toBe('daylio')
        expect(memory.title).toMatch(/^Daylio: \d{4}-\d{2}-\d{2}$/)
        expect(memory.memoryCreatedAt).toBeTruthy()
        expect(memory.content).toBeDefined()
        expect(memory.metadata).toBeDefined()
        expect(memory.metadata?.['dayKey']).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(memory.metadata?.['entryCount']).toBeTruthy()
      }

      // Check that content is formatted correctly
      const firstMemory = memories[0]
      expect(firstMemory).toBeDefined()
      expect(firstMemory?.content).toBeTruthy()

      // Content should have mood names like "Rad:", "Good:", "Meh:", etc.
      const moodPattern = /(Rad|Good|Meh|Bad|Awful|Unknown):/
      expect(firstMemory?.content).toMatch(moodPattern)
    }
  )

  test.skipIf(!DAYLIO_BACKUP_PATH)(
    'groups multiple entries on same day',
    async () => {
      const memories = await importDaylioBackup(DAYLIO_BACKUP_PATH!)

      // Find a memory with multiple entries
      const multiEntryMemory = memories.find(
        (m) => Number(m.metadata?.['entryCount']) > 1
      )

      if (multiEntryMemory) {
        // Should have multiple lines
        const lines = multiEntryMemory.content?.split('\n') ?? []
        expect(lines.length).toBeGreaterThan(1)
      }
    }
  )

  test.skipIf(!DAYLIO_BACKUP_PATH)('memories are sorted by date', async () => {
    const memories = await importDaylioBackup(DAYLIO_BACKUP_PATH!)

    // Verify memories are sorted oldest first
    for (let i = 1; i < memories.length; i++) {
      const prevMemory = memories[i - 1]
      const currMemory = memories[i]
      expect(prevMemory).toBeDefined()
      expect(currMemory).toBeDefined()
      const prevDate = prevMemory!.memoryCreatedAt
      const currDate = currMemory!.memoryCreatedAt
      expect(prevDate.toMillis()).toBeLessThanOrEqual(currDate.toMillis())
    }
  })
})
