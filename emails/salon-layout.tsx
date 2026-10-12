import type { ReactNode } from 'react';
import { Body, Container, Head, Heading, Hr, Html, Preview, Text } from '@react-email/components';

/** Shared salon shell: same look as the booking mails (pink on cream). */
export function SalonShell({
  preview,
  heading,
  children,
}: {
  preview: string;
  heading: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ margin: 0, padding: '24px', background: '#fdf8f7', fontFamily: 'sans-serif', color: '#2a1626' }}>
        <Container style={{ maxWidth: '520px', margin: '0 auto', background: '#fff', borderRadius: '16px', padding: '28px' }}>
          <Heading style={{ margin: '0 0 16px', fontSize: '20px', fontWeight: 600 }}>{heading}</Heading>
          {children}
        </Container>
      </Body>
    </Html>
  );
}

export function Signoff({ businessName, businessPhone }: { businessName: string; businessPhone: string }) {
  return (
    <>
      <Hr style={{ margin: '16px 0 0', borderColor: '#f3e4ec' }} />
      <Text style={{ margin: '16px 0 0', fontSize: '12px', color: '#9b7f94' }}>
        {businessName} · {businessPhone}
      </Text>
    </>
  );
}

export function CtaLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Text style={{ margin: 0, fontSize: '14px', lineHeight: 1.6 }}>
      <a href={href} style={{ color: '#c2185b' }}>
        {children}
      </a>
    </Text>
  );
}
