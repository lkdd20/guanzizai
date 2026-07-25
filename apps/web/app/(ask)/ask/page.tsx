import { AskWorkspace } from '@/components/ask-workspace'
import { askAgentProfile } from '@/lib/ask-agent-profile'
import { buildAskExperience, defaultAskExperience } from '@/lib/ask-experience'
import { listPublishedAskResources } from '@/lib/content-db'

// The available corpus changes infrequently. ISR avoids a Vercel -> PostgreSQL
// round trip on every visit while refreshing newly published works within 5 minutes.
export const revalidate = 300

export const metadata = {
  title: `${askAgentProfile.productName} · ${askAgentProfile.name}`,
  robots: {
    index: false,
    follow: true,
  },
}

export default async function AskPage() {
  const experience = await listPublishedAskResources()
    .then((resources) => buildAskExperience(resources))
    .catch(() => defaultAskExperience)

  return (
    <div className="ask-page">
      <section className="site-container ask-workspace-section">
        <AskWorkspace experience={experience} />
      </section>
    </div>
  )
}
