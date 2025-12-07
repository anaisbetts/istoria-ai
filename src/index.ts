import path from 'node:path'
import { createDatabase } from './types'

const [db, close] = await createDatabase(path.join(process.cwd(), 'db.sqlite'))

export async function main(args: string[]): Promise<number> {
  console.log('Database created')
  return 0
}

main(process.argv.slice(2))
  .catch((error) => {
    console.error(error)
    return 1
  })
  .then(async (code) => {
    await close()

    console.log('database closed')
    process.exit(code)
  })
