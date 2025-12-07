import { Database } from 'bun:sqlite'
import createDebug from 'debug'
import type { Generated, Insertable, Selectable } from 'kysely'
import { Kysely, Migrator } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-sqlite'
import { SerializePlugin } from 'kysely-plugin-serialize'
import { DateTime } from 'luxon'
import { migrator } from './migrations/this-sucks'

const d = createDebug('istoria:types')

type Timestamp = DateTime

interface MemoryTable {
  id: Generated<string>
  source: string
  createdAt: Generated<Timestamp>
  memoryCreatedAt: Timestamp
  title: string
  metadata: Record<string, string>
  content?: string
  contentBlob?: Uint8Array
}

export type Memory = Selectable<MemoryTable>
export type NewMemory = Insertable<MemoryTable>

export interface DatabaseSchema {
  memory: MemoryTable
}

export async function createDatabase(
  path: string
): Promise<[Kysely<DatabaseSchema>, () => Promise<void>]> {
  d('creating database at: %s', path)
  const sqlite = new Database(path)
  const db = new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({ database: sqlite }),
    plugins: [
      new SerializePlugin({
        serializer: luxonSerializer,
        deserializer: luxonDeserializer,
      }),
    ],
  })
  d('kysely instance created')

  d('running migrations')
  const m = new Migrator({ db, provider: migrator })
  const { error, results } = await m.migrateToLatest()
  if (results?.length) {
    d(
      'migrations executed: %O',
      results.map((r) => ({ name: r.migrationName, status: r.status }))
    )
  }
  if (error) {
    d('migration error: %O', error)
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error(`Failed to migrate database: ${error}`)
    }
  }
  d('migrations complete')

  return [
    db,
    async () => {
      d('running WAL checkpoint')
      sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)')
      d('destroying kysely instance')
      await db.destroy()
      d('closing sqlite database')
      sqlite.close()
      d('database closed')
    },
  ]
}

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/

/**
 * Custom serializer for kysely-plugin-serialize that handles:
 * - Luxon DateTime objects (to ISO strings)
 * - JSON objects (to JSON strings)
 * - Uint8Array (passed through as-is)
 */
function luxonSerializer(value: unknown): unknown {
  // Handle Luxon DateTime - convert to ISO string
  if (DateTime.isDateTime(value)) {
    return value.toISO()
  }
  // Uint8Array passes through (SQLite handles blobs)
  if (value instanceof Uint8Array) {
    return value
  }
  // Handle plain objects - convert to JSON (but not arrays, handled separately)
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(value)
  }
  return value
}

/**
 * Custom deserializer that handles:
 * - ISO date strings (to Luxon DateTime)
 * - JSON strings (to objects)
 */
function luxonDeserializer(value: unknown): unknown {
  if (typeof value === 'string') {
    // Check if it looks like an ISO date string
    if (ISO_DATE_REGEX.test(value)) {
      const dt = DateTime.fromISO(value)
      if (dt.isValid) {
        return dt
      }
    }
    // Check if it looks like JSON
    if (
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'))
    ) {
      try {
        return JSON.parse(value)
      } catch {
        return value
      }
    }
  }
  return value
}
