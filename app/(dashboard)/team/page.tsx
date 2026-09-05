'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { UserPlus, Trash2, Copy, Check, Target, ShieldCheck } from 'lucide-react'
import { useMembers, useInviteMember, useRemoveMember, useSetMemberGoal } from '@/lib/api'
import { useAnalyticsV2 } from '@/lib/queries'
import { useIsAdmin, useAuth } from '@/lib/auth-context'
import { PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import { EmptyState, Shimmer } from '@/components/ui/states'
import { Table, TableScroll, THead, TH, TR, TD, Checkbox } from '@/components/ui/table'
import { relativeDate } from '@/lib/domain'
import { toggleIn } from '@/lib/utils'

export default function TeamPage() {
  const isAdmin = useIsAdmin()
  const me = useAuth()
  const { data, isLoading } = useMembers()
  const { data: analytics } = useAnalyticsV2({})
  const invite = useInviteMember()
  const remove = useRemoveMember()
  const setGoal = useSetMemberGoal()

  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', role: 'member' as 'member' | 'admin' })
  const [invited, setInvited] = useState<{ email: string; pw: string | null; link: string | null } | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkGoal, setBulkGoal] = useState('')

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader title="Team" />
        <EmptyState icon={ShieldCheck} title="Admins only" description="Ask an admin in this workspace if you need someone added or reassigned." />
      </div>
    )
  }
  if (isLoading) return <div className="space-y-4"><Shimmer className="h-8 w-32" /><Shimmer className="h-64 rounded-xl" /></div>

  const members = data?.members ?? []
  const reassignments = data?.reassignments ?? []
  const workByOwner = new Map((analytics?.byOwner ?? []).map(o => [o.id, o]))
  const selectable = members.filter(m => m.role !== 'admin')
  const allSelected = selectable.length > 0 && selectable.every(m => selected.has(m.id))

  const submit = () => {
    if (!form.name.trim() || !form.email.trim()) { toast.error('Name and email are both required.'); return }
    invite.mutate(form, {
      onSuccess: r => {
        setOpen(false); setForm({ name: '', email: '', role: 'member' })
        if (r.inviteLink || r.tempPassword) setInvited({ email: r.email, pw: r.tempPassword, link: r.inviteLink })
        else toast.success('Member added — their existing account was linked.')
      },
      onError: e => toast.error(e instanceof Error ? e.message : 'Could not invite this person.'),
    })
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        description="Who works this workspace, what they own and how much of it is moving. A workspace allows at most two admins."
        actions={<Button size="sm" onClick={() => setOpen(true)}><UserPlus className="h-3.5 w-3.5" aria-hidden />Invite member</Button>}
      />

      {selected.size > 0 && (
        <div className="surface flex flex-wrap items-end gap-2 p-3">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <Labelled label="Monthly goal" className="w-32">
            <Input inputMode="numeric" value={bulkGoal} onChange={e => setBulkGoal(e.target.value)} />
          </Labelled>
          <Button
            size="sm"
            disabled={!bulkGoal}
            onClick={async () => {
              const goal = Number(bulkGoal)
              if (!Number.isFinite(goal)) return
              await Promise.all([...selected].map(id => setGoal.mutateAsync({ id, goal }).catch(() => null)))
              toast.success(`Goal set for ${selected.size} member${selected.size === 1 ? '' : 's'}.`)
              setSelected(new Set()); setBulkGoal('')
            }}
          >
            <Target className="h-3.5 w-3.5" aria-hidden />Apply goal
          </Button>
          <Button
            size="sm" variant="ghost" className="text-destructive"
            onClick={async () => {
              if (!confirm(`Remove ${selected.size} member(s)? Their campaign creators are reassigned to you.`)) return
              await Promise.all([...selected].map(id => remove.mutateAsync(id).catch(() => null)))
              toast.success('Members removed.'); setSelected(new Set())
            }}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />Remove
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="surface overflow-hidden">
        <TableScroll>
          <Table>
            <THead>
              <tr>
                <TH className="w-9">
                  <Checkbox
                    label="Select all members"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map(m => m.id)))}
                  />
                </TH>
                <TH>Member</TH><TH>Role</TH><TH>Status</TH>
                <TH align="right">Creators owned</TH><TH align="right">Contacted</TH>
                <TH align="right">Replied</TH><TH align="right">Agreed</TH>
                <TH>Last active</TH><TH className="w-16"><span className="sr-only">Actions</span></TH>
              </tr>
            </THead>
            <tbody>
              {members.map(m => {
                const w = workByOwner.get(m.id)
                return (
                  <TR key={m.id}>
                    <TD>
                      {m.role !== 'admin' && (
                        <Checkbox
                          label={`Select ${m.name}`}
                          checked={selected.has(m.id)}
                          onChange={() => setSelected(s => toggleIn(s, m.id))}
                        />
                      )}
                    </TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        <Avatar name={m.name} size={28} />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{m.name}{m.id === me.id && ' (you)'}</span>
                          <span className="block truncate text-2xs text-muted-foreground">{m.email}</span>
                        </span>
                      </span>
                    </TD>
                    <TD><Badge tone={m.role === 'admin' ? 'info' : 'neutral'}>{m.role}</Badge></TD>
                    <TD><Badge tone={m.invite_accepted ? 'success' : 'warning'}>{m.invite_accepted ? 'Active' : 'Invited'}</Badge></TD>
                    <TD align="right" className="tnum">{w?.creators ?? 0}</TD>
                    <TD align="right" className="tnum">{w?.contacted ?? 0}</TD>
                    <TD align="right" className="tnum">{w?.replied ?? 0}</TD>
                    <TD align="right" className="tnum">{w?.agreed ?? 0}</TD>
                    <TD className="text-2xs text-muted-foreground">{relativeDate(m.last_active)}</TD>
                    <TD align="right">
                      {m.id !== me.id && (
                        <Button
                          variant="ghost" size="xs"
                          onClick={() => {
                            if (!confirm(`Remove ${m.name}? Their campaign creators are reassigned to you.`)) return
                            remove.mutate(m.id, { onSuccess: () => toast.success('Member removed.'), onError: e => toast.error(e.message) })
                          }}
                        >
                          <Trash2 className="h-3 w-3" aria-hidden /><span className="sr-only">Remove {m.name}</span>
                        </Button>
                      )}
                    </TD>
                  </TR>
                )
              })}
            </tbody>
          </Table>
        </TableScroll>
      </div>

      {reassignments.length > 0 && (
        <section className="surface p-4">
          <h2 className="section-title mb-2">Recent reassignments</h2>
          <ul className="space-y-1 text-[13px]">
            {reassignments.slice(0, 10).map(r => (
              <li key={r.id} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-muted-foreground">
                  <span className="font-medium text-foreground">{r.admin_name ?? 'An admin'}</span> moved @{r.profile_handle}
                  {r.from_user_name && ` from ${r.from_user_name}`} to {r.to_user_name ?? 'a member'}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">{relativeDate(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={open} onOpenChange={setOpen}
        title="Invite a team member"
        description="Creates their account and returns a one-click link they can use to set their own password."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={invite.isPending}>{invite.isPending ? 'Inviting…' : 'Send invite'}</Button>
          </>
        }
      >
        <div className="grid gap-3">
          <Labelled label="Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Labelled>
          <Labelled label="Email" required><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Labelled>
          <Labelled label="Role" hint="A workspace allows at most two admins">
            <Select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'member' | 'admin' }))}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Labelled>
        </div>
      </Modal>

      {invited && (
        <Modal
          open onOpenChange={() => setInvited(null)}
          title={`Invite ready for ${invited.email}`}
          description="Share this link so they can set their own password. It is shown once."
          footer={<Button onClick={() => setInvited(null)}>Done</Button>}
        >
          <div className="space-y-2">
            {invited.link && <CopyRow label="Set-password link" value={invited.link} />}
            {invited.pw && <CopyRow label="Temporary password" value={invited.pw} />}
          </div>
        </Modal>
      )}
    </div>
  )
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="space-y-1">
      <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-2 py-1.5 text-2xs">{value}</code>
        <Button
          variant="outline" size="sm"
          onClick={async () => {
            try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) }
            catch { toast.error('Your browser blocked clipboard access.') }
          }}
        >
          {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {done ? 'Copied' : 'Copy'}
        </Button>
      </div>
    </div>
  )
}
