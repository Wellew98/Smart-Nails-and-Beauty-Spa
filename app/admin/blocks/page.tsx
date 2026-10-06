import { BlocksManager } from '@/components/admin/blocks-manager';
import { getAllResources, getAllStaff, getBusiness } from '@/lib/public-data';
import { query } from '@/lib/db';
import { requireOwner } from '@/lib/supabase/session';
import { todayInZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

/** §7 screen 4 — block time. Leave, sick days, closures, equipment out of service. */
export default async function BlocksPage() {
  await requireOwner();

  const business = (await getBusiness())!;
  const [staff, resources] = await Promise.all([
    getAllStaff(business.id),
    getAllResources(business.id),
  ]);

  const blocks = await query<{
    id: string;
    staff_id: string | null;
    resource_id: string | null;
    starts_at: Date;
    ends_at: Date;
    reason: string | null;
    subject: string;
  }>(
    `select b.*, coalesce(s.name, r.name) as subject
       from availability_blocks b
       left join staff s     on s.id = b.staff_id
       left join resources r on r.id = b.resource_id
      where coalesce(s.business_id, r.business_id) = $1
        and b.ends_at >= now()
      order by b.starts_at
      limit 100`,
    [business.id],
  );

  return (
    <BlocksManager
      today={todayInZone(business.timezone)}
      timezone={business.timezone}
      staff={staff.filter((member) => member.active).map((m) => ({ id: m.id, name: m.name }))}
      resources={resources.filter((r) => r.active).map((r) => ({ id: r.id, name: r.name }))}
      blocks={blocks.map((block) => ({
        id: block.id,
        subject: block.subject,
        kind: block.staff_id ? ('staff' as const) : ('resource' as const),
        startsAt: new Date(block.starts_at).toISOString(),
        endsAt: new Date(block.ends_at).toISOString(),
        reason: block.reason,
      }))}
    />
  );
}
