import { redirect } from 'next/navigation'

/**
 * Retired route.
 *
 * The old flat "CRM" section split one job across Influencers / Pipeline /
 * Deals. Those concepts now live inside Creators and Campaigns. The redirect
 * keeps existing bookmarks and links working instead of 404-ing them.
 */
export default function RetiredRoute() {
  redirect('/campaigns')
}
