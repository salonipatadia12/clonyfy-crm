import 'server-only'
import { NextResponse } from 'next/server'
import { requireCtx } from '@/lib/data'

export type Ctx = NonNullable<Awaited<ReturnType<typeof requireCtx>>>

/**
 * Wraps a route handler with session resolution and error translation.
 *
 * Errors thrown by the data layer are user-facing sentences ("Only an admin can
 * create campaigns."), so they are returned verbatim rather than replaced with
 * "Something went wrong" — the UI renders them in its error state.
 */
export async function handle<T>(fn: (ctx: Ctx) => Promise<T>): Promise<NextResponse> {
  const ctx = await requireCtx()
  if (!ctx) return NextResponse.json({ error: 'You are not signed in.' }, { status: 401 })
  try {
    return NextResponse.json(await fn(ctx))
  } catch (e) {
    const message = e instanceof Error ? e.message : 'That request could not be completed.'
    const status = /only an admin|owned by another/i.test(message) ? 403
      : /not found|does not exist/i.test(message) ? 404
      : 400
    return NextResponse.json({ error: message }, { status })
  }
}

/** Reads a JSON body, tolerating an empty one. */
export async function body(req: Request): Promise<Record<string, unknown>> {
  try { return (await req.json()) as Record<string, unknown> } catch { return {} }
}

export const num = (v: string | null): number | undefined =>
  v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v)
