import { ResetForm } from '@/components/admin/reset-form';
import { getBusiness } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export default async function ResetPage() {
  const business = await getBusiness();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-16">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">{business?.name ?? 'Admin'}</p>
      <h1 className="font-display mt-3 text-3xl font-semibold text-aubergine-900">
        New password
      </h1>
      <p className="mt-2 text-sm text-mauve-500">Choose one the whole staff can keep.</p>
      <ResetForm />
    </div>
  );
}
