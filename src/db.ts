import createDebug from 'debug'
import type { Kysely } from 'kysely'
import type { DatabaseSchema, NewMemory } from './types'

const d = createDebug('istoria:db')

export async function importData(
  db: Kysely<DatabaseSchema>,
  data: NewMemory[]
) {
  d('importing %d records to memory table', data.length)
  await db.insertInto('memory').values(data).execute()
  d('import completed')
}
