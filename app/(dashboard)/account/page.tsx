'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar } from '@/components/ui/avatar'
import { toast } from 'sonner'
import { User, KeyRound } from 'lucide-react'

export default function AccountPage() {
  const profile = useAuth()
  const router = useRouter()
  const [name, setName] = useState(profile.name)
  const [savingName, setSavingName] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [savingPw, setSavingPw] = useState(false)

  const saveName = async () => {
    if (!name.trim()) { toast.error('A display name is required.'); return }
    setSavingName(true)
    try {
      const res = await fetch('/api/account', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name }) })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Display name updated.')
      router.refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'That did not save.') } finally { setSavingName(false) }
  }

  const savePassword = async () => {
    if (pw.length < 6) { toast.error('Choose a password of at least 6 characters.'); return }
    if (pw !== pw2) { toast.error('Those two passwords do not match.'); return }
    setSavingPw(true)
    try {
      const { error } = await createClient().auth.updateUser({ password: pw })
      if (error) throw error
      toast.success('Password updated.')
      setPw(''); setPw2('')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'That did not save.') } finally { setSavingPw(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-4">
        <Avatar name={profile.name} size={56} />
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Account</h1>
          <p className="text-sm text-muted-foreground">{profile.email} · <span className="capitalize">{profile.role}</span></p>
        </div>
      </header>

      <section className="surface space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><User className="h-4 w-4" /> Profile</h2>
        <div className="space-y-2">
          <Label htmlFor="name">Display name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button onClick={saveName} disabled={savingName || name === profile.name}>{savingName ? 'Saving…' : 'Save name'}</Button>
      </section>

      <section className="surface space-y-4 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Password</h2>
        <p className="text-sm text-muted-foreground">If you signed in with a temporary password, set your own here.</p>
        <div className="space-y-2">
          <Label htmlFor="pw">New password</Label>
          <Input id="pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw2">Confirm password</Label>
          <Input id="pw2" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
        </div>
        <Button onClick={savePassword} disabled={savingPw || !pw}>{savingPw ? 'Updating…' : 'Update password'}</Button>
      </section>
    </div>
  )
}
