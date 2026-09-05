import { handle } from '@/lib/route'
import { getDashboard } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(ctx => getDashboard(ctx.db, ctx.profile))
