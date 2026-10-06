import { WalkInForm } from '@/components/admin/walk-in-form';
import { getActiveServices, getActiveStaff, getBusiness, getStaffForService } from '@/lib/public-data';
import { requireOwner } from '@/lib/supabase/session';
import { todayInZone } from '@/lib/time';

export const dynamic = 'force-dynamic';

/**
 * §7 screen 3 — the owner books someone standing at the counter.
 * Without this the calendar diverges from reality within a week.
 */
export default async function WalkInPage() {
  await requireOwner();

  const business = (await getBusiness())!;
  const [services, staff] = await Promise.all([
    getActiveServices(business.id),
    getActiveStaff(business.id),
  ]);
  const staffLists = await Promise.all(services.map((service) => getStaffForService(service.id)));

  return (
    <WalkInForm
      today={todayInZone(business.timezone)}
      services={services.map((service, index) => ({
        id: service.id,
        name: service.name,
        durationMinutes: service.duration_minutes,
        priceCents: service.price_cents,
        staffIds: staffLists[index].map((member) => member.id),
      }))}
      staff={staff.map((member) => ({ id: member.id, name: member.name }))}
    />
  );
}
