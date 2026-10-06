import 'server-only';
import { getAvailableSlots, getBusiness, getService } from '../availability';
import {
  cancelBooking,
  createBooking,
  getAppointmentById,
  getAppointmentByToken,
  rescheduleBooking,
  type AppointmentDetail,
} from '../booking';
import { query } from '../db';
import { formatDuration, formatZar } from '../money';
import { formatPhoneForDisplay } from '../phone';
import { getActiveServices, getActiveStaff, getOpeningHours } from '../public-data';
import { DAY_NAMES } from '../site';
import {
  formatSlotLabel,
  daysBetween,
  todayInZone,
  utcToZonedDate,
  type IsoDate,
} from '../time';
import { validateToolCall, type CheckAvailabilityArgs } from './validation';
import type {
  AIToolDeclaration,
  AvailabilityAttachment,
  AvailabilityInfo,
  AvailabilityOption,
  BookingAttachment,
  BookingCard,
  BookingView,
  BusinessInfo,
  ConflictAttachment,
  OpeningHoursDay,
  ServiceInfo,
  StaffInfo,
  ToolResult,
} from './types';

/**
 * The four read-only tools the assistant may call.
 *
 * ---------------------------------------------------------------------------
 * RULES THAT APPLY TO ALL FOUR
 *
 * THEY READ THE SAME ROWS THE SITE RENDERS. `lib/public-data.ts` and
 * `lib/availability.ts`, unchanged. There is no second catalogue and no cached
 * copy of the menu, so the assistant physically cannot contradict the site or
 * survive an owner's edit in Admin > Setup.
 *
 * `check_availability` CALLS THE AVAILABILITY ENGINE. It does not reimplement
 * any part of it. Everything §6 gets right — the fifteen-minute grid,
 * turnaround, minimum notice, blocks, resource contention, and the
 * empty-resource-set rule that once let one room be booked without limit —
 * is got right here for free, and stays right when that file changes.
 *
 * NOTHING PERSONAL IS READABLE. There is no tool for customers, appointments,
 * notes or admin data, and no tool takes an argument that could reach them.
 * `get_staff` returns a therapist's name and what she does; her phone, email
 * and everything in the auth tables are not exposed by any path here.
 *
 * IDS ARE GIVEN OUT ONLY WHERE THEY ARE NEEDED. Services carry an id because
 * `check_availability` needs one to name a treatment unambiguously. Therapists
 * do not: a name is enough, and the id is resolved server-side.
 * ---------------------------------------------------------------------------
 */

export interface ToolContext {
  businessId: string;
  /** Injectable for tests, exactly as `getAvailableSlots` takes it. */
  now?: Date;
  /**
   * The customer's manage token, from the request envelope — NEVER from a model
   * argument, and never placed in the conversation.
   *
   * It is the only proof of ownership in the system (§6: 32 random bytes,
   * granting exactly one booking) and there is no second one. Carrying it here
   * rather than as a tool parameter means the model has no way to name an
   * appointment at all: it cannot guess a token, cannot be talked into
   * supplying someone else's, and cannot leak one it never held.
   */
  manageToken?: string | null;
}

export const TOOL_DECLARATIONS: AIToolDeclaration[] = [
  {
    name: 'get_business_info',
    description:
      "The studio's name, address, phone number, website and opening hours. Call this before answering anything about where the studio is, how to contact it, or when it is open.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_services',
    description:
      'Every treatment currently offered, with its length, price and id. Call this before naming or pricing any treatment. The id is what check_availability needs.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_staff',
    description:
      'The therapists currently working and which treatments each of them does. Call this before naming a therapist.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'check_availability',
    description:
      'The times that are actually free for one treatment on one date. This is the only source of bookable times; never suggest a time this has not returned.',
    parameters: {
      type: 'object',
      properties: {
        service_id: {
          type: 'string',
          description: 'The id of the treatment, exactly as returned by get_services.',
        },
        date: {
          type: 'string',
          description: 'The calendar date to check, as YYYY-MM-DD.',
        },
        staff_name: {
          type: 'string',
          description:
            'Optional. The name of a therapist, exactly as returned by get_staff. Leave it out unless the guest asked for someone in particular.',
        },
      },
      required: ['service_id', 'date'],
    },
  },
  {
    name: 'get_booking',
    // No parameters, and that is the security property rather than an
    // omission — see ToolContext.manageToken. The model asks "what is the
    // booking this customer is holding"; it cannot ask about any other.
    description:
      "The appointment this guest is currently holding, if they opened their booking link. Returns the treatment, date, time, therapist and status, never their name, phone number or link. Call it before discussing an existing booking, and do not guess any of these details.",
    parameters: { type: 'object', properties: {}, required: [] },
  },
];

// ---------------------------------------------------------------------------
// get_business_info
// ---------------------------------------------------------------------------

/**
 * Opening hours as all seven days, with closed days stated rather than missing.
 *
 * `getOpeningHours` returns only the days somebody works, which is right for
 * rendering a list and wrong for a model: absence of a row would otherwise be
 * read as "no information" and answered as "yes, we're open".
 */
function everyDay(hours: { day: number; opens: string; closes: string }[]): OpeningHoursDay[] {
  return DAY_NAMES.map((day, index) => {
    const match = hours.find((entry) => entry.day === index);
    return match
      ? { day, closed: false, opens: match.opens, closes: match.closes }
      : { day, closed: true };
  });
}

export async function getBusinessInfo(context: ToolContext): Promise<BusinessInfo> {
  const business = await getBusiness(context.businessId);
  if (!business) throw new Error('no business row');

  const hours = await getOpeningHours(business.id);

  return {
    name: business.name,
    address: business.address,
    // Display form, the same one the footer and the contact page show, so a
    // number read out by the assistant matches the number on the site.
    phone: formatPhoneForDisplay(business.phone),
    website: process.env.NEXT_PUBLIC_SITE_URL ?? '',
    opening_hours: everyDay(hours),
    timezone: business.timezone,
  };
}

// ---------------------------------------------------------------------------
// get_services
// ---------------------------------------------------------------------------

/**
 * Which services require a room or a chair — asked as "are there any
 * `service_resources` rows", never "are any resources active".
 *
 * That distinction is the whole of the §6 correction: a service whose only room
 * has been deactivated still REQUIRES a room, and reporting otherwise is how
 * one room came to be bookable without limit. This answer is about the
 * requirement, not about whether it can currently be met — availability is what
 * answers that, and it makes the same distinction.
 */
async function resourceRequirements(businessId: string): Promise<Set<string>> {
  const rows = await query<{ service_id: string }>(
    `select distinct sr.service_id
       from service_resources sr
       join services s on s.id = sr.service_id
      where s.business_id = $1`,
    [businessId],
  );
  return new Set(rows.map((row) => row.service_id));
}

export async function getServices(
  context: ToolContext,
): Promise<{ services: ServiceInfo[] }> {
  const [services, requiresResource] = await Promise.all([
    getActiveServices(context.businessId),
    resourceRequirements(context.businessId),
  ]);

  return {
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
      description: service.description,
      duration_minutes: service.duration_minutes,
      duration: formatDuration(service.duration_minutes),
      price_cents: service.price_cents,
      price: formatZar(service.price_cents),
      // `getActiveServices` filters on `active`, so this is always true. It is
      // stated anyway: a field that is present and true cannot be mistaken for
      // a field that was forgotten.
      active: true,
      requires_resource: requiresResource.has(service.id),
      // Turnaround is deliberately absent. It is calendar occupancy, not part
      // of the appointment, and the customer is shown the treatment length
      // (§4). Handing the model both invites it to quote the wrong one.
    })),
  };
}

// ---------------------------------------------------------------------------
// get_staff
// ---------------------------------------------------------------------------

export async function getStaff(
  context: ToolContext,
): Promise<{ staff: StaffInfo[] }> {
  // Columns are listed explicitly rather than `s.*`. `staff` also holds phone,
  // email and the Phase 3 Google refresh token; a `select *` here would put all
  // of them one careless spread away from the model's context.
  const rows = await query<{ name: string; service_name: string | null }>(
    `select s.name, sv.name as service_name
       from staff s
       left join staff_services ss on ss.staff_id = s.id
       left join services sv on sv.id = ss.service_id and sv.active
      where s.business_id = $1
        and s.active
      order by s.name, sv.sort_order, sv.name`,
    [context.businessId],
  );

  const byName = new Map<string, StaffInfo>();
  for (const row of rows) {
    const entry = byName.get(row.name) ?? { name: row.name, active: true as const, services: [] };
    if (row.service_name) entry.services.push(row.service_name);
    byName.set(row.name, entry);
  }

  return { staff: [...byName.values()] };
}

// ---------------------------------------------------------------------------
// check_availability
// ---------------------------------------------------------------------------

export type AvailabilityOutcome =
  | { ok: true; data: { date: string; service: string; servicePrice?: string; slots: { time: string }[] }; client: AvailabilityAttachment }
  | { ok: false; error: 'not_found' | 'out_of_range'; message: string };

export async function checkAvailability(
  context: ToolContext,
  args: CheckAvailabilityArgs,
): Promise<AvailabilityOutcome> {
  const now = context.now ?? new Date();

  const business = await getBusiness(context.businessId);
  if (!business) throw new Error('no business row');

  // A uuid that parses is not a uuid that exists. The model can carry an id
  // from an earlier conversation, or invent a well-formed one.
  const service = await getService(args.service_id);
  if (!service || !service.active || service.business_id !== context.businessId) {
    return {
      ok: false,
      error: 'not_found',
      message: 'No treatment with that id is currently offered. Call get_services and use an id from it.',
    };
  }

  // The engine returns [] for a date outside the booking window, which is
  // correct but tells the model nothing. Naming the window lets it say when the
  // diary opens instead of "nothing free".
  const rangeError = dateWindowError(args.date, business.timezone, business.max_advance_days, now);
  if (rangeError) return { ok: false, error: 'out_of_range', message: rangeError };

  const staff = await getActiveStaff(context.businessId);

  let staffId: string | null = null;
  if (args.staff_name) {
    const requested = args.staff_name.trim().toLowerCase();
    const matches = staff.filter((member) => member.name.trim().toLowerCase() === requested);
    if (matches.length !== 1) {
      return {
        ok: false,
        error: 'not_found',
        message:
          matches.length === 0
            ? 'No therapist is working under that name. Call get_staff and use a name from it, or leave staff_name out to check everyone.'
            : 'More than one therapist goes by that name. Leave staff_name out to check everyone.',
      };
    }
    staffId = matches[0].id;
  }

  // §6, unmodified. Everything the engine enforces is enforced here because it
  // IS the engine: turnaround, minimum notice, closed days, blocks, resource
  // contention, and zero slots for a service whose every room is inactive.
  const slots = await getAvailableSlots({
    businessId: context.businessId,
    serviceId: service.id,
    date: args.date,
    staffId,
    now,
  });

  const staffNames = new Map(staff.map((member) => [member.id, member.name]));

  // ONE engine call, TWO projections. See the note on ToolResult.
  //
  // The model gets a label and a name. The client gets the instant and the
  // resolved staff id, because it is the client that has to be able to say
  // "that one" later without anything having to resolve a display name a
  // second time. `resourceId` is in neither: POST /api/bookings does not accept
  // one and should not — §7 step 4 re-resolves the room under the advisory
  // lock, and the room can go between this answer and the customer tapping.
  const resolved = slots.map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    time: formatSlotLabel(slot.startsAt, business.timezone),
    staffName: staffNames.get(slot.staffId) ?? '',
    staffId: slot.staffId,
  }));

  return {
    ok: true,
    data: {
      // Model projection: what the assistant needs to answer. No therapist
      // names (the UI labels show them), no sample-data warnings (the banner
      // and cards show them). The model physically cannot repeat what it never
      // received.
      date: args.date,
      service: service.name,
      servicePrice: formatZar(service.price_cents),
      slots: resolved.map((slot) => ({ time: slot.time })),
    },
    client: {
      kind: 'availability',
      serviceId: service.id,
      serviceName: service.name,
      servicePrice: formatZar(service.price_cents),
      date: args.date,
      timezone: business.timezone,
      // True only when the customer named someone. Otherwise the resolved id is
      // just whoever sorted first among the free, and pinning it would turn an
      // indifferent customer into a 409.
      staffPinned: staffId !== null,
      options: resolved,
    },
  };
}

function dateWindowError(
  date: IsoDate,
  timezone: string,
  maxAdvanceDays: number,
  now: Date,
): string | null {
  const daysOut = daysBetween(todayInZone(timezone, now), date);
  if (daysOut < 0) return 'That date has already passed.';
  if (daysOut > maxAdvanceDays) {
    return `The diary only opens ${maxAdvanceDays} days ahead, so that date cannot be checked yet.`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

/**
 * Run one tool call.
 *
 * Validation happens here, before any tool sees an argument, so no tool takes
 * `unknown` and none of them can read a raw value by accident.
 *
 * Nothing throws out of this function. A tool failing is a normal event — the
 * database can be slow, the model can invent an id — and the answer to all of
 * them is a result the model can read and recover from. An exception here would
 * become a 500 on a page whose booking flow is working perfectly well.
 */
export async function executeTool(
  name: unknown,
  rawArgs: unknown,
  context: ToolContext,
): Promise<ToolResult> {
  const toolName = typeof name === 'string' ? name : 'unknown';

  const validated = validateToolCall(name, rawArgs);
  if (!validated.ok) {
    return { ok: false, tool: toolName, error: validated.error, message: validated.message };
  }

  try {
    switch (validated.tool) {
      case 'get_business_info':
        return { ok: true, tool: validated.tool, data: await getBusinessInfo(context) };
      case 'get_services': {
        const services = await getServices(context);
        return {
          ok: true,
          tool: validated.tool,
          /**
           * Model projection: name, price and length. NOT the sample-data
           * warning, which the banner and the cards already carry.
           *
           * The price is here because it was once removed, and production
           * answered "how much is a Hollywood wax?" with *"the prices aren't
           * showing in what I pulled up. I'm sorry"* — while the card beside it
           * displayed R180. That is the single most common question a salon
           * gets, and a model that cannot answer it reads as broken however
           * good the cards are.
           *
           * Removing it was aimed at a real problem: the assistant reciting the
           * whole menu underneath cards that already showed it. But that is a
           * cosmetic fault and this is a functional one, and the recital is
           * better handled where it was always going to be handled — the
           * system prompt's "give a one-line summary and let the UI do the
           * rest", which a model holding one price can obey exactly.
           *
           * `check_availability` already returns `servicePrice` for the same
           * reason, so leaving this one stripped was also inconsistent.
           */
          data: {
            services: services.services.map((s) => ({
              id: s.id,
              name: s.name,
              description: s.description,
              price: s.price,
              duration: s.duration,
            })),
          },
          client: {
            kind: 'services',
            services: services.services.map((service) => ({
              id: service.id,
              name: service.name,
              description: service.description,
              durationMinutes: service.duration_minutes,
              duration: service.duration,
              priceCents: service.price_cents,
              price: service.price,
            })),
          },
        };
      }
      case 'get_staff': {
        const staff = await getStaff(context);
        return {
          ok: true,
          tool: validated.tool,
          // Model projection: names and services only. No sample-data warnings.
          data: { staff: staff.staff.map((s) => ({ name: s.name, services: s.services })) },
        };
      }
      case 'check_availability': {
        const outcome = await checkAvailability(context, validated.args as CheckAvailabilityArgs);
        return outcome.ok
          ? { ok: true, tool: validated.tool, data: outcome.data, client: outcome.client }
          : { ok: false, tool: validated.tool, error: outcome.error, message: outcome.message };
      }
      case 'get_booking': {
        const outcome = await getBooking(context);
        return outcome.ok
          ? { ok: true, tool: validated.tool, data: outcome.data, client: outcome.client }
          : { ok: false, tool: validated.tool, error: outcome.error, message: outcome.message };
      }
    }
  } catch (error) {
    // Operational facts only — spec v2 §9.5. The tool name and the error's own
    // message, never the arguments, the conversation or any row that was read.
    console.error('[ai] tool failed', {
      tool: validated.tool,
      message: error instanceof Error ? error.message : 'unknown error',
    });
    return {
      ok: false,
      tool: validated.tool,
      error: 'unavailable',
      message: 'That information could not be looked up just now.',
    };
  }
}

// ---------------------------------------------------------------------------
// get_booking — the only booking tool the MODEL may call, and it is read-only
// ---------------------------------------------------------------------------

/**
 * Split one appointment row into the two things that may see it.
 *
 * ---------------------------------------------------------------------------
 * THE SAME SPLIT AS check_availability, FOR THE SAME REASON, AND HERE IT IS
 * LOAD-BEARING RATHER THAN MERELY TIDY.
 *
 * `AppointmentDetail` joins `customers` and carries `customer_name`,
 * `customer_phone`, `customer_email` and `manage_token`. Handing it to the
 * model would put a customer's phone number and a working credential into a
 * third party's request logs, permanently, and no amount of prompt discipline
 * takes it back out.
 *
 * `view` is what the model gets: enough to talk about the appointment, nothing
 * that identifies who holds it. `card` is what the browser gets — the same row,
 * with the details the customer already knows about themselves.
 * ---------------------------------------------------------------------------
 */
function projectBooking(
  appointment: AppointmentDetail,
  now: Date,
): { view: BookingView; card: BookingCard } {
  const startsAt = new Date(appointment.starts_at);
  const date = utcToZonedDate(startsAt, appointment.business_timezone);
  const time = formatSlotLabel(startsAt, appointment.business_timezone);

  // The same rule lib/booking.ts applies when the customer actually tries, so
  // the assistant cannot offer a change the write path is about to refuse.
  const canChange =
    ['pending', 'confirmed'].includes(appointment.status) &&
    now.getTime() <= startsAt.getTime() - appointment.min_notice_minutes * 60_000;

  return {
    view: {
      service: appointment.service_name,
      date,
      time,
      with: appointment.staff_name,
      status: appointment.status,
      can_change: canChange,
    },
    card: {
      appointmentId: appointment.id,
      serviceName: appointment.service_name,
      date,
      time,
      startsAt: startsAt.toISOString(),
      staffName: appointment.staff_name,
      status: appointment.status,
      price: formatZar(appointment.price_cents_at_booking),
      manageUrl: `/b/${appointment.manage_token}`,
      canChange,
    },
  };
}

export type BookingOutcome =
  | { ok: true; data: BookingView; client: BookingAttachment }
  | { ok: false; error: 'no_booking_held' | 'not_found'; message: string };

export async function getBooking(
  context: ToolContext,
  options: { justBooked?: boolean } = {},
): Promise<BookingOutcome> {
  if (!context.manageToken) {
    return {
      ok: false,
      error: 'no_booking_held',
      // Phrased for the model to relay. There is no lookup by name or phone
      // anywhere in this system and there must not be one: the token is the
      // only ownership proof, and guessing "which appointment is yours" from a
      // name is how one customer gets handed another's.
      message:
        'This guest has not opened a booking link, so there is no appointment to read. Ask them to open the link from their confirmation message.',
    };
  }

  const appointment = await getAppointmentByToken(context.manageToken);
  if (!appointment || appointment.business_id !== context.businessId) {
    return { ok: false, error: 'not_found', message: 'That booking could not be found.' };
  }

  const { view, card } = projectBooking(appointment, context.now ?? new Date());
  return {
    ok: true,
    data: view,
    client: { kind: 'booking', booking: card, justBooked: options.justBooked ?? false },
  };
}

// ---------------------------------------------------------------------------
// The write tools
// ---------------------------------------------------------------------------

/**
 * ===========================================================================
 * NONE OF THESE IS DECLARED TO THE MODEL. See the note above TOOL_NAMES.
 *
 * Each one is executed by the server after the customer has tapped an explicit
 * confirmation, and each calls the existing transaction in lib/booking.ts. None
 * of them writes SQL: the advisory lock, the in-transaction idempotency check,
 * the availability re-check, the exclusion constraints, the SQLSTATE handling,
 * the customer upsert, the manage token, the audit row and the post-commit
 * email all already exist, are all required, and are none of this file's
 * business to reimplement.
 * ===========================================================================
 */

/**
 * Alternatives after a clash, in the SAME projection as check_availability.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FUNCTION EXISTS AT ALL
 *
 * `createBooking` and `rescheduleBooking` both return a fresh `Slot[]` with a
 * 409 (§5 step 8). Those slots come STRAIGHT OUT OF THE ENGINE — they have
 * never been through the split that `check_availability` applies, so they carry
 * a `staffId` that was resolved without reference to what the customer asked
 * for, and no display label.
 *
 * Rendering them raw would reintroduce, on the recovery path, precisely the
 * defect the split exists to prevent: a tapped alternative would carry a
 * therapist the customer never chose, turning "any therapist" into a pin and
 * producing a second clash where "Anyone" would have succeeded. It would only
 * ever appear under contention — two people booking the same slot — which is
 * the hardest condition to notice and the one where the customer is already
 * having a bad time.
 *
 * So the conflict path re-projects through exactly the same rules: the ISO
 * instant rather than a label to re-parse, and `staffId` carried only when the
 * customer actually named that therapist.
 * ---------------------------------------------------------------------------
 */
async function conflictAlternatives(options: {
  businessId: string;
  serviceId: string;
  serviceName: string;
  servicePrice: string;
  slots: { startsAt: Date; staffId: string }[];
  staffPinned: boolean;
  timezone: string;
  what: 'book' | 'reschedule';
}): Promise<ConflictAttachment> {
  const { businessId, serviceId, serviceName, servicePrice, slots, staffPinned, timezone, what } =
    options;
  const staff = await getActiveStaff(businessId);
  const staffNames = new Map(staff.map((member) => [member.id, member.name]));

  const options_: AvailabilityOption[] = slots.map((slot) => ({
    startsAt: slot.startsAt.toISOString(),
    time: formatSlotLabel(slot.startsAt, timezone),
    staffName: staffNames.get(slot.staffId) ?? '',
    staffId: slot.staffId,
  }));

  return {
    kind: 'conflict',
    what,
    serviceId,
    serviceName,
    servicePrice,
    date: slots[0] ? utcToZonedDate(slots[0].startsAt, timezone) : '',
    timezone,
    staffPinned,
    options: options_,
  };
}

export interface ConfirmedBooking {
  serviceId: string;
  startsAt: Date;
  /** null = "Anyone", exactly as /book sends it. */
  staffId: string | null;
  name: string;
  phone: string;
  email?: string | null;
  /** Minted once per confirmation by the client. See components/ai/chat-window. */
  idempotencyKey: string;
}

export type WriteOutcome =
  | { ok: true; data: Record<string, unknown>; client: BookingAttachment; appointmentId: string; replayed: boolean }
  | { ok: false; error: string; message: string; client?: ConflictAttachment };

/**
 * Book. Called ONLY after an explicit confirmation tap.
 *
 * Reports what the database said and never anything else — no optimistic
 * result, no "booking your appointment now". A booking exists when the
 * transaction has committed and not one moment earlier.
 */
export async function createBookingTool(
  context: ToolContext,
  confirmed: ConfirmedBooking,
): Promise<WriteOutcome> {
  const business = await getBusiness(context.businessId);
  if (!business) return { ok: false, error: 'unavailable', message: 'Booking is unavailable.' };

  const service = await getService(confirmed.serviceId);
  if (!service || !service.active || service.business_id !== context.businessId) {
    return { ok: false, error: 'unknown_service', message: 'That treatment is no longer offered.' };
  }

  const result = await createBooking({
    businessId: context.businessId,
    serviceId: confirmed.serviceId,
    staffId: confirmed.staffId,
    startsAt: confirmed.startsAt,
    name: confirmed.name,
    phone: confirmed.phone,
    email: confirmed.email ?? null,
    idempotencyKey: confirmed.idempotencyKey,
    source: 'web',
    now: context.now,
  });

  if (!result.ok) {
    if (result.error === 'slot_taken') {
      return {
        ok: false,
        error: 'slot_taken',
        message: result.message,
        client: await conflictAlternatives({
          businessId: context.businessId,
          serviceId: confirmed.serviceId,
          serviceName: service.name,
          servicePrice: formatZar(service.price_cents),
          slots: result.slots,
          staffPinned: confirmed.staffId !== null,
          timezone: business.timezone,
          what: 'book',
        }),
      };
    }
    return { ok: false, error: result.error, message: result.message };
  }

  const detail = await getAppointmentById(result.appointment.id);
  if (!detail) return { ok: false, error: 'unavailable', message: 'Booking is unavailable.' };

  const { view, card } = projectBooking(detail, context.now ?? new Date());
  return {
    ok: true,
    // `replayed` is deliberately not in what the model sees. A double tap is
    // one booking either way, and telling the model about the replay invites it
    // to explain a mechanism the customer never noticed.
    data: { booked: true, ...view },
    client: { kind: 'booking', booking: card, justBooked: true },
    appointmentId: result.appointment.id,
    replayed: result.replayed,
  };
}

/** Cancel. Ownership is the token in context; the notice rule lives in lib/booking.ts. */
export async function cancelBookingTool(context: ToolContext): Promise<WriteOutcome> {
  if (!context.manageToken) {
    return { ok: false, error: 'no_booking_held', message: 'There is no booking link for this guest.' };
  }

  const appointment = await getAppointmentByToken(context.manageToken);
  if (!appointment || appointment.business_id !== context.businessId) {
    return { ok: false, error: 'not_found', message: 'That booking could not be found.' };
  }

  // actor: 'customer' — so min_notice_minutes applies. The owner's exemption is
  // hers, in Admin, and must not be reachable from a public chat window.
  const result = await cancelBooking({
    appointmentId: appointment.id,
    actor: 'customer',
    now: context.now,
  });
  if (!result.ok) return { ok: false, error: result.error, message: result.message };

  const after = await getAppointmentById(appointment.id);
  const { view, card } = projectBooking(after ?? appointment, context.now ?? new Date());
  return {
    ok: true,
    data: { cancelled: true, ...view },
    client: { kind: 'booking', booking: card, justBooked: false },
    appointmentId: appointment.id,
    replayed: false,
  };
}

/** Move. Same engine, same constraints, same 409 projection as booking. */
export async function rescheduleBookingTool(
  context: ToolContext,
  confirmed: { startsAt: Date; staffId: string | null },
): Promise<WriteOutcome> {
  if (!context.manageToken) {
    return { ok: false, error: 'no_booking_held', message: 'There is no booking link for this guest.' };
  }

  const appointment = await getAppointmentByToken(context.manageToken);
  if (!appointment || appointment.business_id !== context.businessId) {
    return { ok: false, error: 'not_found', message: 'That booking could not be found.' };
  }

  const business = await getBusiness(context.businessId);
  if (!business) return { ok: false, error: 'unavailable', message: 'Booking is unavailable.' };

  const result = await rescheduleBooking({
    appointmentId: appointment.id,
    startsAt: confirmed.startsAt,
    staffId: confirmed.staffId,
    actor: 'customer',
    now: context.now,
  });

  if (!result.ok) {
    if (result.error === 'slot_taken') {
      return {
        ok: false,
        error: 'slot_taken',
        message: result.message,
        client: await conflictAlternatives({
          businessId: context.businessId,
          serviceId: appointment.service_id,
          serviceName: appointment.service_name,
          servicePrice: formatZar(appointment.price_cents_at_booking),
          slots: result.slots,
          staffPinned: confirmed.staffId !== null,
          timezone: business.timezone,
          what: 'reschedule',
        }),
      };
    }
    return { ok: false, error: result.error, message: result.message };
  }

  const detail = await getAppointmentById(result.appointment.id);
  if (!detail) return { ok: false, error: 'unavailable', message: 'Booking is unavailable.' };

  const { view, card } = projectBooking(detail, context.now ?? new Date());
  return {
    ok: true,
    data: { moved: true, ...view },
    client: { kind: 'booking', booking: card, justBooked: true },
    appointmentId: result.appointment.id,
    replayed: false,
  };
}
