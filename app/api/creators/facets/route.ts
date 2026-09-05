import { handle } from '@/lib/route'
import { getCreatorFacets } from '@/lib/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = () => handle(ctx => getCreatorFacets(ctx.db, ctx.profile))
