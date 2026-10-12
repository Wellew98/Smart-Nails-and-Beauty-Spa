import { ForgotForm } from '@/components/admin/forgot-form';
import { getBusiness } from '@/lib/public-data';

export const dynamic = 'force-dynamic';

export default async function ForgotPage() {
  const business = await getBusiness();

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-16">
      <p className="text-xs tracking-[0.22em] text-gilt-600 uppercase">{business?.name ?? 'Admin'}</p>
      <h1 className="font-display mt-3 text-3xl font-semibold text-aubergine-900">
        Reset password
      </h1>
      <p className="mt-2 text-sm text-mauve-500">
        For the staff account. No staff account is ever created here.
      </p>
      <ForgotForm />
    </div>
  );
}
