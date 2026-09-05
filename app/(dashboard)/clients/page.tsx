'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Building2, Package, Plus, Pencil, Trash2, ExternalLink } from 'lucide-react'
import {
  useClients, useProducts, useCreateClient, useUpdateClient, useDeleteClient,
  useCreateProduct, useUpdateProduct, useDeleteProduct,
} from '@/lib/queries'
import { useIsAdmin } from '@/lib/auth-context'
import { PageHeader } from '@/components/layout/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Modal } from '@/components/ui/modal'
import { EmptyState, ErrorState, Shimmer } from '@/components/ui/states'
import { Labelled } from '@/components/ui/field'
import { safeUrl } from '@/lib/utils'
import type { Client, Product } from '@/types/campaign'
import { DemoBadge } from '@/components/crm/demo'

export default function ClientsPage() {
  const isAdmin = useIsAdmin()
  const clients = useClients()
  const products = useProducts()
  const [clientForm, setClientForm] = useState<Client | 'new' | null>(null)
  const [productForm, setProductForm] = useState<Product | { client_id: string } | null>(null)

  if (clients.isLoading) {
    return (
      <div className="space-y-4">
        <Shimmer className="h-8 w-48" />
        <Shimmer className="h-64 rounded-xl" />
      </div>
    )
  }
  if (clients.error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Clients & products" />
        <ErrorState error={clients.error} onRetry={() => clients.refetch()} />
      </div>
    )
  }

  const list = clients.data ?? []

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients & products"
        description="A campaign always promotes one product for one client. Products are reusable across as many campaigns as you like."
        actions={isAdmin && (
          <Button size="sm" onClick={() => setClientForm('new')}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Add client
          </Button>
        )}
      />

      {list.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No clients yet"
          description="Add the brand you are running campaigns for, then add the products you will promote. Nothing is pre-filled — this workspace has no demo data."
          actions={isAdmin
            ? <Button size="sm" onClick={() => setClientForm('new')}>Add your first client</Button>
            : <p className="text-[13px] text-muted-foreground">Ask an admin to add the first client.</p>}
        />
      ) : (
        <div className="space-y-4">
          {list.map(c => (
            <ClientCard
              key={c.id}
              client={c}
              products={(products.data ?? []).filter(p => p.client_id === c.id)}
              isAdmin={isAdmin}
              onEdit={() => setClientForm(c)}
              onAddProduct={() => setProductForm({ client_id: c.id })}
              onEditProduct={p => setProductForm(p)}
            />
          ))}
        </div>
      )}

      {clientForm && (
        <ClientModal
          value={clientForm === 'new' ? null : clientForm}
          onClose={() => setClientForm(null)}
        />
      )}
      {productForm && (
        <ProductModal
          value={'id' in productForm ? productForm : null}
          clientId={'id' in productForm ? productForm.client_id : productForm.client_id}
          clients={list}
          onClose={() => setProductForm(null)}
        />
      )}
    </div>
  )
}

function ClientCard({ client, products, isAdmin, onEdit, onAddProduct, onEditProduct }: {
  client: Client
  products: Product[]
  isAdmin: boolean
  onEdit: () => void
  onAddProduct: () => void
  onEditProduct: (p: Product) => void
}) {
  const del = useDeleteClient()
  const website = safeUrl(client.website)
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            {client.name}
            <DemoBadge on={client.demo_run_id} />
            {client.status !== 'active' && <Badge tone="neutral">{client.status}</Badge>}
          </CardTitle>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-2xs text-muted-foreground">
            {website && (
              <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                {new URL(website).hostname}<ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )}
            {client.primary_contact && <span>Contact: {client.primary_contact}</span>}
            {client.contact_email && <a href={`mailto:${client.contact_email}`} className="text-primary hover:underline">{client.contact_email}</a>}
            <span className="tnum">{client.product_count} product{client.product_count === 1 ? '' : 's'}</span>
            <span className="tnum">{client.campaign_count} campaign{client.campaign_count === 1 ? '' : 's'}</span>
          </p>
        </div>
        {isAdmin && (
          <div className="flex gap-1.5">
            <Button variant="outline" size="xs" onClick={onEdit}><Pencil className="h-3 w-3" aria-hidden />Edit</Button>
            <Button variant="outline" size="xs" onClick={onAddProduct}><Plus className="h-3 w-3" aria-hidden />Product</Button>
            <Button
              variant="ghost" size="xs"
              onClick={() => {
                if (!confirm(`Delete ${client.name}? Its products are deleted with it. Campaigns block deletion.`)) return
                del.mutate(client.id, { onSuccess: () => toast.success('Client deleted.'), onError: e => toast.error(e.message) })
              }}
            >
              <Trash2 className="h-3 w-3" aria-hidden /><span className="sr-only">Delete client</span>
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {products.length === 0 ? (
          <EmptyState
            compact
            icon={Package}
            title="No products for this client"
            description="A campaign needs a product. Add the thing you are actually asking creators to talk about."
            actions={isAdmin ? <Button size="sm" onClick={onAddProduct}>Add product</Button> : undefined}
          />
        ) : (
          <ul className="divide-y divide-border">
            {products.map(p => {
              const url = safeUrl(p.product_url)
              return (
                <li key={p.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[13px] font-medium">
                      {p.name}
                      {p.category && <Badge tone="outline">{p.category}</Badge>}
                      {p.status !== 'active' && <Badge tone="neutral">{p.status}</Badge>}
                    </p>
                    {p.description && <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{p.description}</p>}
                    <p className="mt-1 flex flex-wrap gap-3 text-2xs text-muted-foreground">
                      {url && <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Product page</a>}
                      {p.price_note && <span>{p.price_note}</span>}
                      <span className="tnum">{p.campaign_count ?? 0} campaign{p.campaign_count === 1 ? '' : 's'}</span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <Button asChild variant="outline" size="xs">
                      <Link href={`/campaigns/new?productId=${p.id}`}>New campaign</Link>
                    </Button>
                    {isAdmin && <Button variant="ghost" size="xs" onClick={() => onEditProduct(p)}><Pencil className="h-3 w-3" aria-hidden /><span className="sr-only">Edit product</span></Button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function ClientModal({ value, onClose }: { value: Client | null; onClose: () => void }) {
  const create = useCreateClient()
  const update = useUpdateClient()
  const [form, setForm] = useState({
    name: value?.name ?? '',
    website: value?.website ?? '',
    primary_contact: value?.primary_contact ?? '',
    contact_email: value?.contact_email ?? '',
    notes: value?.notes ?? '',
    status: value?.status ?? 'active',
  })
  const pending = create.isPending || update.isPending

  const submit = async () => {
    try {
      if (value) await update.mutateAsync({ id: value.id, patch: form })
      else await create.mutateAsync(form)
      toast.success(value ? 'Client updated.' : 'Client added.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      title={value ? `Edit ${value.name}` : 'Add a client'}
      description="The brand or company whose products you are marketing through creators."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || pending}>{pending ? 'Saving…' : 'Save client'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <Labelled label="Client / brand name" required>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme Software" />
        </Labelled>
        <Labelled label="Website">
          <Input value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://acme.com" inputMode="url" />
        </Labelled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Primary contact">
            <Input value={form.primary_contact} onChange={e => setForm(f => ({ ...f, primary_contact: e.target.value }))} placeholder="Name" />
          </Labelled>
          <Labelled label="Contact email">
            <Input type="email" value={form.contact_email} onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))} />
          </Labelled>
        </div>
        <Labelled label="Status">
          <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Client['status'] }))}>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="archived">Archived</option>
          </Select>
        </Labelled>
        <Labelled label="Notes">
          <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
        </Labelled>
      </div>
    </Modal>
  )
}

function ProductModal({ value, clientId, clients, onClose }: {
  value: Product | null; clientId: string; clients: Client[]; onClose: () => void
}) {
  const create = useCreateProduct()
  const update = useUpdateProduct()
  const del = useDeleteProduct()
  const [form, setForm] = useState({
    client_id: value?.client_id ?? clientId,
    name: value?.name ?? '',
    product_url: value?.product_url ?? '',
    category: value?.category ?? '',
    description: value?.description ?? '',
    target_customer: value?.target_customer ?? '',
    selling_points: (value?.selling_points ?? []).join('\n'),
    price_note: value?.price_note ?? '',
    prohibited_claims: value?.prohibited_claims ?? '',
    talking_points: (value?.talking_points ?? []).join('\n'),
    asset_links: (value?.asset_links ?? []).join('\n'),
    status: value?.status ?? 'active',
  })
  const pending = create.isPending || update.isPending

  const lines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

  const submit = async () => {
    const payload = {
      ...form,
      selling_points: lines(form.selling_points),
      talking_points: lines(form.talking_points),
      asset_links: lines(form.asset_links),
    }
    try {
      if (value) await update.mutateAsync({ id: value.id, patch: payload })
      else await create.mutateAsync(payload)
      toast.success(value ? 'Product updated.' : 'Product added.')
      onClose()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not save.') }
  }

  return (
    <Modal
      open onOpenChange={o => !o && onClose()}
      title={value ? `Edit ${value.name}` : 'Add a product'}
      description="What creators will actually be talking about. Everything here feeds the campaign brief and the outreach templates."
      size="lg"
      footer={
        <>
          {value && (
            <Button
              variant="ghost"
              className="mr-auto text-destructive"
              onClick={() => {
                if (!confirm(`Delete ${value.name}?`)) return
                del.mutate(value.id, { onSuccess: () => { toast.success('Product deleted.'); onClose() }, onError: e => toast.error(e.message) })
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!form.name.trim() || pending}>{pending ? 'Saving…' : 'Save product'}</Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Product name" required>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </Labelled>
          <Labelled label="Client" required>
            <Select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Labelled>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Product URL">
            <Input value={form.product_url} onChange={e => setForm(f => ({ ...f, product_url: e.target.value }))} inputMode="url" />
          </Labelled>
          <Labelled label="Category">
            <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="Developer tools" />
          </Labelled>
        </div>
        <Labelled label="Description">
          <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} />
        </Labelled>
        <Labelled label="Target customer">
          <Textarea value={form.target_customer} onChange={e => setForm(f => ({ ...f, target_customer: e.target.value }))} rows={2} />
        </Labelled>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Selling points" hint="One per line">
            <Textarea value={form.selling_points} onChange={e => setForm(f => ({ ...f, selling_points: e.target.value }))} rows={4} />
          </Labelled>
          <Labelled label="Approved talking points" hint="One per line — offered as variables in templates">
            <Textarea value={form.talking_points} onChange={e => setForm(f => ({ ...f, talking_points: e.target.value }))} rows={4} />
          </Labelled>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Labelled label="Price or offer" hint="Free text — only fill this in if it is known">
            <Input value={form.price_note} onChange={e => setForm(f => ({ ...f, price_note: e.target.value }))} placeholder="$29/mo, 20% launch discount" />
          </Labelled>
          <Labelled label="Status">
            <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as Product['status'] }))}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </Select>
          </Labelled>
        </div>
        <Labelled label="Prohibited claims" hint="Things creators must not say about this product">
          <Textarea value={form.prohibited_claims} onChange={e => setForm(f => ({ ...f, prohibited_claims: e.target.value }))} rows={2} />
        </Labelled>
        <Labelled label="Assets / links" hint="One URL per line">
          <Textarea value={form.asset_links} onChange={e => setForm(f => ({ ...f, asset_links: e.target.value }))} rows={2} />
        </Labelled>
      </div>
    </Modal>
  )
}
