import { Database } from 'bun:sqlite'
import createDebug from 'debug'
import type { Generated, Insertable, Selectable } from 'kysely'
import { Kysely, Migrator } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-sqlite'
import { SerializePlugin } from 'kysely-plugin-serialize'
import { migrator } from './migrations/this-sucks'

const d = createDebug('istoria:types')

type Timestamp = string

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
    plugins: [new SerializePlugin()],
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
