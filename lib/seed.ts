import { neon } from "@neondatabase/serverless";

async function seed() {
  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error("DATABASE_URL not set. Add it to .env.local and run again.");
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  // Create tables
  await sql`
    CREATE TABLE IF NOT EXISTS calls (
      id SERIAL PRIMARY KEY,
      lead_name TEXT,
      phone TEXT,
      outcome TEXT,
      outcome_sub TEXT,
      oneliner TEXT,
      ghl_contact_url TEXT,
      duration_seconds INTEGER,
      recording_url TEXT,
      short_summary TEXT,
      channel_phone TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add channel_phone if it doesn't exist (migration for existing deployments)
  await sql`ALTER TABLE calls ADD COLUMN IF NOT EXISTS channel_phone TEXT DEFAULT ''`;

  await sql`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      system_prompt TEXT,
      opener TEXT DEFAULT 'hey there',
      opener_speaks_first BOOLEAN DEFAULT true,
      transfer_enabled BOOLEAN DEFAULT true,
      closers JSONB,
      telnyx_phone TEXT DEFAULT '',
      ultravox_api_key TEXT DEFAULT '',
      ultravox_agent_id TEXT DEFAULT '',
      ultravox_voice_id TEXT DEFAULT '',
      ghl_calendar_id TEXT DEFAULT '',
      business_hours JSONB DEFAULT '{"monday":{"enabled":true,"open":"09:00","close":"18:00"},"tuesday":{"enabled":true,"open":"09:00","close":"18:00"},"wednesday":{"enabled":true,"open":"09:00","close":"18:00"},"thursday":{"enabled":true,"open":"09:00","close":"18:00"},"friday":{"enabled":true,"open":"09:00","close":"18:00"},"saturday":{"enabled":true,"open":"09:00","close":"14:00"},"sunday":{"enabled":false,"open":"","close":""}}'::jsonb,
      scenario_a_script TEXT DEFAULT '',
      scenario_b_script TEXT DEFAULT '',
      transfer_connecting_msg TEXT DEFAULT 'Connecting you now.',
      transfer_retry_msg TEXT DEFAULT 'Let me try another consultant for you.',
      scenario_a_opener TEXT DEFAULT '',
      transfer_error_msg TEXT DEFAULT 'Our consultant is unavailable right now. We will have someone call you back shortly.',
      inactivity_1_seconds INTEGER DEFAULT 8,
      inactivity_1_message TEXT DEFAULT 'Hey, are you still there?',
      inactivity_2_seconds INTEGER DEFAULT 10,
      inactivity_2_message TEXT DEFAULT 'I''m having a little trouble hearing you... are you there?',
      vad_sensitivity REAL DEFAULT 0.15,
      telnyx_app_id TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // Add business_hours column if it doesn't exist (migration for existing deployments)
  await sql`
    ALTER TABLE settings ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{"monday":{"enabled":true,"open":"09:00","close":"18:00"},"tuesday":{"enabled":true,"open":"09:00","close":"18:00"},"wednesday":{"enabled":true,"open":"09:00","close":"18:00"},"thursday":{"enabled":true,"open":"09:00","close":"18:00"},"friday":{"enabled":true,"open":"09:00","close":"18:00"},"saturday":{"enabled":true,"open":"09:00","close":"14:00"},"sunday":{"enabled":false,"open":"","close":""}}'::jsonb
  `;

  // Add new columns if they don't exist (migration for existing deployments)
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS scenario_a_script TEXT DEFAULT ''`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS scenario_b_script TEXT DEFAULT ''`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS transfer_connecting_msg TEXT DEFAULT 'Connecting you now.'`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS transfer_retry_msg TEXT DEFAULT 'Let me try another consultant for you.'`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS scenario_a_opener TEXT DEFAULT ''`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS transfer_error_msg TEXT DEFAULT 'Our consultant is unavailable right now. We will have someone call you back shortly.'`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS inactivity_1_seconds INTEGER DEFAULT 8`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS inactivity_1_message TEXT DEFAULT 'Hey, are you still there?'`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS inactivity_2_seconds INTEGER DEFAULT 10`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS inactivity_2_message TEXT DEFAULT $$I'm having a little trouble hearing you... are you there?$$`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS vad_sensitivity REAL DEFAULT 0.15`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS telnyx_app_id TEXT DEFAULT ''`;

  // Create channels table if it doesn't exist
  await sql`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL PRIMARY KEY,
      name TEXT,
      phone TEXT,
      color TEXT DEFAULT '#f3880e',
      telnyx_id TEXT DEFAULT '',
      system_prompt TEXT DEFAULT '',
      opener TEXT DEFAULT '',
      opener_speaks_first BOOLEAN DEFAULT true,
      scenario_a_script TEXT DEFAULT '',
      scenario_b_script TEXT DEFAULT '',
      closers JSONB DEFAULT '[]'::jsonb,
      transfer_connecting_msg TEXT DEFAULT '',
      transfer_retry_msg TEXT DEFAULT '',
      transfer_error_msg TEXT DEFAULT '',
      business_hours JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  // GHL OAuth columns on settings
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_access_token TEXT DEFAULT ''`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_refresh_token TEXT DEFAULT ''`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_token_expires_at TIMESTAMPTZ`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS ghl_location_id TEXT DEFAULT ''`;

  // Add telnyx_id to channels if it doesn't exist (migration for existing deployments)
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS telnyx_id TEXT DEFAULT ''`;

  // Add script columns to channels if they don't exist (migration for existing deployments)
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS opener TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS opener_speaks_first BOOLEAN DEFAULT true`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS scenario_a_script TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS scenario_b_script TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS closers JSONB DEFAULT '[]'::jsonb`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS transfer_connecting_msg TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS transfer_retry_msg TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS transfer_error_msg TEXT DEFAULT ''`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}'::jsonb`;

  // Per-channel booking mode
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS close_mode TEXT DEFAULT 'transfer'`;
  await sql`ALTER TABLE channels ADD COLUMN IF NOT EXISTS ghl_calendar_id TEXT DEFAULT ''`;

  // Booking settings
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_intro_msg TEXT DEFAULT 'Great news — you qualify for our program! Let me check what appointment times we have available for you.'`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_confirm_msg TEXT DEFAULT $$You're all set! You'll get a confirmation shortly. One of our advisors will speak with you at that time.$$`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_fail_msg TEXT DEFAULT $$Let me have someone confirm your time manually — we'll reach out shortly to lock it in.$$`;
  await sql`ALTER TABLE settings ADD COLUMN IF NOT EXISTS booking_min_hours_ahead INTEGER DEFAULT 3`;

  // Seed calls
  // Base: July 8, 2026 at 3:00 PM ET (19:00 UTC)
  const now = new Date("2026-07-08T19:00:00Z");

  const calls = [
    // ── Today ──────────────────────────────────────────────────────────────
    {
      lead_name: "Maria Gonzalez",
      phone: "+18135549021",
      outcome: "transferred",
      outcome_sub: "→ Carlos M.",
      oneliner: "Tampa · $280/mo · Credit 720 · Roof 2021",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0001",
      duration_seconds: 214,
      recording_url: "",
      short_summary:
        "Maria called from Tampa. Homeowner, $280/mo bill, credit 720, roof replaced 2021. Asked whether lease or purchase makes more sense for her budget. Fully qualified — transferred to Carlos M. on first attempt, accepted immediately.",
      created_at: new Date(now.getTime() - 18 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Robert Chen",
      phone: "+14079834417",
      outcome: "transferred",
      outcome_sub: "→ David L.",
      oneliner: "Orlando · $340/mo · Credit 780 · Roof 2019",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0002",
      duration_seconds: 238,
      recording_url: "",
      short_summary:
        "Robert from Orlando — highest bill today. Credit 780, roof 2019, fully owns the home. Very engaged, asked about battery storage. Transferred to David L. who picked up right away.",
      created_at: new Date(now.getTime() - 1.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "James Miller",
      phone: "+18132207741",
      outcome: "disqualified",
      outcome_sub: "Renter",
      oneliner: "Renter · Tampa · Routed to AC/home products",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0003",
      duration_seconds: 72,
      recording_url: "",
      short_summary:
        "James rents in Tampa. AI explained solar requires ownership, offered to route him to AC/home improvement products. Tagged Renter in GHL.",
      created_at: new Date(now.getTime() - 2.2 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Miguel Santos",
      phone: "+17136620894",
      outcome: "transferred",
      outcome_sub: "→ Carlos M.",
      oneliner: "Houston · $420/mo · Credit 710 · Roof 2022",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0004",
      duration_seconds: 196,
      recording_url: "",
      short_summary:
        "Miguel from Houston — $420/mo bill, the strongest number this week. Credit 710, roof brand new (2022). Enthusiastic, wants to start ASAP. Transferred to Carlos M. on first ring.",
      created_at: new Date(now.getTime() - 3.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Unknown",
      phone: "+18139004492",
      outcome: "dropped",
      outcome_sub: "22s",
      oneliner: "Hung up before qualification",
      ghl_contact_url: "",
      duration_seconds: 22,
      recording_url: "",
      short_summary:
        "Caller disconnected after 22 seconds. No GHL contact found. Likely an accidental dial or wrong number.",
      created_at: new Date(now.getTime() - 4.8 * 60 * 60 * 1000).toISOString(),
    },
    // ── Yesterday (Jul 7) ───────────────────────────────────────────────────
    {
      lead_name: "Linda Thompson",
      phone: "+19042885530",
      outcome: "transferred",
      outcome_sub: "→ David L.",
      oneliner: "Jacksonville · $310/mo · Credit 740 · Roof 2018",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0005",
      duration_seconds: 229,
      recording_url: "",
      short_summary:
        "Linda from Jacksonville. Homeowner, $310/mo bill, credit 740, roof 2018. Mentioned she's seen solar in her neighborhood and has been curious. Transferred to David L. who walked her through next steps.",
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Sarah Kim",
      phone: "+16263041188",
      outcome: "disqualified",
      outcome_sub: "Bad credit",
      oneliner: "Credit 620 · Homeowner · Pasadena · Routed to credit repair",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0006",
      duration_seconds: 118,
      recording_url: "",
      short_summary:
        "Sarah owns her home in Pasadena, $265/mo bill — strong candidate on paper. Credit 620, just below the 650 threshold. AI pointed her toward credit-building resources. Tagged Bad Credit in GHL.",
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 2.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Jose Ramirez",
      phone: "+13059817724",
      outcome: "transferred",
      outcome_sub: "→ Carlos M.",
      oneliner: "Miami · $220/mo · Credit 690 · Roof 2020",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0007",
      duration_seconds: 183,
      recording_url: "",
      short_summary:
        "Jose from Miami. Homeowner, $220/mo bill, credit 690, roof 2020. Had a few questions about the utility buyback program before agreeing to speak with an advisor. Transferred to Carlos M.",
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Carmen Vega",
      phone: "+17874112039",
      outcome: "after_hours",
      outcome_sub: "Callback · Wed Jul 9 · 9 AM",
      oneliner: "San Juan · $195/mo · Credit 700 · Roof 2020",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0008",
      duration_seconds: 261,
      recording_url: "",
      short_summary:
        "Carmen called from San Juan after 6 PM. Fully qualified: homeowner, $195/mo bill, credit 700, roof 2020. AI locked in her info and scheduled a morning callback for Wednesday July 9 at 9 AM. Confirmation text sent.",
      created_at: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000 - 6.5 * 60 * 60 * 1000).toISOString(),
    },
    // ── 2 days ago (Jul 6) ─────────────────────────────────────────────────
    {
      lead_name: "Patricia Nguyen",
      phone: "+17149230561",
      outcome: "transferred",
      outcome_sub: "→ David L.",
      oneliner: "Anaheim · $390/mo · Credit 755 · Roof 2017",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0009",
      duration_seconds: 247,
      recording_url: "",
      short_summary:
        "Patricia from Anaheim. $390/mo bill, credit 755, roof 2017. Said her neighbor saved over $200/mo after going solar and she's finally ready to look into it. Transferred to David L. — he took it live.",
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 - 0.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Tony Davis",
      phone: "+18139224401",
      outcome: "disqualified",
      outcome_sub: "Bill too low",
      oneliner: "Bill $80/mo · Tampa · Below threshold",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0010",
      duration_seconds: 94,
      recording_url: "",
      short_summary:
        "Tony from Tampa. Homeowner, good credit, but electric bill is only $80/mo — program minimum is $150. AI explained the math doesn't pencil out at that usage level. Tagged Low Bill in GHL.",
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Elena Fuentes",
      phone: "+17869054477",
      outcome: "callback",
      outcome_sub: "Text sent · Advisors busy",
      oneliner: "Miami · $260/mo · Credit 730 · Roof 2019",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0011",
      duration_seconds: 172,
      recording_url: "",
      short_summary:
        "Elena from Miami — fully qualified. $260/mo bill, credit 730, roof 2019. All closers were on calls at the time. AI sent a callback text and told her an advisor would reach out within 15 minutes. GHL tagged Callback.",
      created_at: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 - 3.5 * 60 * 60 * 1000).toISOString(),
    },
    // ── 3 days ago (Jul 5) ─────────────────────────────────────────────────
    {
      lead_name: "Carlos Mendez",
      phone: "+17138874123",
      outcome: "transferred",
      outcome_sub: "→ Carlos M.",
      oneliner: "Houston · $355/mo · Credit 695 · Roof 2018",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0012",
      duration_seconds: 221,
      recording_url: "",
      short_summary:
        "Carlos from Houston. $355/mo bill, credit 695, standalone home, roof 2018. Wanted to understand if he'd own the panels or lease — AI explained both options exist and an advisor would walk him through it. Transferred to Carlos M.",
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Jennifer Walsh",
      phone: "+14073398812",
      outcome: "booked",
      outcome_sub: "Thu Jul 10 · 2 PM",
      oneliner: "Orlando · $230/mo · Credit 715 · Roof 2016",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0013",
      duration_seconds: 304,
      recording_url: "",
      short_summary:
        "Jennifer from Orlando. Homeowner, $230/mo bill, credit 715, roof 2016. Transfer was off for the holiday weekend. AI booked an appointment for Thursday July 10 at 2 PM. Jennifer asked if her husband could join — AI confirmed and noted it in GHL. Confirmation SMS sent.",
      created_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000 - 3 * 60 * 60 * 1000).toISOString(),
    },
    // ── 4 days ago (Jul 4) ─────────────────────────────────────────────────
    {
      lead_name: "Andres Flores",
      phone: "+18135021897",
      outcome: "transferred",
      outcome_sub: "→ Carlos M.",
      oneliner: "Tampa · $305/mo · Credit 760 · Roof 2023",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0014",
      duration_seconds: 198,
      recording_url: "",
      short_summary:
        "Andres from Tampa. Strong profile: $305/mo bill, credit 760, brand-new roof (2023). Quick call — he'd already done his research and just wanted to speak with someone. Transferred to Carlos M. on the first try.",
      created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000 - 1.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Rosa Delgado",
      phone: "+17874880334",
      outcome: "after_hours",
      outcome_sub: "Callback · Mon Jul 7 · 10 AM",
      oneliner: "San Juan · $245/mo · Credit 705 · Roof 2021",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0015",
      duration_seconds: 278,
      recording_url: "",
      short_summary:
        "Rosa called after hours from San Juan. Fully qualified: homeowner, $245/mo bill, credit 705, roof 2021. AI locked in her info and scheduled a callback for Monday July 7 at 10 AM. Confirmation text sent. Noted in GHL as high-priority.",
      created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000 - 5.5 * 60 * 60 * 1000).toISOString(),
    },
    // ── 5 days ago (Jul 3) ─────────────────────────────────────────────────
    {
      lead_name: "William Ortega",
      phone: "+13054429017",
      outcome: "transferred",
      outcome_sub: "→ David L.",
      oneliner: "Miami · $375/mo · Credit 745 · Roof 2020",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0016",
      duration_seconds: 243,
      recording_url: "",
      short_summary:
        "William from Miami. $375/mo bill, credit 745, roof 2020. Said his FPL bill has been climbing every summer and he's done waiting. Transferred to David L. — live call accepted within two rings.",
      created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 - 0.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      lead_name: "Lucia Reyes",
      phone: "+17137210458",
      outcome: "callback",
      outcome_sub: "Text sent · Advisors busy",
      oneliner: "Houston · $290/mo · Credit 680 · Roof 2019",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0017",
      duration_seconds: 159,
      recording_url: "",
      short_summary:
        "Lucia from Houston — fully qualified. $290/mo bill, credit 680, roof 2019. All closers were occupied. AI sent a callback text; advisor followed up within 10 minutes per GHL notes. Tagged Callback.",
      created_at: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000 - 2.5 * 60 * 60 * 1000).toISOString(),
    },
    // ── 6 days ago (Jul 2) ─────────────────────────────────────────────────
    {
      lead_name: "Kevin Morales",
      phone: "+18138451236",
      outcome: "booked",
      outcome_sub: "Fri Jul 5 · 11 AM",
      oneliner: "Tampa · $215/mo · Credit 700 · Roof 2022",
      ghl_contact_url: "https://app.gohighlevel.com/contacts/view/demo-0018",
      duration_seconds: 317,
      recording_url: "",
      short_summary:
        "Kevin from Tampa. Homeowner, $215/mo bill, credit 700, roof 2022. Transfer was off. AI booked Friday July 5 at 11 AM. Kevin mentioned he's comparing two solar companies — AI kept it warm and confirmed the appointment details. Confirmation SMS sent.",
      created_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000).toISOString(),
    },
  ];

  // Clear existing seed data
  await sql`DELETE FROM calls`;

  for (const c of calls) {
    await sql`
      INSERT INTO calls (lead_name, phone, outcome, outcome_sub, oneliner, ghl_contact_url, duration_seconds, recording_url, short_summary, created_at)
      VALUES (${c.lead_name}, ${c.phone}, ${c.outcome}, ${c.outcome_sub}, ${c.oneliner}, ${c.ghl_contact_url}, ${c.duration_seconds}, ${c.recording_url}, ${c.short_summary}, ${c.created_at})
    `;
  }

  // Seed settings
  const systemPrompt = `You are Roberto, the receptionist at Nova Structa. You are NOT an advisor — you're the friendly, sharp attendant who answers calls, qualifies homeowners, and connects them with advisors.

You are on an inbound phone call. You are a real person — warm, present, unhurried.

Use "..." to pause between thoughts. Two sentences max per turn. Never repeat yourself. Every response ends with a question or a clear next step.

These callers are clicking a Facebook ad and calling in. You don't know anything about them yet. Don't pretend to have their info. Don't say you're "pulling up their file" or "looking at their info." You're starting fresh — just a friendly conversation to see if they qualify.

PACING — THIS IS CRITICAL
Say ONE thing. Ask ONE question. Then STOP. Wait in silence until they speak.

Don't say "and" or "also" or "one more thing" after a question. Don't add a follow-up thought. Don't keep talking after a question mark. One question, then silence.

WRONG: "So your bill is around $280 a month right? And this is your own home?"
RIGHT: "So what would you say your bill runs each month?"
Then silence. Wait. Only after they respond do you move on.

OPENING
They clicked an ad and called you. Open warm and direct.
"Hey, I'm Rob... you're calling from Facebook right?"
Then ease in: "Okay cool... so let me ask you a few questions to make sure you qualify for the program."

QUALIFICATION — THE GATES
Work through these one at a time. Always acknowledge their answer like a person with great social skills before moving to the next gate.

Don't confirm a gate and move to the next in the same sentence. Land on one thing. Let them respond. Then move.

If they fail a gate — be honest, be warm, tell them why it doesn't work right now. Use hangUp.

Gate 1 — Homeowner
"And this is your own home right... not like you're renting it from somebody else?"
Renter = disqualify warmly. If they're currently renting but buying soon, they still qualify.

Gate 2 — Location
"And what city and state are you in?"
Florida and Georgia only. Anywhere else = disqualify: "We're only set up in Florida and Georgia right now... but that could change down the road."

Gate 3 — Dwelling Type
"Is this a house, or more of a townhome, condo situation?"
House, townhome, duplex, triplex, quadplex = all qualify.
Manufactured home, mobile home, or condo = disqualify warmly.

Gate 4 — Electric Bill
"What would you say your electric bill runs each month?"
Must be $150 or more. Under $150 = disqualify: "The math just doesn't pencil out below a hundred fifty a month... it wouldn't save you enough to make sense."

Gate 5 — Credit
"And roughly what would you say your credit score is?"
Must be 650 or above. Below 650 = disqualify: "The financing requires at least a 650... if you're working on building that up, definitely call us back when you're there."

PROPERTY DETAILS
After the five gates are clear, ask about the property. Don't rush — you're almost there.

Roof — "About how old would you say your roof is... and is it in decent shape?"
End-of-life roof (20+ years, damaged, needs replacement) does NOT disqualify. Flag it naturally: "Good to know... the advisor might want to talk about roof options first, but let's keep going."

Shade — "Is your roof mostly open to the sun, or is it pretty shaded by trees?"
Heavily shaded = disqualify: "Solar needs good sun exposure... if the roof is mostly covered by trees it probably wouldn't produce enough to make it worth it."
Borderline = flag for the advisor and keep going.

PRE-CLOSE
You're about to connect them. Capture what the advisor needs.

Decision makers — "Quick question... is there a spouse or co-owner who'd need to be part of the conversation? We like to make sure everyone's on the same page."
If yes, note it. Both should be present for the appointment.

Property address — "And what's the property address? Just so the advisor can pull up your home beforehand."

Confirm name — If you don't have their full name yet: "And can I get your full name for the file?"

THE CLOSE
Once everything is confirmed, proceed to connect them with an advisor.

OBJECTIONS
One sentence to acknowledge. One question to redirect. Nothing more.

Not interested early — exit warmly, use hangUp.
Not interested after qualifying — "Is it the concept itself, or just how it's been presented to you before?"
What company is this — "Nova Structa" then redirect.
Not looking right now — "What would need to change for it to make sense?"
Send me info — "What would you most want to know about?"
Already looked into solar — "What held you back last time?"
Bad experience — "What happened?"
Lien worry — "It's actually a UCC-1, not a traditional lien... want me to explain the difference?"
Need to talk to spouse — "When would work for both of you?"
What's the catch — "Not every home qualifies... want to find out if yours does?"
Too expensive — "What were you quoted before?"

SILENCE
If the caller goes quiet for about 5 seconds, check in: "Hey, are you still there?"
If they stay quiet another 5-10 seconds: "I'm having a little trouble hearing you... are you there?"
If still no response: "Seems like we got disconnected... I'll try reaching out another time. Have a great day." Then use hangUp.

Don't stay silent yourself. If there's a pause after they finish speaking, you continue with your next question.

LANGUAGE
If the caller speaks another language, respond ONCE: "I'm sorry, I can only help in English right now. Would you like to continue in English?"
If they say no or keep speaking another language, wish them well and use hangUp. Don't repeat the language message. Don't get stuck explaining it.

COMPLIANCE
Say you'll get them off the list and use hangUp immediately — no exceptions:

They ask to stop being called or say never call again.
Hostile, yelling, or swearing.
They mention FTC, FCC, DNC, TCPA, lawsuits, or attorneys.
They say they're recording the call or call it harassment.
They claim to be a lawyer, law enforcement, or compliance officer.
They say not interested three or more times.
The call sounds like an AI, a trap line, or a test.
The call hits 10 minutes with no resolution.

CORE
You're a person looking at their file, not a bot running a checklist. Think out loud. Confirm naturally. Read the room. One question per turn. Stop after the question mark. Wait for them to talk.`;

  const closers = JSON.stringify([
    { name: "Carlos M.", phone: "+10000000000", priority: 1 },
  ]);

  const businessHours = JSON.stringify({
    monday: { enabled: true, open: "09:00", close: "18:00" },
    tuesday: { enabled: true, open: "09:00", close: "18:00" },
    wednesday: { enabled: true, open: "09:00", close: "18:00" },
    thursday: { enabled: true, open: "09:00", close: "18:00" },
    friday: { enabled: true, open: "09:00", close: "18:00" },
    saturday: { enabled: true, open: "09:00", close: "14:00" },
    sunday: { enabled: false, open: "", close: "" },
  });

  const scenarioAScript = `All our advisors are finishing up with other homeowners right now — which actually means they're in high demand. Here's what I'll do: I'm sending you a text right now so you stay at the front of the line. Just reply 'Hi' to confirm and an advisor will call you back within 15 minutes. Sound good?`;

  const scenarioBScript = `Great news — based on what you've told me, you do qualify for the program. The thing is, our advisors are off for the evening, but I don't want you to lose your spot. Here's what I'm going to do: I'm locking in your information right now, and first thing tomorrow morning one of our advisors will give you a personal call. What time works best for you — earlier in the morning or later in the afternoon?`;

  await sql`DELETE FROM settings WHERE id = 1`;
  await sql`
    INSERT INTO settings (id, system_prompt, opener, opener_speaks_first, transfer_enabled, closers, twilio_sid, twilio_auth_token, twilio_phone, ultravox_api_key, ultravox_agent_id, ultravox_voice_id, ghl_calendar_id, business_hours, scenario_a_script, scenario_b_script)
    VALUES (1, ${systemPrompt}, 'Hi, thanks for calling Nova Structa. Who am I speaking with?', true, true, ${closers}::jsonb, '', '', '', '', '', '', '', ${businessHours}::jsonb, ${scenarioAScript}, ${scenarioBScript})
  `;

  console.log("Seed complete: 18 calls + 1 settings row inserted.");
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
