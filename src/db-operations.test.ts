import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { Kysely } from 'kysely'
import { DateTime } from 'luxon'
import { importData } from './db-operations'
import { createDatabase, type DatabaseSchema, type NewMemory } from './types'

describe('importData', () => {
  let db: Kysely<DatabaseSchema>
  let cleanup: () => Promise<void>

  beforeEach(async () => {
    ;[db, cleanup] = await createDatabase(':memory:')
  })

  afterEach(async () => {
    await cleanup()
  })

  test('imports a single record with Luxon DateTime', async () => {
    const testDate = DateTime.fromISO('2025-09-11T14:30:00', {
      zone: 'America/Los_Angeles',
    })

    const record: NewMemory = {
      source: 'test',
      memoryCreatedAt: testDate,
      title: 'Test Memory',
      metadata: { foo: 'bar' },
      content: 'This is test content',
    }

    await importData(db, [record])

    // Query the data back
    const results = await db.selectFrom('memory').selectAll().execute()

    expect(results).toHaveLength(1)
    const result = results[0]!
    expect(result.source).toBe('test')
    expect(result.title).toBe('Test Memory')
    expect(result.content).toBe('This is test content')
    expect(result.metadata).toEqual({ foo: 'bar' })

    // Verify the DateTime was serialized and deserialized correctly
    // Note: The exact timezone offset may not be preserved (ISO strings store offset, not zone name)
    // but the instant in time should be identical
    const memoryCreatedAt = result.memoryCreatedAt as DateTime
    expect(DateTime.isDateTime(memoryCreatedAt)).toBe(true)
    expect(memoryCreatedAt.toMillis()).toBe(testDate.toMillis())
  })

  test('imports multiple records', async () => {
    const records: NewMemory[] = [
      {
        source: 'test',
        memoryCreatedAt: DateTime.fromISO('2025-01-01'),
        title: 'First',
        metadata: {},
        content: 'Content 1',
      },
      {
        source: 'test',
        memoryCreatedAt: DateTime.fromISO('2025-06-15'),
        title: 'Second',
        metadata: {},
        content: 'Content 2',
      },
    ]

    await importData(db, records)

    const results = await db.selectFrom('memory').selectAll().execute()
    expect(results).toHaveLength(2)
  })
})
