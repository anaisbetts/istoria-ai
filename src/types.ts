import { Database } from 'bun:sqlite'
import type { Generated, Insertable, Selectable } from 'kysely'
import { Kysely, Migrator } from 'kysely'
import { BunSqliteDialect } from 'kysely-bun-sqlite'
import { SerializePlugin } from 'kysely-plugin-serialize'
import { migrator } from './migrations/this-sucks'

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
  const sqlite = new Database(path)
  const db = new Kysely<DatabaseSchema>({
    dialect: new BunSqliteDialect({ database: sqlite }),
    plugins: [new SerializePlugin()],
  })

  const m = new Migrator({ db, provider: migrator })
  const { error } = await m.migrateToLatest()
  if (error) {
    if (error instanceof Error) {
      throw error
    } else {
      throw new Error(`Failed to migrate database: ${error}`)
    }
  }

  return [
    db,
    async () => {
      sqlite.run('PRAGMA wal_checkpoint(TRUNCATE)')
      await db.destroy()
      sqlite.close()
    },
  ]
}
