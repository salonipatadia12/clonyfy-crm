/**
 * Removes the rows belonging to a demo run.
 *
 *   npm run demo:reset                 DRY RUN — reports what would be deleted
 *   npm run demo:reset -- --confirm    actually delete
 *   npm run demo:reset -- --confirm --keep-run   delete rows, keep the registry row
 *
 * SAFETY
 *
 *   - Dry run is the DEFAULT. Deleting requires --confirm.
 *   - Every delete is `where demo_run_id = $1`. There is no table-wide delete,
 *     no name matching, no LIKE and no delete without that predicate anywhere in
 *     this file.
 *   - `influencers` is never touched. Deleting a demo run removes the campaign
 *     memberships that pointed at real creators; the creator rows themselves are
 *     left byte-identical, and this script verifies that before and after.
 *   - Deletion walks DEMO_TABLES_DELETE_ORDER child-first, so no foreign key is
 *     ever violated, inside a single transaction.
 */
import {
  open, resolveWorkspace, findRun, countRun, fingerprintProtected,
  DEMO_TABLES_DELETE_ORDER, PROTECTED_TABLES, printTable,
} from './demo-common.mjs'
import { DEMO_LABEL } from './demo-fixture.mjs'

const argv = process.argv.slice(2)
const CONFIRM = argv.includes('--confirm')
const KEEP_RUN = argv.includes('--keep-run')
const wsArg = argv.indexOf('--workspace')
const WANTED_WS = wsArg >= 0 ? argv[wsArg + 1] : null
const labelArg = argv.indexOf('--label')
const LABEL = labelArg >= 0 ? argv[labelArg + 1] : DEMO_LABEL

async function main() {
  const c = await open()
  const { workspace } = await resolveWorkspace(c, WANTED_WS)
  const { run } = await findRun(c, workspace.id, { label: LABEL })

  console.log(`workspace : ${workspace.name} (${workspace.id})`)
  console.log(`run label : ${LABEL}`)
  if (!run) {
    console.log('\nNo demo run with that label in this workspace. Nothing to do.')
    await c.end()
    return
  }
  console.log(`demo run  : ${run.id}`)

  const before = await countRun(c, run.id)
  const total = Object.values(before).reduce((a, b) => a + b, 0)
  printTable(CONFIRM ? 'Deleting' : 'Would delete (dry run)',
    DEMO_TABLES_DELETE_ORDER.map(t => ({ table: t, rows: before[t] })), ['table', 'rows'])
  console.log(`\n  total: ${total} row(s)`)

  const protectedBefore = await fingerprintProtected(c, workspace.id)

  if (!CONFIRM) {
    console.log('\nDRY RUN — nothing was deleted.')
    console.log('Re-run with --confirm to delete these rows.')
    await c.end()
    return
  }

  await c.query('begin')
  const deleted = {}
  try {
    for (const t of DEMO_TABLES_DELETE_ORDER) {
      const r = await c.query(`delete from ${t} where demo_run_id = $1`, [run.id])
      deleted[t] = r.rowCount
    }
    if (!KEEP_RUN) await c.query('delete from demo_runs where id = $1', [run.id])
    await c.query('commit')
  } catch (e) {
    await c.query('rollback')
    console.error('\nFAILED, rolled back: ' + e.message)
    await c.end()
    process.exit(1)
  }

  const protectedAfter = await fingerprintProtected(c, workspace.id)
  const drift = PROTECTED_TABLES.filter(t =>
    JSON.stringify(protectedBefore[t]) !== JSON.stringify(protectedAfter[t]))

  printTable('Deleted', DEMO_TABLES_DELETE_ORDER.map(t => ({ table: t, rows: deleted[t] })), ['table', 'rows'])
  console.log(`\n  total: ${Object.values(deleted).reduce((a, b) => a + b, 0)} row(s) deleted`)
  console.log(`  registry row: ${KEEP_RUN ? 'kept' : 'removed'}`)

  printTable('Protected tables (must be identical)', PROTECTED_TABLES.map(t => ({
    table: t,
    before: protectedBefore[t]?.n ?? protectedBefore[t]?.error ?? '—',
    after: protectedAfter[t]?.n ?? protectedAfter[t]?.error ?? '—',
    identical: JSON.stringify(protectedBefore[t]) === JSON.stringify(protectedAfter[t]) ? 'yes' : 'NO',
  })), ['table', 'before', 'after', 'identical'])

  if (drift.length) {
    console.error(`\nWARNING: these protected tables changed: ${drift.join(', ')}`)
    await c.end()
    process.exit(1)
  }
  console.log('\nEvery protected table is unchanged.')
  await c.end()
}

main().catch(e => { console.error(e); process.exit(1) })
