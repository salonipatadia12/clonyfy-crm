'use client'

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Check, Send, AlertTriangle, Mail, MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input, Textarea } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { Labelled } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/states'
import { useLogOutreach, useTemplateList } from '@/lib/queries'
import { renderTemplate, VARIABLES } from '@/lib/template-vars'
import { CHANNELS, REPLY_STATUSES, channelReadiness, dueLabel, ccStageLabel } from '@/lib/domain'
import { formatFollowers } from '@/lib/utils'
import type { Campaign, CampaignCreator } from '@/types/campaign'

/**
 * Campaign-scoped outreach. The user always knows which client product they are
 * pitching before they copy anything — the product name is on the composer, and
 * every variable resolves from this campaign.
 *
 * Nothing is sent. The buttons copy text and log what the user did.
 */
export function OutreachPanel({ campaign, creators }: { campaign: Campaign; creators: CampaignCreator[] }) {
  const [target, setTarget] = useState<CampaignCreator | null>(null)
  const contactable = creators.filter(c => channelReadiness(c).any)

  if (!creators.length) {
    return (
      <EmptyState
        icon={Send}
        title="No creators to reach out to yet"
        description="Shortlist creators on the Creators tab first. Outreach always happens in the context of a campaign so the message can name the right product."
      />
    )
  }

  return (
    <div className="space-y-3">
      <p className="rounded-lg border border-border bg-muted/50 p-3 text-2xs leading-relaxed text-muted-foreground">
        Pitching <span className="font-medium text-foreground">{campaign.product_name ?? 'this campaign'}</span>
        {campaign.client_name && <> for <span className="font-medium text-foreground">{campaign.client_name}</span></>}.
        Clonify does not send messages — it prepares them, and records what you sent.
        {contactable.length < creators.length && (
          <> {creators.length - contactable.length} of {creators.length} creators have no Instagram profile, email or phone yet.</>
        )}
      </p>

      <ul className="space-y-2">
        {creators.map(c => {
          const r = channelReadiness(c)
          const due = dueLabel(c.next_follow_up)
          return (
            <li key={c.id} className="surface flex flex-wrap items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{c.full_name || `@${c.handle}`}</p>
                <p className="truncate text-2xs text-muted-foreground">
                  @{c.handle} · {formatFollowers(c.follower_count)} · {ccStageLabel(c.stage)}
                  {c.outreach_count > 0 && ` · ${c.outreach_count} touch${c.outreach_count === 1 ? '' : 'es'} logged`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {r.instagram && <Badge tone="info"><MessageCircle className="h-3 w-3" aria-hidden />DM</Badge>}
                {r.email && <Badge tone="info"><Mail className="h-3 w-3" aria-hidden />Email</Badge>}
                {r.phone && <Badge tone="neutral">Phone</Badge>}
                {!r.any && <Badge tone="warning">No contact route</Badge>}
                {due && <Badge tone={due.tone}>{due.text}</Badge>}
              </div>
              <Button size="sm" variant={r.any ? 'default' : 'outline'} onClick={() => setTarget(c)}>
                {c.outreach_count > 0 ? 'Log follow-up' : 'Compose & log'}
              </Button>
            </li>
          )
        })}
      </ul>

      {target && <Composer campaign={campaign} creator={target} onClose={() => setTarget(null)} />}
    </div>
  )
}

export function Composer({ campaign, creator, onClose }: {
  campaign: Campaign; creator: CampaignCreator; onClose: () => void
}) {
  const templates = useTemplateList()
  const log = useLogOutreach()
  const readiness = channelReadiness(creator)

  const [channel, setChannel] = useState(readiness.instagram ? 'instagram_dm' : readiness.email ? 'email' : 'other')
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [reply, setReply] = useState('awaiting')
  const [followUp, setFollowUp] = useState(() => new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [copied, setCopied] = useState(false)

  const relevant = (templates.data ?? []).filter(t =>
    (channel === 'email' ? t.channel === 'email' : t.channel === 'instagram_dm') &&
    (!t.campaign_id || t.campaign_id === campaign.id))

  const rendered = useMemo(
    () => renderTemplate(bodyText, { campaign, creator }),
    [bodyText, campaign, creator],
  )
  const renderedSubject = useMemo(
    () => renderTemplate(subject, { campaign, creator }),
    [subject, campaign, creator],
  )
  const missing = [...new Set([...rendered.missing, ...renderedSubject.missing])]

  const applyTemplate = (id: string) => {
    setTemplateId(id)
    const t = relevant.find(x => x.id === id)
    if (t) { setBodyText(t.body); setSubject(t.subject ?? '') }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        channel === 'email' && renderedSubject.text ? `${renderedSubject.text}\n\n${rendered.text}` : rendered.text,
      )
      setCopied(true); setTimeout(() => setCopied(false), 1600)
      toast.success('Copied. Paste it into ' + (channel === 'email' ? 'your mail client' : 'Instagram') + ', then log it here.')
    } catch { toast.error('Your browser blocked clipboard access. Select the preview text and copy it manually.') }
  }

  const save = async () => {
    try {
      await log.mutateAsync({
        campaign_creator_id: creator.id,
        channel,
        direction: reply === 'replied_positive' || reply === 'replied_negative' ? 'inbound' : 'outbound',
        template_id: templateId || null,
        subject: renderedSubject.text || null,
        body: rendered.text || null,
        reply_status: reply,
        next_follow_up: followUp || null,
        notes: notes || null,
      })
      toast.success('Outreach logged.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not log this.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      size="lg"
      title={`Outreach to @${creator.handle}`}
      description={`Pitching ${campaign.product_name ?? campaign.name}${campaign.client_name ? ` for ${campaign.client_name}` : ''}. Copy the message, send it yourself, then log it.`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" onClick={copy} disabled={!rendered.text.trim()}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? 'Copied' : 'Copy message'}
          </Button>
          <Button onClick={save} disabled={log.isPending}>{log.isPending ? 'Logging…' : 'Log this touch'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Channel">
            <Select value={channel} onChange={e => { setChannel(e.target.value); setTemplateId('') }}>
              {CHANNELS.map(c => {
                const disabled =
                  (c.value === 'instagram_dm' && !readiness.instagram) ||
                  (c.value === 'email' && !readiness.email) ||
                  ((c.value === 'phone' || c.value === 'whatsapp') && !readiness.phone)
                return <option key={c.value} value={c.value} disabled={disabled}>
                  {c.label}{disabled ? ' — not available for this creator' : ''}
                </option>
              })}
            </Select>
          </Labelled>
          <Labelled label="Template">
            <Select value={templateId} onChange={e => applyTemplate(e.target.value)}>
              <option value="">Write from scratch</option>
              {relevant.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Labelled>
        </div>

        <p className="flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
          Sending to:
          {readiness.instagram && creator.profile_url && (
            <a href={creator.profile_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{creator.profile_url}</a>
          )}
          {creator.email && <a href={`mailto:${creator.email}`} className="text-primary hover:underline">{creator.email}</a>}
          {creator.phone && <span>{creator.phone}</span>}
          {!readiness.any && <span className="text-warning">No contact route recorded for this creator.</span>}
        </p>

        {channel === 'email' && (
          <Labelled label="Subject">
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Collaboration with {{client}}" />
          </Labelled>
        )}

        <Labelled label="Message" hint="Variables in double braces are replaced with this campaign's real values">
          <Textarea rows={7} value={bodyText} onChange={e => setBodyText(e.target.value)} />
        </Labelled>

        <details className="rounded-lg border border-border p-2.5">
          <summary className="cursor-pointer text-2xs font-medium text-muted-foreground">Available variables</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            {VARIABLES.map(v => (
              <button
                key={v.key}
                type="button"
                title={v.description}
                onClick={() => setBodyText(b => `${b}{{${v.key}}}`)}
                className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-2xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
        </details>

        {missing.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 p-2.5 text-2xs text-warning">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              These variables have no value on this campaign or creator and were left blank:
              {' '}<span className="font-mono">{missing.join(', ')}</span>. Fill them in on the campaign or the product, or edit the text.
            </span>
          </p>
        )}

        {rendered.text && (
          <div className="space-y-1">
            <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">Preview with real values</p>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-[13px] leading-relaxed">
              {channel === 'email' && renderedSubject.text && <p className="mb-2 font-medium">{renderedSubject.text}</p>}
              <p className="whitespace-pre-wrap">{rendered.text}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Outcome">
            <Select value={reply} onChange={e => setReply(e.target.value)}>
              {REPLY_STATUSES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Labelled>
          <Labelled label="Next follow-up">
            <Input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} />
          </Labelled>
        </div>
        <Labelled label="Notes"><Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Labelled>
      </div>
    </Modal>
  )
}
