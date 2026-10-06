import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAvailableSlots } from '@/lib/availability';
import { getActiveStaff, getBusiness } from '@/lib/public-data';
import { formatSlotLabel } from '@/lib/time';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  service: z.uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  staff: z.union([z.uuid(), z.literal('any')]).default('any'),
});

/**
 * GET /api/availability?service=…&date=YYYY-MM-DD&staff=…
 *
 * Returns bookable start times only. The resolved (staff_id, resource_id) pair
 * stays on the server (§4) — the browser sends back an instant and nothing
 * else, and the write path resolves the pair again from scratch.
 *
 * This list is advisory and may be stale by the time it is tapped. That is
 * expected: the exclusion constraints are what guarantee correctness.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    service: url.searchParams.get('service') ?? undefined,
    date: url.searchParams.get('date') ?? undefined,
    staff: url.searchParams.get('staff') ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: 'bad_request', detail: parsed.error.issues }, { status: 400 });
  }

  const business = await getBusiness();
  if (!business) return NextResponse.json({ error: 'no_business' }, { status: 500 });

  const [slots, staff] = await Promise.all([
    getAvailableSlots({
      businessId: business.id,
      serviceId: parsed.data.service,
      date: parsed.data.date,
      staffId: parsed.data.staff === 'any' ? null : parsed.data.staff,
    }),
    getActiveStaff(business.id),
  ]);

  const staffNames = new Map(staff.map((member) => [member.id, member.name]));

  return NextResponse.json(
    {
      date: parsed.data.date,
      slots: slots.map((slot) => ({
        startsAt: slot.startsAt.toISOString(),
        label: formatSlotLabel(slot.startsAt, business.timezone),
        staffName: staffNames.get(slot.staffId) ?? '',
      })),
    },
    // Availability changes the moment anyone books. Never cache it.
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
