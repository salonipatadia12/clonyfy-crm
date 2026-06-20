'use client'

import { useState } from 'react'
import { useMembers, useInviteMember, useRemoveMember, useAnalytics, useSetMemberGoal } from '@/lib/api'
import { useIsAdmin } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Modal } from '@/components/ui/modal'
import { UserPlus, Trash2, Copy, ShieldCheck, Check, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDistanceToNow } from 'date-fns'
import { toast } from 'sonner'

export default function TeamPage() {
  const isAdmin = useIsAdmin()
  const { data, isLoading } = useMembers()
  const { data: analytics } = useAnalytics()
  const invite = useInviteMember()
  const remove = useRemoveMember()
  const setGoal = useSetMemberGoal()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [invited, setInvited] = useState<{ email: string; pw: string | null; link: string | null } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkGoal, setBulkGoal] = useState('')

  if (!isAdmin) {
    return <div className="glass rounded-2xl p-10 text-center text-sm text-muted-foreground">This page is for admins only.</div>
  }

  const members = data?.members ?? []
  const reassignments = data?.reassignments ?? []
  const statById = new Map((analytics?.members ?? []).map(m => [m.id, m]))
  // Only non-admin members are selectable (goals + removal apply to reps).
  const selectableMembers = members.filter(m => m.role !== 'admin')
  const allSelected = selectableMembers.length > 0 && selectableMembers.every(m => selected.has(m.id))
  const toggleAll = () => {
    const next = new Set(selected)
    if (allSelected) selectableMembers.forEach(m => next.delete(m.id)); else selectableMembers.forEach(m => next.add(m.id))
    setSelected(next)
  }
  const toggleRow = (id: string) => setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const applyBulkGoal = async () => {
    const goal = Number(bulkGoal)
    const ids = [...selected]
    if (!ids.length || !Number.isFinite(goal)) return
    await Promise.all(ids.map(id => setGoal.mutateAsync({ id, goal }).catch(() => null)))
    toast.success(`Set goal ${goal} for ${ids.length} member${ids.length > 1 ? 's' : ''}`); setSelected(new Set()); setBulkGoal('')
  }
  const applyBulkRemove = async () => {
    const ids = [...selected]
    if (!ids.length) return
    if (!window.confirm(`Remove ${ids.length} member${ids.length > 1 ? 's' : ''}? Their pipelines move to you.`)) return
    await Promise.all(ids.map(id => remove.mutateAsync(id).catch(() => null)))
    toast.success(`Removed ${ids.length} member${ids.length > 1 ? 's' : ''}`); setSelected(new Set())
  }

  const submit = () => {
    if (!name.trim() || !email.trim()) { toast.error('Name and email required'); return }
    invite.mutate({ name, email, role }, {
      onSuccess: (r) => {
        setOpen(false); setName(''); setEmail(''); setRole('member')
        if (r.inviteLink || r.tempPassword) setInvited({ email: r.email, pw: r.tempPassword, link: r.inviteLink })
        else toast.success('Member added (existing account linked)')
      },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Invite failed'),
    })
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Team</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage members, assignments, and the reassignment log.</p>
        </div>
        <Button onClick={() => setOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Add member</Button>
      </header>

      {selected.size > 0 && (
        <div className="glass-strong flex flex-wrap items-center gap-3 rounded-xl border-primary/30 p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex items-center gap-1.5">
            <Target className="h-4 w-4 text-muted-foreground" />
            <Input value={bulkGoal} onChange={(e) => setBulkGoal(e.target.value)} type="number" min={0} placeholder="Monthly goal" className="h-9 w-32" />
            <Button size="sm" onClick={applyBulkGoal} disabled={!bulkGoal || setGoal.isPending}>Set goal</Button>
          </div>
          <Button size="sm" variant="ghost" onClick={applyBulkRemove} disabled={remove.isPending} className="border border-rose-500/30 text-rose-400 hover:bg-rose-500/10"><Trash2 className="mr-1 h-4 w-4" /> Remove</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="glass overflow-hidden rounded-2xl">
        {isLoading ? <Skeleton className="h-48 w-full" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-4 py-3">
                  <button onClick={toggleAll} title="Select all members"
                    className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors', allSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
                    {allSelected && <Check className="h-3 w-3" />}
                  </button>
                </th>
                <th className="px-4 py-3">Member</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3 text-right">Assigned</th>
                <th className="px-3 py-3 text-right">Contacted</th>
                <th className="px-3 py-3 text-right">Responded</th>
                <th className="px-3 py-3 text-right">Videos</th>
                <th className="px-3 py-3 text-center">Monthly goal</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => {
                const s = statById.get(m.id)
                return (
                  <tr key={m.id} className={cn('border-b border-border/40 hover:bg-muted/30', selected.has(m.id) && 'bg-primary/5')}>
                    <td className="px-4 py-3">
                      {m.role !== 'admin' && (
                        <button onClick={() => toggleRow(m.id)} title="Select"
                          className={cn('flex h-4 w-4 items-center justify-center rounded border transition-colors', selected.has(m.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:border-primary/50')}>
                          {selected.has(m.id) && <Check className="h-3 w-3" />}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={m.name} size={34} />
                        <div className="min-w-0"><p className="truncate font-medium">{m.name}</p><p className="text-xs text-muted-foreground">{m.email}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.role === 'admin' ? 'bg-violet-500/15 text-violet-300' : 'bg-muted text-muted-foreground'}`}>
                        {m.role === 'admin' && <ShieldCheck className="h-3 w-3" />}{m.role}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{m.invite_accepted ? 'Active' : 'Invited'}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s?.assigned ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s?.contacted ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s?.responded ?? 0}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{s?.videos ?? 0}</td>
                    <td className="px-3 py-3"><GoalCell memberId={m.id} goal={s?.monthly_goal ?? 0} done={s?.advancedThisMonth ?? 0} /></td>
                    <td className="px-3 py-3 text-right">
                      {m.role !== 'admin' && (
                        <button onClick={() => { if (confirm(`Remove ${m.name}? Their pipeline moves to you.`)) remove.mutate(m.id, { onSuccess: () => toast.success('Member removed') }) }}
                          className="rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400" title="Remove member">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="glass rounded-2xl p-6">
        <h2 className="mb-1 text-base font-semibold">Reassignment Log</h2>
        <p className="mb-4 text-xs text-muted-foreground">Every pipeline reassignment, audited.</p>
        {reassignments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">No reassignments yet.</p>
        ) : (
          <div className="space-y-2">
            {reassignments.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-border/50 bg-card/40 px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">{r.admin_name}</span> moved <span className="font-medium">@{r.profile_handle}</span>
                  {r.from_user_name ? <> from {r.from_user_name}</> : null} → <span className="font-medium">{r.to_user_name}</span>
                  {r.reason ? <span className="text-muted-foreground"> · {r.reason}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Add team member" description="They'll get a temporary password to sign in and change.">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" />
          <Select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
            <option value="member">Member</option>
            <option value="admin">Admin (max 2)</option>
          </Select>
          <Button onClick={submit} disabled={invite.isPending} className="w-full">{invite.isPending ? 'Adding…' : 'Add member'}</Button>
        </div>
      </Modal>

      <Modal open={!!invited} onOpenChange={(o) => !o && setInvited(null)} title="Member created" description="Send them the invite link to set their own password.">
        {invited && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 text-sm">
              <p><span className="text-muted-foreground">Email:</span> {invited.email}</p>
            </div>
            {invited.link && (
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Invite link (sets their password)</p>
                <div className="flex gap-2">
                  <Input readOnly value={invited.link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button onClick={() => { navigator.clipboard?.writeText(invited.link!); toast.success('Link copied') }}><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
            {invited.pw && (
              <p className="text-xs text-muted-foreground">Fallback temp password: <span className="font-mono">{invited.pw}</span> (they can change it under Account).</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function GoalCell({ memberId, goal, done }: { memberId: string; goal: number; done: number }) {
  const setGoal = useSetMemberGoal()
  const [val, setVal] = useState(String(goal))
  const pct = goal > 0 ? Math.min(100, (done / goal) * 100) : 0
  const save = () => { const n = Number(val); if (Number.isFinite(n) && n !== goal) setGoal.mutate({ id: memberId, goal: n }, { onSuccess: () => toast.success('Goal set') }) }
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-1">
        <Input value={val} onChange={(e) => setVal(e.target.value)} onBlur={save}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          type="number" min={0} className="h-7 w-16 text-center text-xs" />
      </div>
      {goal > 0 && (
        <div className="w-20">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted/50">
            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-0.5 text-center text-[10px] text-muted-foreground">{done}/{goal} this mo</p>
        </div>
      )}
    </div>
  )
}
