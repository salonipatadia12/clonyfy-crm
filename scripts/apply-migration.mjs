// Apply a SQL migration file to the live DB via the session-mode pooler.
// Usage: node scripts/apply-migration.mjs supabase/migrations/0006_deal_signing.sql
import fs from 'node:fs'
import { connect } from './db.mjs'

const file = process.argv[2]
if (!file) { console.error('usage: node scripts/apply-migration.mjs <path-to.sql>'); process.exit(1) }
const sql = fs.readFileSync(file, 'utf8')

const client = await connect()
try {
  await client.query(sql)
  console.error(`[migrate] applied ${file}`)
} catch (e) {
  console.error(`[migrate] FAILED ${file}: ${e.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
