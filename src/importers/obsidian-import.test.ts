import { describe, expect, test } from 'bun:test'
import { importObsidianNotes } from './obsidian-import'

const OBSIDIAN_VAULT_PATH = process.env['OBSIDIAN_TEST_VAULT_PATH']

describe('importObsidianNotes', () => {
  test.skipIf(!OBSIDIAN_VAULT_PATH)(
    'imports notes from Obsidian vault',
    async () => {
      const memories = await importObsidianNotes(OBSIDIAN_VAULT_PATH!)

      expect(memories.length).toBeGreaterThan(0)

      // Verify each memory has required fields
      for (const memory of memories) {
        expect(memory.source).toBe('obsidian')
        expect(memory.title).toBeTruthy()
        expect(memory.memoryCreatedAt).toBeTruthy()
        expect(memory.content).toBeDefined()
      }
    }
  )
})
