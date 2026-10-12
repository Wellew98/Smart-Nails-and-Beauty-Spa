import { Text } from '@react-email/components';
import { CtaLink, SalonShell, Signoff } from './salon-layout';

/** 24h reminder mail: sent by the daily cron. Rows mirror the confirmation mail. */
export function ReminderEmail({
  serviceName,
  when,
  staffName,
  price,
  partySize,
  manageUrl,
  businessName,
  businessPhone,
}: {
  serviceName: string;
  when: string;
  staffName: string;
  price: string;
  partySize: number;
  manageUrl: string;
  businessName: string;
  businessPhone: string;
}) {
  return (
    <SalonShell preview={`Reminder: ${serviceName}, ${when}`} heading="See you soon">
      <Text style={{ margin: '0 0 4px', fontSize: '14px', lineHeight: 1.6 }}>Treatment: {serviceName}</Text>
      <Text style={{ margin: '0 0 4px', fontSize: '14px', lineHeight: 1.6 }}>When: {when}</Text>
      <Text style={{ margin: '0 0 4px', fontSize: '14px', lineHeight: 1.6 }}>With: {staffName}</Text>
      <Text style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
        Price: {price}
        {partySize > 1 ? ' each' : ''}
      </Text>
      <Text style={{ margin: '0 0 16px', fontSize: '14px', lineHeight: 1.6 }}>
        Running late or need to move it? <CtaLink href={manageUrl}>Manage your booking</CtaLink>.
      </Text>
      <Signoff businessName={businessName} businessPhone={businessPhone} />
    </SalonShell>
  );
}
