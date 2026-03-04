import { Hono } from 'hono'
import { logger } from 'hono/logger'
import nodemailer from 'nodemailer'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST || 'mail.efemex.com'
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465')
const SMTP_SECURE = process.env.SMTP_SECURE !== 'false'
const SMTP_USER = process.env.SMTP_USER
const SMTP_PASS = process.env.SMTP_PASS
const SMTP_FROM = process.env.SMTP_FROM

if (!SMTP_USER || !SMTP_PASS || !SMTP_FROM) {
  console.error('SMTP_USER, SMTP_PASS, and SMTP_FROM are required')
  process.exit(1)
}

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  auth: {
    user: SMTP_USER,
    pass: SMTP_PASS,
  },
})

const NOTIFY_RECIPIENTS = process.env.NOTIFY_RECIPIENTS
  ? process.env.NOTIFY_RECIPIENTS.split(',').map(e => e.trim())
  : [
      'fred.lackey@gmail.com',
      'glenda.lackey@gmail.com',
      'info@briskhaven.com',
    ]

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono()

app.use('*', logger())

// Health check — standard BotBrain pattern
app.get('/health', (c) => {
  return c.json({
    name: 'botbrain-comingsoon',
    description: 'BotBrain Coming Soon landing page with waitlist signup',
    version: '0.1.0',
    serverDateTime: new Date().toISOString(),
  })
})

// Serve the coming-soon HTML page
app.get('/', async (c) => {
  const htmlPath = join(import.meta.dir, 'public', 'index.html')
  const html = await readFile(htmlPath, 'utf-8')
  return c.html(html)
})

// ---------------------------------------------------------------------------
// Waitlist signup endpoint
// ---------------------------------------------------------------------------

app.post('/api/v1/waitlist', async (c) => {
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ code: 'INVALID_BODY', message: 'Request body must be valid JSON' }, 400)
  }

  const { firstName, lastName, email, role, interest } = body

  // Validate required fields
  if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
    return c.json({ code: 'MISSING_FIRST_NAME', message: 'First name is required' }, 400)
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return c.json({ code: 'MISSING_EMAIL', message: 'A valid email address is required' }, 400)
  }

  // Build notification email HTML
  const emailHtml = buildNotificationEmail({
    firstName: firstName.trim(),
    lastName: (lastName || '').trim(),
    email: email.trim(),
    role: (role || '').trim(),
    interest: (interest || '').trim(),
  })

  try {
    await transporter.sendMail({
      from: `BotBrain Waiting List <${SMTP_FROM}>`,
      to: NOTIFY_RECIPIENTS.join(', '),
      subject: `BotBrain Waitlist: ${firstName.trim()} ${(lastName || '').trim()}`.trim(),
      html: emailHtml,
    })

    console.log(`Waitlist signup: ${firstName.trim()} <${email.trim()}>`)
    return c.json({ success: true })
  } catch (err) {
    console.error('SMTP send error:', err.message || err)
    return c.json({ code: 'EMAIL_FAILED', message: 'Failed to send notification email' }, 502)
  }
})

// ---------------------------------------------------------------------------
// Email template
// ---------------------------------------------------------------------------

function buildNotificationEmail({ firstName, lastName, email, role, interest }) {
  const fullName = [firstName, lastName].filter(Boolean).join(' ')

  const rows = [
    ['Name', fullName],
    ['Email', email],
  ]
  if (role) rows.push(['Role', role])
  if (interest) rows.push(['Interest', interest])

  const tableRows = rows
    .map(
      ([label, value]) =>
        `<tr>
          <td style="padding:8px 12px;font-weight:700;color:#6B5744;white-space:nowrap;vertical-align:top;">${label}</td>
          <td style="padding:8px 12px;color:#3D2C1E;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#FFF8F0;font-family:Arial,sans-serif;">
  <div style="max-width:560px;margin:32px auto;background:#FFFFFF;border:2px solid #3D2C1E;border-radius:16px;overflow:hidden;">
    <div style="background:#F97316;padding:20px 28px;">
      <h1 style="margin:0;font-size:20px;color:#FFFFFF;">New Waitlist Signup</h1>
    </div>
    <div style="padding:24px 28px;">
      <table style="width:100%;border-collapse:collapse;font-size:15px;">
        ${tableRows}
      </table>
      <hr style="border:none;border-top:1px dashed #E5D5C5;margin:20px 0;">
      <p style="font-size:13px;color:#6B5744;margin:0;">
        Submitted at ${new Date().toISOString()} via the BotBrain Coming Soon page.
      </p>
    </div>
  </div>
</body>
</html>`
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = parseInt(process.env.NODE_PORT ?? '4149')

export default { port, fetch: app.fetch }
