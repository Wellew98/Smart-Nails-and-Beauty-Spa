#!/usr/bin/env node
/**
 * Add the spa's domain to Resend and print the DNS records to paste into GoDaddy.
 *
 * Usage:
 *   RESEND_API_KEY=re_xxx node scripts/resend-setup.mjs
 *   RESEND_API_KEY=re_xxx node scripts/resend-setup.mjs --wait
 *
 * --wait keeps polling Resend until every record is verified, which is the only
 * proof that mail from bookings@ will actually be accepted.
 */

const DOMAIN = process.env.RESEND_DOMAIN || 'smartnailsandbeautyspa.co.za'
const KEY = process.env.RESEND_API_KEY
const REGION = process.env.RESEND_REGION || ''
const WAIT = process.argv.includes('--wait')

if (!KEY) {
  console.error('Missing RESEND_API_KEY. Create a key with Sending access at resend.com/api-keys.')
  process.exit(1)
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  })
  const text = await response.text()
  let body
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    body = { raw: text }
  }
  if (!response.ok) {
    const message = body?.message || body?.error || text || `HTTP ${response.status}`
    throw new Error(`${init.method || 'GET'} ${path} failed (${response.status}): ${message}`)
  }
  return body
}

function goDaddyName(name) {
  // GoDaddy stores the host relative to the domain, and accepts "@" for the root.
  if (!name) return '@'
  if (name === DOMAIN) return '@'
  return name.replace(new RegExp(`\\.?${DOMAIN.replace(/\./g, '\\.')}$`), '') || '@'
}

function printRecords(records) {
  const rows = records.map((record) => ({
    Type: record.type,
    Name: goDaddyName(record.name),
    Value: record.value,
    Priority: record.priority ?? '',
    TTL: record.ttl === 'auto' ? '1/2 hour' : record.ttl,
  }))

  console.log('\nGoDaddy > My Products > Domains > smartnailsandbeautyspa.co.za > DNS')
  console.log('Add each row below. Leave GoDaddy\'s own defaults alone; do not delete MX/SPF for the root.\n')
  for (const row of rows) {
    console.log(`  Type:     ${row.Type}`)
    console.log(`  Name:     ${row.Name}`)
    console.log(`  Value:    ${row.Value}`)
    if (row.Priority !== '') console.log(`  Priority: ${row.Priority}`)
    console.log(`  TTL:      ${row.TTL}`)
    console.log('')
  }
}

async function findDomain() {
  const { data } = await api('/domains')
  return (data || []).find((d) => d.name === DOMAIN) || null
}

async function main() {
  let domain = await findDomain()

  if (!domain) {
    const payload = { name: DOMAIN }
    if (REGION) payload.region = REGION
    domain = await api('/domains', { method: 'POST', body: JSON.stringify(payload) })
    console.log(`Added ${DOMAIN} to Resend (id ${domain.id}).`)
  } else {
    console.log(`${DOMAIN} is already in Resend (status: ${domain.status}).`)
  }

  let detail = await api(`/domains/${domain.id}`)
  printRecords(detail.records || [])

  if (!WAIT) {
    console.log(`Status: ${detail.status}. Re-run with --wait once the records are saved.`)
    return
  }

  console.log('Waiting for Resend to verify the records (Ctrl+C to stop)...')
  const deadline = Date.now() + 30 * 60 * 1000
  while (Date.now() < deadline) {
    detail = await api(`/domains/${domain.id}`)
    if (detail.status === 'verified') {
      console.log(`\nVerified. ${DOMAIN} can now send from bookings@${DOMAIN}.`)
      return
    }
    const pending = (detail.records || []).filter((r) => r.status !== 'verified')
    console.log(`  ${detail.status} - ${pending.length} record(s) still pending`)
    await new Promise((resolve) => setTimeout(resolve, 20000))
  }
  console.error('\nStill not verified after 30 minutes. Re-run --wait, or check the records in GoDaddy.')
  process.exit(1)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
