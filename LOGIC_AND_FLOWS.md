# Clonyfy — Logic, Data Flow & Functional Spec
Last updated: June 2026. For Claude Code implementation only.

---

## 1. AUTHENTICATION & ROLES

### Setup
- Supabase Auth (email + password)
- On first login: admin creates workspace, gets workspace_id
- Admin invites members via email → Supabase sends invite link
- Member accepts → sets password → logs in
- Role stored in users table (role: 'admin' | 'member')
- Max 2 admins per workspace

### Role Behavior
Admin:
- Sees all pipeline contacts across all members
- Sees all activity across workspace
- Can assign influencers to members
- Can reassign pipeline contacts between members
- Can create/remove member accounts
- Sees "Assigned to" column everywhere it appears
- Sees Team Performance data

Member:
- Sees ONLY their own pipeline contacts (assigned_to = their user_id)
- Can browse full influencers database
- Can add anyone to their own pipeline (auto-assigns to them)
- Cannot see or touch other members' pipeline contacts
- Cannot reassign contacts

### RLS Policies (Supabase)

pipeline table:
- SELECT: assigned_to = auth.uid() OR role = 'admin'
- INSERT: assigned_to = auth.uid()
- UPDATE: assigned_to = auth.uid() OR role = 'admin'

assignments table:
- SELECT: assigned_to = auth.uid() OR role = 'admin'
- INSERT: role = 'admin' only
- UPDATE: role = 'admin' only

activity_log table:
- SELECT: user_id = auth.uid() OR role = 'admin'
- INSERT: any authenticated user

reassignment_log table:
- SELECT: role = 'admin' only
- INSERT: role = 'admin' only

influencers table:
- SELECT: any authenticated user in workspace
- INSERT/UPDATE: role = 'admin' only (for Add Creator)

templates table:
- ALL: any authenticated user in workspace (shared)

saved_lists table:
- ALL: created_by = auth.uid() (personal per user)

---

## 2. DATABASE TABLES

### influencers
id, handle, full_name, follower_count, niche, country,
biography, bio_link, profile_url, is_verified, scraped_at, workspace_id

Seeded from CSV on workspace setup.
NEVER store: engagement_rate, eng_quality, quality_tier, account_type

### pipeline
id, workspace_id, handle, full_name, follower_count, niche, country,
profile_url, biography, is_verified,
stage, assigned_to, assigned_name, assigned_at, assigned_by,
notes, last_touch, added_at, added_via,
reel_url, reel_views,
commission_type, commission_percentage, commission_flat

NEVER store: deal_value, revenue, engagement_rate, quality_tier

### assignments
id, workspace_id, influencer_handle, assigned_to, assigned_by,
assigned_at, status ('pending' | 'added_to_pipeline'), pipeline_id

### users
id, name, email, role, workspace_id, created_at, last_active, invite_accepted

### activity_log
id, workspace_id, user_id, user_name, profile_handle, profile_name,
action, metadata (jsonb), created_at

action enum:
added_to_pipeline | stage_changed | reel_url_added |
notes_updated | commission_set | reassigned | assigned | removed_from_pipeline

### reassignment_log
id, workspace_id, admin_id, admin_name,
from_user_id, from_user_name, to_user_id, to_user_name,
profile_handle, profile_name, reason, created_at

### templates
id, workspace_id, created_by, name, subject, body, tags, created_at, updated_at

### saved_lists
id, workspace_id, created_by, name, filters (jsonb), created_at, last_used, match_count

### notifications
id, workspace_id, user_id, message, type, read, created_at

---

## 3. INFLUENCERS PAGE — LOGIC

### Two tabs

My Assignments tab:
- Query assignments WHERE assigned_to = auth.uid()
- Join influencers table for profile data
- Join pipeline table to get current stage (if added)
- Show status per profile:
  status = 'pending' AND no pipeline entry → "Not added yet"
  status = 'added_to_pipeline' → show current stage from pipeline

All Influencers tab:
- Query full influencers table
- LEFT JOIN pipeline to compute in_pipeline boolean
- Apply filters: niche, follower_bucket, country, verified, search, hide_in_pipeline
- in_pipeline = true if handle exists in pipeline for this workspace

Admin third option (By Member):
- Query users WHERE role = 'member' AND workspace_id = ?
- For each member: COUNT assignments, COUNT pipeline contacts
- Shows summary per member, click → filters All Influencers to show that member's assignments

### Add Creator (inline modal)
- Input: Instagram URL
- Fetch profile data from Apify or scraper
- On success: INSERT into influencers table
- Does NOT add to pipeline
- Profile appears in All Influencers tab immediately

### Saved Lists
- Stores filter state (jsonb) only — not profile IDs
- Dynamic: runs filter query fresh each load
- Per user (created_by = auth.uid())
- On load: re-runs filter, updates match_count

### Bulk Actions (bottom action bar on checkbox select)

Admin can:
1. Add to Pipeline → INSERT into pipeline with chosen stage
2. Assign to member → INSERT into assignments table

Member can:
1. Add to Pipeline only → INSERT into pipeline

Assign to Member flow:
- Admin selects profiles
- Picks member from dropdown
- INSERT assignments rows (status: 'pending')
- INSERT activity_log rows (action: 'assigned')
- INSERT notification for member
- Profiles appear in member's My Assignments tab immediately

---

## 4. PIPELINE PAGE — LOGIC

### Data fetch
Admin: SELECT * FROM pipeline WHERE workspace_id = ?
Member: SELECT * FROM pipeline WHERE assigned_to = auth.uid()

### Stage change
- UPDATE pipeline SET stage = new_stage, last_touch = now()
- INSERT activity_log: action = 'stage_changed', metadata: {from, to}

### Drag and drop (kanban)
- On drop: same as stage change above

### Conflict detection
When any user tries to add profile to pipeline:
SELECT * FROM pipeline
WHERE handle = ? AND workspace_id = ? AND assigned_to != auth.uid()

If row found: show conflict modal
- Member: [View contact] [Cancel]
- Admin: [View contact] [Reassign to me] [Add anyway] [Cancel]

### Filters
- stage: WHERE stage = ?
- niche: WHERE niche = ?
- country: WHERE country = ?
- assigned_to: WHERE assigned_to = ? (admin only)
- search: WHERE handle ILIKE ? OR full_name ILIKE ?

### Last Touch Warning
Flag in list view:
stage IN ('contacted','responded','negotiating')
AND (now() - last_touch) > 7 days

---

## 5. PROFILE DRAWER — LOGIC

### Three modes
browse: opened from Influencers — read only, Add to Pipeline CTA
pipeline: opened from Pipeline — full edit
readonly: opened from Command Center — read only, View in Pipeline link

### Stage update (pipeline mode)
UPDATE pipeline SET stage = ?, last_touch = now()
INSERT activity_log (stage_changed)

### Commission (pipeline mode)
commission_type: 'percentage' | 'flat' | 'both'
commission_percentage: number (% value)
commission_flat: string (display only, never calculated, never summed)
UPDATE pipeline SET commission_type, commission_percentage, commission_flat
INSERT activity_log (commission_set)

### Notes (pipeline mode)
Auto-save on blur
UPDATE pipeline SET notes = ?, last_touch = now()
INSERT activity_log (notes_updated)

### Reel URL (pipeline mode, shown when stage = live or completed)
UPDATE pipeline SET reel_url = ?, reel_views = ?, last_touch = now()
INSERT activity_log (reel_url_added)

### Assigned to (admin only in pipeline mode)
Shows member picker dropdown
On change: triggers reassignment flow (see section 7)

### Open on Instagram
window.open(profile_url, '_blank', 'noopener,noreferrer')
Single button — not separate profile link and bio link

### Use Template
- Fetch all templates WHERE workspace_id = ?
- Show dropdown list
- On select: resolve variables against current profile
- Populate editable subject + body fields
- Copy message button: navigator.clipboard.writeText(resolvedBody)
- Toast: "Copied — paste into Instagram DM"

Template variable resolution:
{{first_name}}     → full_name.split(' ')[0]
{{handle}}         → '@' + handle
{{follower_count}} → formatted (e.g. "11.5K")
{{niche}}          → formatted (e.g. "Web Dev")
{{country}}        → country field

---

## 6. ACTIVITY LOG — LOGIC

Every action writes immediately to activity_log.
Never edited, never deleted.

Fields always written:
- workspace_id
- user_id + user_name (who did it)
- profile_handle + profile_name (who it happened to)
- action type
- metadata (stage_from/to, reason, values set)
- created_at

Admin Live Activity feed:
SELECT * FROM activity_log
WHERE workspace_id = ?
ORDER BY created_at DESC
LIMIT 20

Member Live Activity feed:
SELECT * FROM activity_log
WHERE workspace_id = ? AND user_id = auth.uid()
ORDER BY created_at DESC
LIMIT 20

Profile drawer Activity tab:
SELECT * FROM activity_log
WHERE workspace_id = ? AND profile_handle = ?
ORDER BY created_at DESC

---

## 7. REASSIGNMENT — LOGIC

Admin only. Triggered from:
- Profile drawer Assigned to field
- Pipeline bulk action bar (select multiple → reassign)

Flow:
1. Admin picks new member
2. Optional reason text
3. On confirm:
   UPDATE pipeline SET assigned_to = ?, assigned_name = ?, last_touch = now()
   INSERT reassignment_log (full audit record)
   INSERT activity_log (action: 'reassigned', metadata: {from, to, reason})
   INSERT notification for new member
   INSERT notification for previous member

Reassignment log fields:
admin_id, admin_name, from_user_id, from_user_name,
to_user_id, to_user_name, profile_handle, profile_name,
reason (nullable), created_at

Visible in:
- Profile drawer Activity tab (all users can see)
- Settings → Team → Reassignment log (admin only)
- Command Center Live Activity (admin only)

---

## 8. KPI CALCULATIONS

No $ calculations anywhere. Ever.

Admin KPIs:
totalProfiles:   COUNT influencers WHERE workspace_id = ?
inPipeline:      COUNT pipeline WHERE workspace_id = ?
contacted:       COUNT pipeline WHERE workspace_id = ? AND stage = 'contacted'
videosGenerated: COUNT pipeline WHERE workspace_id = ? AND reel_url IS NOT NULL
teamMembers:     COUNT users WHERE workspace_id = ?

Member KPIs:
totalProfiles:   COUNT influencers (same, shared)
inPipeline:      COUNT pipeline WHERE assigned_to = auth.uid()
contacted:       COUNT pipeline WHERE assigned_to = auth.uid() AND stage = 'contacted'
videosGenerated: COUNT pipeline WHERE assigned_to = auth.uid() AND reel_url IS NOT NULL
teamMembers:     not shown to members

Admin Team Performance (per member):
assigned:   COUNT assignments WHERE assigned_to = member_id
inPipeline: COUNT pipeline WHERE assigned_to = member_id
contacted:  COUNT pipeline WHERE assigned_to = member_id AND stage IN ('contacted','responded','negotiating','closed','live','completed')
responded:  COUNT pipeline WHERE assigned_to = member_id AND stage IN ('responded','negotiating','closed','live','completed')
videos:     COUNT pipeline WHERE assigned_to = member_id AND reel_url IS NOT NULL

NEVER calculate: revenue, deal totals, conversion %, response rate, engagement

---

## 9. ANALYTICS — LOGIC

All metrics read from pipeline table only.

Pipeline Conversion funnel:
For each stage: COUNT pipeline WHERE workspace_id = ? AND stage = ?
Admin: workspace total | Member: their own

Niche Performance:
For each niche:
  total = COUNT pipeline WHERE niche = ?
  past_contacted = COUNT pipeline WHERE niche = ? AND stage IN ('responded','negotiating','closed','live','completed')
  rate = past_contacted / total * 100

Niche Mix:
COUNT pipeline GROUP BY niche

Reach by Niche:
SUM follower_count FROM influencers GROUP BY niche

Country Mix:
COUNT pipeline GROUP BY country

Team Performance (admin only):
Per member breakdown (same as KPI section above)

Clickable connections:
funnel row → /pipeline?stage=X
niche row → /influencers?tab=all&niche=X
country bar → /pipeline?country=X
team member row → Member Detail view

---

## 10. EMPTY STATES — LOGIC

On fresh workspace creation:
- influencers table: seeded from CSV (real data, always populated)
- All other tables: empty

Every component checks for empty data and renders empty state.
Never show mock numbers, fake names, or seeded pipeline data.

---

## 11. FILTERS — ALLOWED AND FORBIDDEN

Influencers page allowed filters:
search (fuzzy: handle, full_name, biography)
niche (multi-select)
follower_bucket (<1K | 1K-10K | 10K-50K | 50K-100K | 100K-500K | 500K+)
country (single-select, from distinct countries in DB)
verified (boolean toggle)
hide_in_pipeline (boolean toggle)

Pipeline page allowed filters:
search (handle, full_name)
stage (single-select)
niche (single-select)
country (single-select)
assigned_to (admin only)

NEVER add these filters anywhere:
engagement_quality
quality_tier
account_type
market / language
conversion rate
revenue range

---

## 12. NOTIFICATIONS — LOGIC

Triggered by:
- Profiles assigned to member → "X profiles assigned to you by [Admin]"
- Pipeline contact reassigned to member → "@handle assigned to you by [Admin]"
- (Future) Stage changes by admin on member's contact

Stored in notifications table.
Shown as badge count on Notifications bell in sidebar.
Mark as read on view.

---

## 13. CROSS-SCREEN NAVIGATION

All navigation uses URL params for filter state:

/pipeline?stage=contacted
/pipeline?country=US
/pipeline?assigned_to=user_id
/influencers?tab=all&niche=technology
/influencers?tab=all&country=FR

Each screen reads URL params on mount and applies filters.
Filters persist in URL so browser back works correctly.

---

## 14. WHAT DOES NOT EXIST

Add by URL screen — removed
Deals screen — removed
Library screen — removed
$ values anywhere — removed
Revenue metrics — removed
Engagement metrics — removed
Quality tier anywhere — removed
Account type anywhere — removed
Market/language filter — removed
Mock/seeded pipeline data — removed
Static saved lists (must be filter-based) — removed
Separate profile link + bio link (merged to one Open on Instagram) — removed
