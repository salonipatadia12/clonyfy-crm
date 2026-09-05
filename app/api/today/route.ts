import { handle } from '@/lib/route'
import { getToday } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(ctx => getToday(ctx.db, ctx.profile))
