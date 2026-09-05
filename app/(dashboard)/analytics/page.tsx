import { redirect } from 'next/navigation'

/**
 * Retired destination. Outreach, deliverables and analytics are things you do
 * to an influencer inside a campaign, not places to visit; bookmarks and old
 * links land on the page that now owns the work.
 */
export default function Page() {
  redirect('/campaigns')
}
