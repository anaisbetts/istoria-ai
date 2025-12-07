import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { program } from 'commander'
import createDebug from 'debug'
import { importData } from './db-operations'
import { importDaylioBackup } from './importers/daylio-import'
import { importObsidianNotes } from './importers/obsidian-import'
import { createDatabase } from './types'

const d = createDebug('istoria:main')

interface Options {
  outDir: string
  obsidian?: string
  daylio?: string
}

program
  .name('istoria')
  .description('Import and process memory data')
  .option('-o, --out-dir <path>', 'Output directory for the database', 'out')
  .option('--obsidian <path>', 'Path to Obsidian vault to import')
  .option('--daylio <path>', 'Path to Daylio backup file (.daylio) to import')

program.parse()

const options = program.opts<Options>()
d('parsed options: %O', options)

await mkdir(options.outDir, { recursive: true })
d('created output directory: %s', options.outDir)

const dbPath = path.join(options.outDir, 'db.sqlite')
d('opening database at: %s', dbPath)
const [db, close] = await createDatabase(dbPath)
d('database opened successfully')

export async function main(): Promise<number> {
  if (options.obsidian) {
    d('importing from Obsidian vault: %s', options.obsidian)
    const data = await importObsidianNotes(options.obsidian)
    d('imported %d notes from Obsidian', data.length)

    await importData(db, data)
    d('data imported to database')
  }

  if (options.daylio) {
    d('importing from Daylio backup: %s', options.daylio)
    const data = await importDaylioBackup(options.daylio)
    d('imported %d days from Daylio', data.length)

    await importData(db, data)
    d('data imported to database')
  }

  d('main completed successfully')
  return 0
}

main()
  .catch((error) => {
    d('fatal error: %O', error)
    console.error(error)
    return 1
  })
  .then(async (code) => {
    d('closing database')
    await close()

    d('database closed, exiting with code %d', code)
    process.exit(code)
  })
