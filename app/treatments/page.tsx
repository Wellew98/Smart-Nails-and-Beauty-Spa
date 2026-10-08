import { redirect } from 'next/navigation';

/**
 * The GBP "Menu or services link" pointed here until 2026-10-08, when it was
 * moved to /prices after customers hit this 404. This redirect stays so any
 * cached Google copy or old link lands on the live price list instead of a
 * dead end. Same pattern as /services.
 */
export default function TreatmentsPage() {
  redirect('/prices');
}
