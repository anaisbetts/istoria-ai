import type { Kysely } from 'kysely'
import { sql } from 'kysely'

export async function up(db: Kysely<unknown>): Promise<void> {
  // SQLite PRAGMAs for desktop application performance
  // These need to be run before any other operations

  // WAL mode provides better concurrent access and crash recovery
  await sql`PRAGMA journal_mode = WAL`.execute(db)

  // NORMAL synchronous is a good balance between safety and speed
  // (FULL is safest but slower, OFF is fastest but risks corruption on power loss)
  await sql`PRAGMA synchronous = NORMAL`.execute(db)

  // 64MB cache size (negative value = KB)
  await sql`PRAGMA cache_size = -64000`.execute(db)

  // Store temporary tables and indices in memory
  await sql`PRAGMA temp_store = MEMORY`.execute(db)

  // Enable memory-mapped I/O (256MB)
  await sql`PRAGMA mmap_size = 268435456`.execute(db)

  // Wait up to 5 seconds if database is locked
  await sql`PRAGMA busy_timeout = 5000`.execute(db)

  // Enable foreign key constraints
  await sql`PRAGMA foreign_keys = ON`.execute(db)

  // Create the memory table
  await db.schema
    .createTable('memory')
    .addColumn('id', 'text', (col) =>
      col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`)
    )
    .addColumn('source', 'text', (col) => col.notNull())
    .addColumn('title', 'text', (col) => col.notNull())
    .addColumn('metadata', 'json', (col) => col.notNull().defaultTo(sql`'{}'`))
    .addColumn('createdAt', 'text', (col) =>
      col.notNull().defaultTo(sql`(datetime('now'))`)
    )
    .addColumn('memoryCreatedAt', 'text', (col) => col.notNull())
    .addColumn('content', 'text')
    .addColumn('contentBlob', 'blob')
    .execute()

  // Add an index on source for faster lookups
  await db.schema
    .createIndex('idx_memory_source')
    .on('memory')
    .column('source')
    .execute()

  // Add an index on createdAt for time-based queries
  await db.schema
    .createIndex('idx_memory_createdAt')
    .on('memory')
    .column('createdAt')
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable('memory').execute()
}
