'use client'

import { useState } from 'react'
import { useTemplates, useCreateTemplate, useDeleteTemplate } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Modal } from '@/components/ui/modal'
import { FileText, Plus, Trash2, Copy } from 'lucide-react'
import { toast } from 'sonner'

export function TemplatesManager() {
  const { data } = useTemplates()
  const create = useCreateTemplate()
  const del = useDeleteTemplate()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState<{ name: string; subject?: string | null; body: string } | null>(null)
  const templates = data?.templates ?? []

  const submit = () => {
    if (!name.trim() || !body.trim()) { toast.error('Name and body required'); return }
    create.mutate({ name, subject, body }, {
      onSuccess: () => { setOpen(false); setName(''); setSubject(''); setBody(''); toast.success('Template saved') },
      onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
    })
  }

  return (
    <div className="glass rounded-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold"><FileText className="h-4 w-4" /> DM Templates</h2>
          <p className="text-xs text-muted-foreground">Shared across the workspace. Click a template to preview it.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" /> New template</Button>
      </div>
      {templates.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No templates yet — the drawer falls back to built-in defaults until you add some.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {templates.map(t => (
            <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-card/40 px-3 py-2.5">
              <button onClick={() => setPreview(t)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium hover:text-primary">{t.name}</p>
                <p className="truncate text-xs text-muted-foreground">{t.body}</p>
              </button>
              <button onClick={() => del.mutate(t.id, { onSuccess: () => toast.success('Deleted') })}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen} title="New template" description="Use variables to personalize each message.">
        <div className="space-y-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Template name (e.g. Intro)" />
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (optional)" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} placeholder="Hey {{first_name}}, love your {{niche}} content…"
            className="w-full rounded-lg border border-border bg-card/40 p-3 text-sm outline-none focus:border-primary/50" />
          <p className="text-[11px] text-muted-foreground">Variables: <span className="font-mono">{'{{first_name}} {{handle}} {{follower_count}} {{niche}} {{country}}'}</span></p>
          <Button onClick={submit} disabled={create.isPending} className="w-full">{create.isPending ? 'Saving…' : 'Save template'}</Button>
        </div>
      </Modal>

      <Modal open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={preview?.name ?? 'Template'} description={preview?.subject ? `Subject: ${preview.subject}` : 'Preview'}>
        {preview && (
          <div className="space-y-3">
            <div className="whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/30 p-3 text-sm leading-relaxed">{preview.body}</div>
            <Button size="sm" variant="ghost" className="w-full border border-border"
              onClick={() => { navigator.clipboard?.writeText(preview.body); toast.success('Template copied') }}>
              <Copy className="mr-1.5 h-4 w-4" /> Copy text
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
