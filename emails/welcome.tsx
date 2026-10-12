import { Text } from '@react-email/components';
import { CtaLink, SalonShell, Signoff } from './salon-layout';

/** Welcome mail: sent by the Clerk user.created webhook. */
export function WelcomeEmail({
  firstName,
  bookUrl,
  businessName,
  businessPhone,
}: {
  firstName: string;
  bookUrl: string;
  businessName: string;
  businessPhone: string;
}) {
  return (
    <SalonShell preview={`Welcome to ${businessName}`} heading={`Welcome, ${firstName}`}>
      <Text style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
        Your account is ready. Book in under a minute, see your visits any time, and get a
        reminder before every appointment.
      </Text>
      <CtaLink href={bookUrl}>Book your first visit</CtaLink>
      <Signoff businessName={businessName} businessPhone={businessPhone} />
    </SalonShell>
  );
}
