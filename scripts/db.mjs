// Shared DB connection helper for migration/seed scripts.
// Resolves a working Supabase pooler connection (region auto-probed once,
// then cached in .env.local as SUPABASE_DB_HOST).
import pg from 'pg'
import fs from 'node:fs'
import path from 'node:path'

const ENV_PATH = path.join(process.cwd(), '.env.local')
const PROJECT_REF = 'vyhkitdimdwifhtpiiqm'

export function readEnv() {
  const out = {}
  if (fs.existsSync(ENV_PATH)) {
    for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m) out[m[1]] = m[2]
    }
  }
  return out
}

const REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-central-2', 'eu-north-1',
  'ap-southeast-1', 'ap-southeast-2', 'ap-south-1', 'ap-northeast-1', 'ap-northeast-2',
  'ca-central-1', 'sa-east-1',
]

function hostsToTry(env) {
  if (env.SUPABASE_DB_HOST) return [env.SUPABASE_DB_HOST]
  const hosts = []
  for (const prefix of ['aws-1', 'aws-0']) {
    for (const r of REGIONS) hosts.push(`${prefix}-${r}.pooler.supabase.com`)
  }
  return hosts
}

function makeClient(host, password) {
  return new pg.Client({
    host,
    port: 5432, // session mode — required for DDL / multi-statement
    user: `postgres.${PROJECT_REF}`,
    password,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 6000,
    statement_timeout: 120000,
  })
}

// Returns a connected pg.Client, probing regions if host not yet cached.
export async function connect() {
  const env = readEnv()
  const password = env.SUPABASE_DB_PASSWORD
  if (!password) throw new Error('SUPABASE_DB_PASSWORD missing from .env.local')

  for (const host of hostsToTry(env)) {
    const client = makeClient(host, password)
    try {
      await client.connect()
      await client.query('select 1')
      // Cache the working host for future runs.
      if (!env.SUPABASE_DB_HOST) {
        fs.appendFileSync(ENV_PATH, `\n# Pooler host (auto-detected region)\nSUPABASE_DB_HOST=${host}\n`)
      }
      console.error(`[db] connected via ${host}`)
      return client
    } catch (e) {
      const msg = String(e.message || e)
      // Wrong region → DNS/connect error; keep trying. Auth error → password issue, stop.
      if (/password authentication failed|Tenant or user not found/i.test(msg)) {
        await client.end().catch(() => {})
        throw new Error(`auth failed on ${host}: ${msg}`)
      }
      await client.end().catch(() => {})
    }
  }
  throw new Error('could not connect to any Supabase pooler region')
}
