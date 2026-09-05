'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function SetPasswordPage() {
  return <Suspense><SetPassword /></Suspense>
}

function SetPassword() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  // The invite/recovery link lands here with the session in the URL (hash or
  // ?code=). Pick it up so updateUser can set the new password.
  useEffect(() => {
    const supabase = createClient()
    const init = async () => {
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      if (code) { try { await supabase.auth.exchangeCodeForSession(code) } catch { /* ignore */ } }
      const { data } = await supabase.auth.getSession()
      setHasSession(!!data.session)
      setReady(true)
    }
    init()
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (pw !== pw2) { toast.error('Passwords do not match'); return }
    setBusy(true)
    const { error } = await createClient().auth.updateUser({ password: pw })
    if (error) { toast.error(error.message); setBusy(false); return }
    toast.success('Password set — you\'re in')
    router.replace('/')
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Set your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a password to access your workspace.</p>
        </div>
        {!ready ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !hasSession ? (
          <div className="surface p-5 text-center text-sm text-muted-foreground">
            This invite link is invalid or expired. Ask your admin to re-invite you, or
            <a href="/login" className="ml-1 text-primary hover:underline">sign in</a>.
          </div>
        ) : (
          <form onSubmit={submit} className="surface space-y-4 p-5">
            <div className="space-y-2">
              <Label htmlFor="pw">New password</Label>
              <Input id="pw" type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pw2">Confirm password</Label>
              <Input id="pw2" type="password" required minLength={6} value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={busy} className="w-full">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Set password & continue</Button>
          </form>
        )}
      </div>
    </div>
  )
}
