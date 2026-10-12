import { Text } from '@react-email/components';
import { CtaLink, SalonShell, Signoff } from './salon-layout';

/** Win-back mail: sent by the weekly cron to customers gone 14+ days. */
export function WinbackEmail({
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
    <SalonShell preview={`We miss you at ${businessName}`} heading={`We miss you, ${firstName}`}>
      <Text style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
        It has been a little while since your last visit. Your usual chair is still here, and
        booking takes under a minute.
      </Text>
      <CtaLink href={bookUrl}>Book your next visit</CtaLink>
      <Signoff businessName={businessName} businessPhone={businessPhone} />
    </SalonShell>
  );
}
