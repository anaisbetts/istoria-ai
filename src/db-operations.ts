import createDebug from 'debug'
import type { Kysely } from 'kysely'
import type { DatabaseSchema, Memory, NewMemory } from './types'

const d = createDebug('istoria:db')

export async function importData(
  db: Kysely<DatabaseSchema>,
  data: NewMemory[]
) {
  d('importing %d records to memory table', data.length)
  await db.insertInto('memory').values(data).execute()
  d('import completed')
}

export async function getAllMemories(
  db: Kysely<DatabaseSchema>
): Promise<Memory[]> {
  d('fetching all memories ordered by memoryCreatedAt')
  const memories = await db
    .selectFrom('memory')
    .selectAll()
    .orderBy('memoryCreatedAt', 'asc')
    .execute()
  d('fetched %d memories', memories.length)
  return memories
}
