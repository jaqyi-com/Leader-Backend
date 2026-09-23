import React, { useEffect } from "react";

const DOCS_STYLE = `<style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0b0f1a;--surface:#111827;--surface2:#1a2133;--border:#1e2d45;--accent:#3b82f6;--accent2:#6366f1;--green:#10b981;--orange:#f59e0b;--red:#ef4444;--purple:#a855f7;--cyan:#06b6d4;--text:#e2e8f0;--muted:#64748b;--code-bg:#0d1117}
    html{scroll-behavior:smooth}
    body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);line-height:1.65;min-height:100vh}
    .layout{display:flex;min-height:100vh}
    /* SIDEBAR */
    .sidebar{width:270px;min-width:270px;background:var(--surface);border-right:1px solid var(--border);position:sticky;top:0;height:100vh;overflow-y:auto;padding:0 0 40px}
    .sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .sidebar-logo{padding:24px 20px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px}
    .logo-icon{width:34px;height:34px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:800;color:#fff;flex-shrink:0}
    .logo-text{font-size:15px;font-weight:700}.logo-sub{font-size:11px;color:var(--muted)}
    .nav-section{padding:18px 12px 4px}
    .nav-label{font-size:10px;font-weight:700;letter-spacing:1.2px;color:var(--muted);text-transform:uppercase;padding:0 8px 8px}
    .nav-item{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:7px;color:#94a3b8;font-size:13px;font-weight:500;text-decoration:none;transition:all .15s}
    .nav-item:hover,.nav-item.active{background:rgba(59,130,246,.12);color:var(--accent)}
    .nbadge{margin-left:auto;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:600}
    .bg{background:rgba(16,185,129,.15);color:var(--green)} .bp{background:rgba(245,158,11,.15);color:var(--orange)} .bm{background:rgba(99,102,241,.15);color:var(--accent2)}
    /* MAIN */
    .main{flex:1;overflow-y:auto;padding:0 0 80px}
    /* HERO */
    .hero{background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%);border-bottom:1px solid var(--border);padding:60px 60px 50px;position:relative;overflow:hidden}
    .hero::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 70% 50%,rgba(99,102,241,.12),transparent 60%);pointer-events:none}
    .live-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:var(--accent);font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;margin-bottom:18px}
    .hero h1{font-size:42px;font-weight:800;line-height:1.2;background:linear-gradient(135deg,#fff 30%,#818cf8);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:14px}
    .hero p{font-size:16px;color:#94a3b8;max-width:560px;line-height:1.7}
    .hero-meta{display:flex;gap:24px;margin-top:28px;flex-wrap:wrap}
    .hc{display:flex;align-items:center;gap:7px;font-size:13px;color:#94a3b8}.hc span{color:var(--text);font-weight:500}
    /* CONTENT */
    .content{padding:40px 60px;max-width:1020px}
    .section{margin-bottom:60px}
    .sec-title{font-size:22px;font-weight:700;margin-bottom:6px;display:flex;align-items:center;gap:10px}
    .sec-desc{font-size:14px;color:var(--muted);margin-bottom:24px}
    /* BASE URL */
    .base-banner{display:flex;align-items:center;gap:12px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.2);border-radius:10px;padding:14px 18px;margin-bottom:16px}
    .bl{font-size:12px;font-weight:700;color:var(--muted);min-width:80px}
    .bv{font-family:'JetBrains Mono',monospace;font-size:13.5px;color:var(--accent);background:rgba(59,130,246,.08);padding:4px 10px;border-radius:6px;flex:1}
    /* AUTH */
    .auth-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:22px 24px;margin-bottom:16px}
    .auth-card h3{font-size:15px;font-weight:700;margin-bottom:6px}.auth-card p{font-size:13px;color:var(--muted);margin-bottom:12px}
    /* FILTER BOX */
    .filter-box{background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin:14px 0}
    .filter-box h4{font-size:13px;font-weight:700;margin-bottom:12px}
    .fr{display:flex;gap:10px;align-items:flex-start;padding:7px 0;border-bottom:1px solid rgba(30,45,69,.4)}
    .fr:last-child{border-bottom:none}
    .fs{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--orange);min-width:90px}
    .fe{font-size:12.5px;color:#94a3b8}
    /* ENDPOINT */
    .endpoint{background:var(--surface);border:1px solid var(--border);border-radius:12px;margin-bottom:16px;overflow:hidden;transition:border-color .2s}
    .endpoint:hover{border-color:rgba(99,102,241,.35)}
    .ep-hdr{display:flex;align-items:center;gap:12px;padding:16px 20px;cursor:pointer;user-select:none}
    .mth{font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;padding:3px 9px;border-radius:5px;min-width:46px;text-align:center;letter-spacing:.5px}
    .get{background:rgba(16,185,129,.15);color:var(--green);border:1px solid rgba(16,185,129,.3)}
    .post{background:rgba(245,158,11,.15);color:var(--orange);border:1px solid rgba(245,158,11,.3)}
    .ep-path{font-family:'JetBrains Mono',monospace;font-size:13.5px;font-weight:500;flex:1}
    .ep-sum{font-size:12.5px;color:var(--muted);margin-left:auto}
    .chevron{color:var(--muted);font-size:12px;transition:transform .2s}
    .ep-hdr.open .chevron{transform:rotate(90deg)}
    .ep-body{display:none;border-top:1px solid var(--border)}
    .ep-body.open{display:block}
    .ep-tabs{display:flex;border-bottom:1px solid var(--border);padding:0 20px}
    .ep-tab{font-size:12px;font-weight:600;color:var(--muted);padding:10px 14px;cursor:pointer;border-bottom:2px solid transparent;transition:all .15s}
    .ep-tab:hover{color:var(--text)}.ep-tab.active{color:var(--accent);border-bottom-color:var(--accent)}
    .ep-panel{display:none;padding:20px}.ep-panel.active{display:block}
    /* PARAMS TABLE */
    .pt{width:100%;border-collapse:collapse;font-size:13px}
    .pt th{text-align:left;padding:8px 12px;color:var(--muted);font-weight:600;font-size:11px;letter-spacing:.6px;text-transform:uppercase;border-bottom:1px solid var(--border)}
    .pt td{padding:10px 12px;border-bottom:1px solid rgba(30,45,69,.5);vertical-align:top}
    .pt tr:last-child td{border-bottom:none}
    .pn{font-family:'JetBrains Mono',monospace;color:var(--cyan);font-size:12.5px}
    .pty{font-family:'JetBrains Mono',monospace;font-size:11.5px;color:var(--purple)}
    .req{font-size:10px;font-weight:700;color:var(--red);background:rgba(239,68,68,.1);padding:2px 6px;border-radius:4px}
    .opt{font-size:10px;font-weight:600;color:var(--muted);background:rgba(100,116,139,.1);padding:2px 6px;border-radius:4px}
    .pd{color:#94a3b8;font-size:12.5px;line-height:1.5}
    /* CODE BLOCK */
    .cb{background:var(--code-bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:4px}
    .ch{display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:rgba(255,255,255,.03);border-bottom:1px solid var(--border)}
    .cl{font-size:11px;color:var(--muted);font-weight:600;letter-spacing:.5px}
    .cpbtn{font-size:11px;color:var(--muted);background:none;border:none;cursor:pointer;padding:2px 8px;border-radius:4px;transition:all .15s}
    .cpbtn:hover{color:var(--text);background:rgba(255,255,255,.05)}
    pre{padding:16px 18px;overflow-x:auto;font-size:12.5px;font-family:'JetBrains Mono',monospace;line-height:1.65;color:#e2e8f0}
    pre::-webkit-scrollbar{height:4px} pre::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px}
    .kw{color:#c792ea}.str{color:#c3e88d}.num{color:#f78c6c}.key{color:#82aaff}.cmt{color:#546e7a;font-style:italic}
    /* RESPONSE FIELDS */
    .rf{display:flex;align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid rgba(30,45,69,.4)}
    .rf:last-child{border-bottom:none}
    .rfn{font-family:'JetBrains Mono',monospace;color:var(--cyan);font-size:12.5px;min-width:130px}
    .rft{font-family:'JetBrains Mono',monospace;color:var(--purple);font-size:11.5px;min-width:70px}
    .rfd{color:#94a3b8;font-size:12.5px}
    /* CALLOUT */
    .callout{display:flex;gap:12px;border-radius:10px;padding:14px 16px;margin:14px 0;font-size:13px;line-height:1.6}
    .info{background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.2);color:#94a3b8}
    .warn{background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.2);color:#94a3b8}
    .succ{background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.2);color:#94a3b8}
    .ci{font-size:16px;flex-shrink:0}
    /* STATUS TABLE */
    .chip{display:inline-block;font-size:11px;font-weight:600;padding:3px 9px;border-radius:5px}
    .cg{background:rgba(16,185,129,.12);color:var(--green)}.cb2{background:rgba(59,130,246,.12);color:var(--accent)}.co{background:rgba(245,158,11,.12);color:var(--orange)}.cr{background:rgba(239,68,68,.12);color:var(--red)}
    [id]{scroll-margin-top:20px}
    @media(max-width:900px){.sidebar{display:none}.hero,.content{padding-left:24px;padding-right:24px}.hero h1{font-size:28px}}
  </style>`;
const DOCS_HTML = `
<div class="layout">
<!-- SIDEBAR -->
<nav class="sidebar">
  <div class="sidebar-logo">
    <div class="logo-icon">D</div>
    <div><div class="logo-text">Doott API</div><div class="logo-sub">Data Reference v1.0</div></div>
  </div>
  <div class="nav-section">
    <div class="nav-label">Overview</div>
    <a class="nav-item" href="#start">🚀 Getting Started</a>
    <a class="nav-item" href="#auth">🔐 Authentication</a>
    <a class="nav-item" href="#filters">🔍 Filter System</a>
  </div>
  <div class="nav-section">
    <div class="nav-label">Data APIs</div>
    <a class="nav-item" href="#companies">🏢 Companies <span class="nbadge bg">GET</span></a>
    <a class="nav-item" href="#people">👤 People <span class="nbadge bg">GET</span></a>
    <a class="nav-item" href="#people-email">📧 People (Email) <span class="nbadge bg">GET</span></a>
    <a class="nav-item" href="#people-phone">📞 People (Phone) <span class="nbadge bg">GET</span></a>
  </div>
  <div class="nav-section">
    <div class="nav-label">Utilities</div>
    <a class="nav-item" href="#verify">✅ Email Verify <span class="nbadge bp">POST</span></a>
    <a class="nav-item" href="#auth-api">🔑 Auth <span class="nbadge bm">Mixed</span></a>
  </div>
  <div class="nav-section">
    <div class="nav-label">Reference</div>
    <a class="nav-item" href="#codes">📋 Status Codes</a>
    <a class="nav-item" href="#limits">⚡ Rate Limits</a>
  </div>
</nav>
<!-- MAIN -->
<main class="main">
  <!-- HERO -->
  <div class="hero">
    <div class="live-badge">● Live</div>
    <h1>Data Fetching API Reference</h1>
    <p>Programmatic access to Doott's lead intelligence platform — search, filter, and export millions of verified company and people records.</p>
    <div class="hero-meta">
      <div class="hc">⚡ <span>REST / JSON</span></div>
      <div class="hc">🗄️ <span>Cloud SQL (PostgreSQL)</span></div>
      <div class="hc">🚀 <span>Vector Search Enabled</span></div>
      <div class="hc">🔒 <span>JWT Bearer Auth</span></div>
    </div>
  </div>
  <div class="content">

  <!-- GETTING STARTED -->
  <div class="section" id="start">
    <div class="sec-title">🚀 Getting Started</div>
    <div class="sec-desc">Everything you need to make your first API call in under 2 minutes.</div>
    <div class="base-banner"><span class="bl">PRODUCTION</span><span class="bv">https://doott.jaqyi.com/api</span></div>
    <div class="base-banner"><span class="bl">LOCAL DEV</span><span class="bv" style="color:#64748b">http://localhost:3000/api</span></div>
    <div class="cb" style="margin-top:20px">
      <div class="ch"><span class="cl">QUICK START · cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre><span class="cmt"># 1. Login to get Bearer token</span>
curl -X POST https://doott.jaqyi.com/api/auth/login \
  -H <span class="str">"Content-Type: application/json"</span> \
  -d <span class="str">'{"email":"you@example.com","password":"yourpassword"}'</span>

<span class="cmt"># 2. Query companies with the returned token</span>
curl -G https://doott.jaqyi.com/api/final-companies \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  --data-urlencode <span class="str">"f_city=Mumbai"</span> \
  --data-urlencode <span class="str">"f_has_email=true"</span> \
  --data-urlencode <span class="str">"limit=25"</span></pre>
    </div>
  </div>

  <!-- AUTHENTICATION -->
  <div class="section" id="auth">
    <div class="sec-title">🔐 Authentication</div>
    <div class="sec-desc">All data endpoints require a Bearer JWT token in the Authorization header.</div>
    <div class="auth-card">
      <h3>Bearer Token (JWT)</h3>
      <p>Obtain a token via <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">POST /api/auth/login</code>. Attach it to every data request:</p>
      <div class="cb"><div class="ch"><span class="cl">HEADER</span></div>
      <pre>Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...</pre></div>
    </div>
    <div class="callout warn"><span class="ci">⚠️</span><div>Tokens are org-scoped. Never expose them in client-side code or public repos.</div></div>
  </div>

  <!-- FILTER SYSTEM -->
  <div class="section" id="filters">
    <div class="sec-title">🔍 Filter System</div>
    <div class="sec-desc">All data APIs share a unified filter system. Use <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">f_</code> prefix + column name + optional operator suffix as query params.</div>
    <div class="filter-box">
      <h4>Operator Suffixes</h4>
      <div class="fr"><span class="fs">(none)</span><span class="fe"><strong style="color:var(--text)">Contains</strong> — case-insensitive. Multi-word matches all tokens. e.g. <code style="color:var(--cyan)">f_industry=Food</code></span></div>
      <div class="fr"><span class="fs">_eq</span><span class="fe"><strong style="color:var(--text)">Exact match</strong> e.g. <code style="color:var(--cyan)">f_state_eq=Maharashtra</code></span></div>
      <div class="fr"><span class="fs">_sw</span><span class="fe"><strong style="color:var(--text)">Starts with</strong> e.g. <code style="color:var(--cyan)">f_city_sw=Mum</code></span></div>
      <div class="fr"><span class="fs">_ew</span><span class="fe"><strong style="color:var(--text)">Ends with</strong> e.g. <code style="color:var(--cyan)">f_website_ew=.com</code></span></div>
      <div class="fr"><span class="fs">_nonempty</span><span class="fe"><strong style="color:var(--text)">Field is not null/empty</strong> e.g. <code style="color:var(--cyan)">f_emails_nonempty=true</code></span></div>
      <div class="fr"><span class="fs">_empty</span><span class="fe"><strong style="color:var(--text)">Field is null/empty</strong> e.g. <code style="color:var(--cyan)">f_phone_empty=true</code></span></div>
    </div>
    <div class="callout info"><span class="ci">ℹ️</span><div>Filter keys are validated against live DB schema. Unknown columns are silently ignored — SQL injection is not possible.</div></div>
  </div>

  <!-- COMPANIES -->
  <div class="section" id="companies">
    <div class="sec-title">🏢 Companies Database</div>
    <div class="sec-desc">Query <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">final.companies</code> — millions of verified business records with contact details, location, and industry.</div>

    <!-- GET / -->
    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)">
        <span class="mth get">GET</span><span class="ep-path">/api/final-companies</span>
        <span class="ep-sum">Paginated company list with filters</span><span class="chevron">▶</span>
      </div>
      <div class="ep-body">
        <div class="ep-tabs">
          <div class="ep-tab active" onclick="sw(this,'p')">Parameters</div>
          <div class="ep-tab" onclick="sw(this,'e')">Example</div>
          <div class="ep-tab" onclick="sw(this,'r')">Response</div>
        </div>
        <div class="ep-panel active" data-tab="p">
          <table class="pt"><thead><tr><th>Parameter</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>
            <tr><td class="pn">page</td><td class="pty">integer</td><td><span class="opt">Optional</span></td><td class="pd">Page number (default: 1)</td></tr>
            <tr><td class="pn">limit</td><td class="pty">integer</td><td><span class="opt">Optional</span></td><td class="pd">Records per page, max 200 (default: 50)</td></tr>
            <tr><td class="pn">search</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Semantic / full-text search on business_name using vector embeddings</td></tr>
            <tr><td class="pn">sort_by</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Column name to sort by</td></tr>
            <tr><td class="pn">sort_dir</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd"><code>asc</code> or <code>desc</code> (default: asc)</td></tr>
            <tr><td class="pn">f_business_name</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Business name contains filter</td></tr>
            <tr><td class="pn">f_city</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">City filter (BTree indexed, fast prefix match)</td></tr>
            <tr><td class="pn">f_state</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">State / region filter</td></tr>
            <tr><td class="pn">f_pincode</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Exact pincode / ZIP code match</td></tr>
            <tr><td class="pn">f_industry</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Industry category contains filter</td></tr>
            <tr><td class="pn">f_domain</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Exact domain match (e.g. <code>acme.com</code>)</td></tr>
            <tr><td class="pn">f_website</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Website URL contains filter</td></tr>
            <tr><td class="pn">f_has_email</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd"><code>true</code> = only records with emails; <code>false</code> = without</td></tr>
            <tr><td class="pn">f_has_phone</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd"><code>true</code> = only records with phone numbers</td></tr>
            <tr><td class="pn">country</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd"><code>india</code> or <code>usa</code> — geographic pre-filter</td></tr>
          </tbody></table>
        </div>
        <div class="ep-panel" data-tab="e">
          <div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
          <pre><span class="cmt"># Mumbai food companies with verified emails</span>
curl -G https://doott.jaqyi.com/api/final-companies \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  --data-urlencode <span class="str">"f_city=Mumbai"</span> \
  --data-urlencode <span class="str">"f_industry=Food"</span> \
  --data-urlencode <span class="str">"f_has_email=true"</span> \
  --data-urlencode <span class="str">"limit=50"</span></pre></div>
          <div class="cb" style="margin-top:12px"><div class="ch"><span class="cl">JavaScript · fetch</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
          <pre><span class="kw">const</span> res = <span class="kw">await</span> fetch(
  <span class="str">\`https://doott.jaqyi.com/api/final-companies?\${new URLSearchParams({
    f_city:'Mumbai', f_industry:'Food', f_has_email:'true', limit:'50'
  })}\`</span>,
  { headers: { Authorization: <span class="str">\`Bearer \${token}\`</span> } }
);
<span class="kw">const</span> { records, total, pages } = <span class="kw">await</span> res.json();</pre></div>
        </div>
        <div class="ep-panel" data-tab="r">
          <div class="rf"><span class="rfn">records</span><span class="rft">array</span><span class="rfd">Company objects — all non-hidden DB columns returned</span></div>
          <div class="rf"><span class="rfn">total</span><span class="rft">integer</span><span class="rfd">Total matching count (capped at 100,001 for filtered queries)</span></div>
          <div class="rf"><span class="rfn">page</span><span class="rft">integer</span><span class="rfd">Current page</span></div>
          <div class="rf"><span class="rfn">pages</span><span class="rft">integer</span><span class="rfd">Total pages</span></div>
          <div class="rf"><span class="rfn">source</span><span class="rft">string</span><span class="rfd">Always <code>"cloud_sql"</code></span></div>
          <div class="cb" style="margin-top:16px"><div class="ch"><span class="cl">200 OK · JSON</span></div>
          <pre>{
  <span class="key">"records"</span>: [{
    <span class="key">"business_name"</span>: <span class="str">"Quirch Foods"</span>,
    <span class="key">"industry"</span>:      <span class="str">"Manufacturing"</span>,
    <span class="key">"phone"</span>:         <span class="str">"+13056913535"</span>,
    <span class="key">"emails"</span>:        <span class="str">"{brian.rumble@quirchfoods.com,john@quirchfoods.com}"</span>,
    <span class="key">"website"</span>:       <span class="str">"www.quirchfoods.com"</span>,
    <span class="key">"city"</span>:          <span class="str">"Medley"</span>, <span class="key">"state"</span>: <span class="str">"FL"</span>
  }],
  <span class="key">"total"</span>: <span class="num">12847</span>, <span class="key">"page"</span>: <span class="num">1</span>, <span class="key">"pages"</span>: <span class="num">257</span>, <span class="key">"source"</span>: <span class="str">"cloud_sql"</span>
}</pre></div>
        </div>
      </div>
    </div>

    <!-- helper endpoints -->
    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-companies/stats</span><span class="ep-sum">Total record count (Redis cached 5 min)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{ <span class="key">"total"</span>: <span class="num">5820000</span>, <span class="key">"source"</span>: <span class="str">"cloud_sql"</span>, <span class="key">"table"</span>: <span class="str">"companies"</span> }</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-companies/categories</span><span class="ep-sum">Top 100 industries with counts (cached 24h)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>[
  { <span class="key">"name"</span>: <span class="str">"Manufacturing"</span>, <span class="key">"count"</span>: <span class="num">420000</span> },
  { <span class="key">"name"</span>: <span class="str">"Food Production"</span>, <span class="key">"count"</span>: <span class="num">318000</span> }
]</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-companies/cities</span><span class="ep-sum">Top 500 cities with business counts (cached 6h)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{ <span class="key">"cities"</span>: [{ <span class="key">"name"</span>: <span class="str">"Mumbai"</span>, <span class="key">"state"</span>: <span class="str">"MH"</span>, <span class="key">"count"</span>: <span class="num">84200</span> }], <span class="key">"total"</span>: <span class="num">500</span> }</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-companies/columns</span><span class="ep-sum">List all queryable columns</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{ <span class="key">"columns"</span>: [<span class="str">"business_name"</span>, <span class="str">"industry"</span>, <span class="str">"phone"</span>, <span class="str">"emails"</span>, <span class="str">"website"</span>, <span class="str">"city"</span>, <span class="str">"state"</span>, <span class="str">"address"</span>, <span class="str">"pincode"</span>, ...], <span class="key">"table"</span>: <span class="str">"companies"</span> }</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-companies/health</span><span class="ep-sum">Database connectivity check</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{ <span class="key">"ok"</span>: <span class="kw">true</span>, <span class="key">"source"</span>: <span class="str">"cloud_sql"</span>, <span class="key">"serverTime"</span>: <span class="str">"2026-09-23T08:23:11Z"</span>, <span class="key">"totalRecords"</span>: <span class="num">5820000</span> }</pre></div></div></div>
    </div>
  </div>

  <!-- PEOPLE -->
  <div class="section" id="people">
    <div class="sec-title">👤 People Database</div>
    <div class="sec-desc">Query <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">final.people</code> — 43M+ individual contacts with job titles, emails, phones, and location.</div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people</span><span class="ep-sum">Paginated people list with filters</span><span class="chevron">▶</span></div>
      <div class="ep-body">
        <div class="ep-tabs">
          <div class="ep-tab active" onclick="sw(this,'p')">Parameters</div>
          <div class="ep-tab" onclick="sw(this,'e')">Example</div>
          <div class="ep-tab" onclick="sw(this,'r')">Response</div>
        </div>
        <div class="ep-panel active" data-tab="p">
          <table class="pt"><thead><tr><th>Parameter</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>
            <tr><td class="pn">page</td><td class="pty">integer</td><td><span class="opt">Optional</span></td><td class="pd">Page (default: 1)</td></tr>
            <tr><td class="pn">limit</td><td class="pty">integer</td><td><span class="opt">Optional</span></td><td class="pd">Max 200, default 50</td></tr>
            <tr><td class="pn">search</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Semantic search on full_name via vector embeddings</td></tr>
            <tr><td class="pn">sort_by / sort_dir</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Column + <code>asc</code>/<code>desc</code></td></tr>
            <tr><td class="pn">f_city</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">City (BTree indexed)</td></tr>
            <tr><td class="pn">f_state</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">State / region</td></tr>
            <tr><td class="pn">f_pincode</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Exact ZIP / pincode</td></tr>
            <tr><td class="pn">f_job_title</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Job title contains (e.g. <code>CEO</code>, <code>Founder</code>, <code>HR Manager</code>)</td></tr>
            <tr><td class="pn">f_location</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Free-text location contains</td></tr>
            <tr><td class="pn">f_has_email</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd"><code>true</code> = only people with emails</td></tr>
            <tr><td class="pn">f_has_phone</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd"><code>true</code> = only people with phone numbers</td></tr>
            <tr><td class="pn">country</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd"><code>india</code> or <code>usa</code></td></tr>
          </tbody></table>
        </div>
        <div class="ep-panel" data-tab="e">
          <div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
          <pre><span class="cmt"># CEOs in Bangalore with verified emails</span>
curl -G https://doott.jaqyi.com/api/final-people \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  --data-urlencode <span class="str">"f_job_title=CEO"</span> \
  --data-urlencode <span class="str">"f_city=Bangalore"</span> \
  --data-urlencode <span class="str">"f_has_email=true"</span> \
  --data-urlencode <span class="str">"country=india"</span> \
  --data-urlencode <span class="str">"limit=100"</span></pre></div>
        </div>
        <div class="ep-panel" data-tab="r">
          <div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
          <pre>{
  <span class="key">"records"</span>: [{
    <span class="key">"full_name"</span>:  <span class="str">"Rahul Sharma"</span>,
    <span class="key">"first_name"</span>: <span class="str">"Rahul"</span>,
    <span class="key">"last_name"</span>:  <span class="str">"Sharma"</span>,
    <span class="key">"job_title"</span>:  <span class="str">"CEO"</span>,
    <span class="key">"emails"</span>:     <span class="str">"{rahul@startup.in}"</span>,
    <span class="key">"phone"</span>:      <span class="str">"+919812345678"</span>,
    <span class="key">"city"</span>:       <span class="str">"Bangalore"</span>, <span class="key">"state"</span>: <span class="str">"Karnataka"</span>
  }],
  <span class="key">"total"</span>: <span class="num">43200000</span>, <span class="key">"page"</span>: <span class="num">1</span>, <span class="key">"pages"</span>: <span class="num">864000</span>
}</pre></div>
          <div class="callout info" style="margin-top:14px"><span class="ci">ℹ️</span><div><code>first_name</code> / <code>last_name</code> are auto-derived from <code>full_name</code> when not stored separately.</div></div>
        </div>
      </div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people/stats</span><span class="ep-sum">Total people count</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK</span></div>
      <pre>{ <span class="key">"total"</span>: <span class="num">43200000</span>, <span class="key">"source"</span>: <span class="str">"cloud_sql"</span>, <span class="key">"table"</span>: <span class="str">"people"</span> }</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people/categories</span><span class="ep-sum">Top 100 job titles with counts (cached 24h)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK</span></div>
      <pre>[
  { <span class="key">"name"</span>: <span class="str">"CEO"</span>, <span class="key">"count"</span>: <span class="num">1240000</span> },
  { <span class="key">"name"</span>: <span class="str">"Founder"</span>, <span class="key">"count"</span>: <span class="num">980000</span> }
]</pre></div></div></div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people/cities</span><span class="ep-sum">Top 500 cities by people count (cached 6h)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK</span></div>
      <pre>{ <span class="key">"cities"</span>: [{ <span class="key">"name"</span>: <span class="str">"New York"</span>, <span class="key">"state"</span>: <span class="str">"NY"</span>, <span class="key">"count"</span>: <span class="num">2400000</span> }], <span class="key">"total"</span>: <span class="num">500</span> }</pre></div></div></div>
    </div>
  </div>

  <!-- PEOPLE EMAIL -->
  <div class="section" id="people-email">
    <div class="sec-title">📧 People — Email Filtered</div>
    <div class="sec-desc">Identical to <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">/api/final-people</code> but pre-filtered — every record is guaranteed to have an email. Same params, same pagination.</div>
    <div class="callout succ"><span class="ci">✅</span><div>Every record returned has at least one non-empty verified email column.</div></div>
    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people-email</span><span class="ep-sum">People with verified email — paginated</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs">
        <div class="ep-tab active" onclick="sw(this,'e')">Example</div>
        <div class="ep-tab" onclick="sw(this,'r')">Response</div>
      </div>
      <div class="ep-panel active" data-tab="e"><div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre><span class="cmt"># India Founders with emails</span>
curl -G https://doott.jaqyi.com/api/final-people-email \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  --data-urlencode <span class="str">"f_job_title=Founder"</span> \
  --data-urlencode <span class="str">"country=india"</span> \
  --data-urlencode <span class="str">"limit=100"</span></pre></div></div>
      <div class="ep-panel" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{ <span class="key">"records"</span>: [{ <span class="key">"full_name"</span>: <span class="str">"Priya Mehta"</span>, <span class="key">"emails"</span>: <span class="str">"{priya@startup.in}"</span>, ... }], <span class="key">"total"</span>: <span class="num">8200000</span> }</pre></div></div>
      </div>
    </div>
  </div>

  <!-- PEOPLE PHONE -->
  <div class="section" id="people-phone">
    <div class="sec-title">📞 People — Phone Filtered</div>
    <div class="sec-desc">Identical to <code style="color:var(--cyan);font-family:'JetBrains Mono',monospace">/api/final-people</code> but pre-filtered — every record is guaranteed to have a phone number.</div>
    <div class="callout succ"><span class="ci">✅</span><div>Every record returned has at least one non-empty phone number column.</div></div>
    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/final-people-number</span><span class="ep-sum">People with phone number — paginated</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'e')">Example</div></div>
      <div class="ep-panel active" data-tab="e"><div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre>curl -G https://doott.jaqyi.com/api/final-people-number \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  --data-urlencode <span class="str">"f_job_title=HR Manager"</span> \
  --data-urlencode <span class="str">"f_city=Delhi"</span> \
  --data-urlencode <span class="str">"limit=50"</span></pre></div></div>
      </div>
    </div>
  </div>

  <!-- EMAIL VERIFY -->
  <div class="section" id="verify">
    <div class="sec-title">✅ Email Verification</div>
    <div class="sec-desc">Real-time email validation with 90-day Redis+Postgres caching. Supports single and bulk CSV verification.</div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth post">POST</span><span class="ep-path">/api/verify-email</span><span class="ep-sum">Verify a single email address</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs">
        <div class="ep-tab active" onclick="sw(this,'p')">Body</div>
        <div class="ep-tab" onclick="sw(this,'e')">Example</div>
        <div class="ep-tab" onclick="sw(this,'r')">Response</div>
      </div>
      <div class="ep-panel active" data-tab="p">
        <table class="pt"><thead><tr><th>Field</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>
          <tr><td class="pn">email</td><td class="pty">string</td><td><span class="req">Required</span></td><td class="pd">Email address to verify</td></tr>
          <tr><td class="pn">force_refresh</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd">Bypass 90-day cache and re-verify (default: false)</td></tr>
          <tr><td class="pn">skip_smtp</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd">Skip SMTP handshake — faster but less thorough</td></tr>
        </tbody></table>
      </div>
      <div class="ep-panel" data-tab="e"><div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre>curl -X POST https://doott.jaqyi.com/api/verify-email \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  -H <span class="str">"Content-Type: application/json"</span> \
  -d <span class="str">'{"email":"john@example.com"}'</span></pre></div></div>
      <div class="ep-panel" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{
  <span class="key">"email"</span>:       <span class="str">"john@example.com"</span>,
  <span class="key">"valid"</span>:       <span class="kw">true</span>,
  <span class="key">"deliverable"</span>: <span class="kw">true</span>,
  <span class="key">"disposable"</span>:  <span class="kw">false</span>,
  <span class="key">"mx_found"</span>:    <span class="kw">true</span>,
  <span class="key">"smtp_check"</span>:  <span class="kw">true</span>,
  <span class="key">"cached"</span>:      <span class="kw">false</span>
}</pre></div></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth post">POST</span><span class="ep-path">/api/verify-email/batch</span><span class="ep-sum">Bulk verify — CSV upload or JSON list (async job)</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs">
        <div class="ep-tab active" onclick="sw(this,'p')">Body</div>
        <div class="ep-tab" onclick="sw(this,'e')">Example</div>
        <div class="ep-tab" onclick="sw(this,'r')">Response</div>
      </div>
      <div class="ep-panel active" data-tab="p">
        <table class="pt"><thead><tr><th>Field</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>
          <tr><td class="pn">file</td><td class="pty">File</td><td><span class="opt">Option A</span></td><td class="pd">CSV file upload via multipart/form-data (max 25 MB)</td></tr>
          <tr><td class="pn">emails</td><td class="pty">array</td><td><span class="opt">Option B</span></td><td class="pd">JSON array of email strings</td></tr>
          <tr><td class="pn">csv</td><td class="pty">string</td><td><span class="opt">Option C</span></td><td class="pd">Raw CSV content as string in request body</td></tr>
          <tr><td class="pn">force_refresh</td><td class="pty">boolean</td><td><span class="opt">Optional</span></td><td class="pd">Bypass cache for all emails in batch</td></tr>
        </tbody></table>
      </div>
      <div class="ep-panel" data-tab="e">
        <div class="cb"><div class="ch"><span class="cl">cURL · JSON Array</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
        <pre>curl -X POST https://doott.jaqyi.com/api/verify-email/batch \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  -H <span class="str">"Content-Type: application/json"</span> \
  -d <span class="str">'{"emails":["a@example.com","b@test.org","c@domain.com"]}'</span></pre></div>
        <div class="cb" style="margin-top:10px"><div class="ch"><span class="cl">cURL · CSV File Upload</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
        <pre>curl -X POST https://doott.jaqyi.com/api/verify-email/batch \
  -H <span class="str">"Authorization: Bearer &lt;TOKEN&gt;"</span> \
  -F <span class="str">"file=@/path/to/emails.csv"</span></pre></div>
      </div>
      <div class="ep-panel" data-tab="r">
        <div class="callout info"><span class="ci">ℹ️</span><div>Batch jobs are asynchronous. Poll <code>GET /api/verify-email/batch/:jobId</code> until <code>status === "done"</code>.</div></div>
        <div class="cb" style="margin-top:12px"><div class="ch"><span class="cl">202 Accepted · JSON</span></div>
        <pre>{ <span class="key">"success"</span>: <span class="kw">true</span>, <span class="key">"jobId"</span>: <span class="str">"job_a1b2c3d4"</span>, <span class="key">"status"</span>: <span class="str">"pending"</span>, <span class="key">"total"</span>: <span class="num">250</span> }</pre></div>
      </div>
      </div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth get">GET</span><span class="ep-path">/api/verify-email/batch/:jobId</span><span class="ep-sum">Poll batch job status &amp; results</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs"><div class="ep-tab active" onclick="sw(this,'r')">Response</div></div>
      <div class="ep-panel active" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON (completed)</span></div>
      <pre>{
  <span class="key">"jobId"</span>:       <span class="str">"job_a1b2c3d4"</span>,
  <span class="key">"status"</span>:      <span class="str">"done"</span>,
  <span class="key">"total"</span>:       <span class="num">250</span>, <span class="key">"processed"</span>: <span class="num">250</span>,
  <span class="key">"valid"</span>:       <span class="num">198</span>, <span class="key">"invalid"</span>: <span class="num">52</span>,
  <span class="key">"downloadUrl"</span>: <span class="str">"/api/verify-email/batch/job_a1b2c3d4/download"</span>
}</pre></div></div>
      </div>
    </div>
  </div>

  <!-- AUTH API -->
  <div class="section" id="auth-api">
    <div class="sec-title">🔑 Authentication API</div>
    <div class="sec-desc">Register, login, and manage user sessions.</div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth post">POST</span><span class="ep-path">/api/auth/register</span><span class="ep-sum">Create new account</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs">
        <div class="ep-tab active" onclick="sw(this,'p')">Body</div>
        <div class="ep-tab" onclick="sw(this,'e')">Example</div>
      </div>
      <div class="ep-panel active" data-tab="p">
        <table class="pt"><thead><tr><th>Field</th><th>Type</th><th>Status</th><th>Description</th></tr></thead><tbody>
          <tr><td class="pn">name</td><td class="pty">string</td><td><span class="req">Required</span></td><td class="pd">Full name</td></tr>
          <tr><td class="pn">email</td><td class="pty">string</td><td><span class="req">Required</span></td><td class="pd">Email address</td></tr>
          <tr><td class="pn">password</td><td class="pty">string</td><td><span class="req">Required</span></td><td class="pd">Minimum 8 characters</td></tr>
          <tr><td class="pn">orgName</td><td class="pty">string</td><td><span class="opt">Optional</span></td><td class="pd">Organization / company name</td></tr>
        </tbody></table>
      </div>
      <div class="ep-panel" data-tab="e"><div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre>curl -X POST https://doott.jaqyi.com/api/auth/register \
  -H <span class="str">"Content-Type: application/json"</span> \
  -d <span class="str">'{"name":"Jane Doe","email":"jane@company.com","password":"secure123","orgName":"Acme Corp"}'</span></pre></div></div>
      </div>
    </div>

    <div class="endpoint">
      <div class="ep-hdr" onclick="tog(this)"><span class="mth post">POST</span><span class="ep-path">/api/auth/login</span><span class="ep-sum">Login and receive Bearer token</span><span class="chevron">▶</span></div>
      <div class="ep-body"><div class="ep-tabs">
        <div class="ep-tab active" onclick="sw(this,'e')">Example</div>
        <div class="ep-tab" onclick="sw(this,'r')">Response</div>
      </div>
      <div class="ep-panel active" data-tab="e"><div class="cb"><div class="ch"><span class="cl">cURL</span><button class="cpbtn" onclick="cp(this)">Copy</button></div>
      <pre>curl -X POST https://doott.jaqyi.com/api/auth/login \
  -H <span class="str">"Content-Type: application/json"</span> \
  -d <span class="str">'{"email":"jane@company.com","password":"secure123"}'</span></pre></div></div>
      <div class="ep-panel" data-tab="r"><div class="cb"><div class="ch"><span class="cl">200 OK · JSON</span></div>
      <pre>{
  <span class="key">"success"</span>: <span class="kw">true</span>,
  <span class="key">"token"</span>:   <span class="str">"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."</span>,
  <span class="key">"user"</span>: { <span class="key">"id"</span>: <span class="str">"usr_xxx"</span>, <span class="key">"name"</span>: <span class="str">"Jane Doe"</span>, <span class="key">"email"</span>: <span class="str">"jane@company.com"</span> },
  <span class="key">"org"</span>:  { <span class="key">"id"</span>: <span class="str">"org_yyy"</span>, <span class="key">"name"</span>: <span class="str">"Acme Corp"</span> }
}</pre></div></div>
      </div>
    </div>
  </div>

  <!-- STATUS CODES -->
  <div class="section" id="codes">
    <div class="sec-title">📋 HTTP Status Codes</div>
    <div class="sec-desc">Standard HTTP codes used across all endpoints.</div>
    <table class="pt" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <thead><tr><th>Code</th><th>Meaning</th><th>When to Expect</th></tr></thead>
      <tbody>
        <tr><td><span class="chip cg">200 OK</span></td><td>Success</td><td class="pd">Request completed, data returned</td></tr>
        <tr><td><span class="chip cb2">201 Created</span></td><td>Created</td><td class="pd">New resource created (e.g. user account)</td></tr>
        <tr><td><span class="chip cb2">202 Accepted</span></td><td>Async Started</td><td class="pd">Job accepted (e.g. batch email verification)</td></tr>
        <tr><td><span class="chip co">400 Bad Request</span></td><td>Invalid Input</td><td class="pd">Missing required fields or validation error</td></tr>
        <tr><td><span class="chip co">401 Unauthorized</span></td><td>Auth Required</td><td class="pd">Missing or invalid Bearer token</td></tr>
        <tr><td><span class="chip co">403 Forbidden</span></td><td>Access Denied</td><td class="pd">Token valid but lacks permissions</td></tr>
        <tr><td><span class="chip co">429 Too Many Requests</span></td><td>Rate Limited</td><td class="pd">Request quota exceeded — implement back-off</td></tr>
        <tr><td><span class="chip cr">500 Server Error</span></td><td>Internal Error</td><td class="pd">Unexpected server-side failure</td></tr>
        <tr><td><span class="chip cr">503 Unavailable</span></td><td>DB Unreachable</span></td><td class="pd">Database connection failed</td></tr>
      </tbody>
    </table>
  </div>

  <!-- RATE LIMITS -->
  <div class="section" id="limits">
    <div class="sec-title">⚡ Rate Limits</div>
    <div class="sec-desc">Per-IP rate limits protect the platform and ensure fair usage for all users.</div>
    <table class="pt" style="background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <thead><tr><th>Endpoint Group</th><th>Limit</th><th>Window</th></tr></thead>
      <tbody>
        <tr><td class="pn">/api/final-companies, /api/final-people*</td><td>300 requests</td><td class="pd">per 15 minutes per IP</td></tr>
        <tr><td class="pn">/api/verify-email (single)</td><td>100 requests</td><td class="pd">per 15 minutes per IP</td></tr>
        <tr><td class="pn">/api/verify-email/batch</td><td>10 requests</td><td class="pd">per 15 minutes per IP</td></tr>
        <tr><td class="pn">/api/auth/register, /api/auth/login</td><td>20 requests</td><td class="pd">per 15 minutes per IP</td></tr>
        <tr><td class="pn">All other /api/* endpoints</td><td>500 requests</td><td class="pd">per 15 minutes per IP</td></tr>
      </tbody>
    </table>
    <div class="callout warn" style="margin-top:16px"><span class="ci">⚠️</span><div>When rate limited you'll receive <code>429 Too Many Requests</code>. Use exponential back-off before retrying.</div></div>
  </div>

  </div><!-- /content -->
</main>
</div>

<script>
function tog(h){h.classList.toggle('open');h.nextElementSibling.classList.toggle('open')}
function sw(tab,key){
  const b=tab.closest('.ep-body');
  b.querySelectorAll('.ep-tab').forEach(t=>t.classList.remove('active'));
  b.querySelectorAll('.ep-panel').forEach(p=>p.classList.remove('active'));
  tab.classList.add('active');
  const t=b.querySelector('.ep-panel[data-tab="'+key+'"]');
  if(t)t.classList.add('active');
}
function cp(btn){
  const pre=btn.closest('.cb').querySelector('pre');
  navigator.clipboard.writeText(pre.innerText).then(()=>{
    btn.textContent='Copied!';btn.style.color='var(--green)';
    setTimeout(()=>{btn.textContent='Copy';btn.style.color=''},1800);
  });
}
const obs=new IntersectionObserver(entries=>{
  entries.forEach(e=>{
    if(e.isIntersecting){
      document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
      const a=document.querySelector('.nav-item[href="#'+e.target.id+'"]');
      if(a)a.classList.add('active');
    }
  });
},{threshold:0.3});
document.querySelectorAll('[id]').forEach(s=>obs.observe(s));
</script>
`;

export default function ApiDocsPage() {
  useEffect(() => {
    // Global helper functions for the docs page
    window.tog = function(h) {
      h.classList.toggle('open');
      if (h.nextElementSibling) {
        h.nextElementSibling.classList.toggle('open');
      }
    };

    window.sw = function(tab, key) {
      const b = tab.closest('.ep-body');
      if (!b) return;
      b.querySelectorAll('.ep-tab').forEach(t => t.classList.remove('active'));
      b.querySelectorAll('.ep-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const target = b.querySelector('.ep-panel[data-tab="' + key + '"]');
      if (target) target.classList.add('active');
    };

    window.cp = function(btn) {
      const cb = btn.closest('.cb');
      if (!cb) return;
      const pre = cb.querySelector('pre');
      if (!pre) return;
      navigator.clipboard.writeText(pre.innerText).then(() => {
        btn.textContent = 'Copied!';
        btn.style.color = 'var(--green)';
        setTimeout(() => {
          btn.textContent = 'Copy';
          btn.style.color = '';
        }, 1800);
      });
    };

    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          document.querySelectorAll('.nav-item').forEach((n) => n.classList.remove('active'));
          const a = document.querySelector('.nav-item[href="#' + e.target.id + '"]');
          if (a) a.classList.add('active');
        }
      });
    }, { threshold: 0.3 });

    document.querySelectorAll('[id]').forEach((s) => obs.observe(s));

    return () => {
      obs.disconnect();
    };
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#0b0f1a", color: "#e2e8f0", position: "relative", zIndex: 9999 }}>
      <div dangerouslySetInnerHTML={{ __html: DOCS_STYLE + DOCS_HTML }} />
    </div>
  );
}
