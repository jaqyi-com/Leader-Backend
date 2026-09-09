const fs = require('fs');
const path = require('path');

function parseCSV(filepath) {
  if (!fs.existsSync(filepath)) return [];
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i];
    const values = [];
    let insideQuotes = false;
    let current = '';
    
    for (let j = 0; j < raw.length; j++) {
      const char = raw[j];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim().replace(/^"|"$/g, ''));
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }
  return rows;
}

// Data sources
const f1 = parseCSV(path.join(__dirname, '../Sample_India_100_Final_LeaderData.csv'));
const f2 = parseCSV(path.join(__dirname, '../Sample_India_WithJobTitles_LeaderData.csv'));
const f3 = parseCSV(path.join(__dirname, '../Sample_India_DecisionMakers_LeaderData.csv'));
const f4 = parseCSV(path.join(__dirname, '../Sample_India_Contacts_LeaderData.csv'));
const f5 = parseCSV(path.join(__dirname, '../Sample_India_100_LeaderData.csv'));
const f6 = parseCSV(path.join(__dirname, '../Doott_SaaS_Outbound_Founders_India.csv'));

const all = [...f1, ...f2, ...f3, ...f4, ...f5, ...f6];

// Disqualify unrelated professions that do not buy B2B lead data
function isDisqualified(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  const bad = [
    "dental", "dentist", "surgeon", "doctor", "dr.", "veterinary", "nurse",
    "student", "intern", "faculty", "surveyor", "examiner", "mortgage loan",
    "creative content writer", "motivational speaker", "jamshedpur", "irinjalakuda",
    "guntur", "delhi", "baroda", "pune", "nagpur", "bhuj", "jamnagar", "bellary"
  ];
  return bad.some(b => t === b || (b.length > 5 && t.includes(b)));
}

// Clean and categorize titles for high-converting sales & outreach
function normalizeTitle(rawTitle) {
  if (!rawTitle || rawTitle.trim() === '') {
    return 'Founder & Business Owner';
  }
  const t = rawTitle.trim();
  if (isDisqualified(t)) {
    return null;
  }
  return t;
}

// Priority rank for outreach: Business Development & Sales at top, then Agency/Growth, then Founders/CEOs
function getPriorityScore(title) {
  const t = title.toLowerCase();
  if (t.includes('business development') || t.includes('bde') || t.includes('bdr') || t.includes('biz dev')) return 1;
  if (t.includes('sales') || t.includes('account executive') || t.includes('commercial')) return 2;
  if (t.includes('lead generation') || t.includes('agency') || t.includes('growth') || t.includes('seo consultant') || t.includes('marketing')) return 3;
  if (t.includes('founder') || t.includes('co-founder') || t.includes('ceo') || t.includes('chief executive')) return 4;
  if (t.includes('managing director') || t.includes('owner') || t.includes('partner') || t.includes('president') || t.includes('director') || t.includes('principal') || t.includes('advisor')) return 5;
  return 6;
}

function cleanIndianMobile(rawPhone) {
  if (!rawPhone) return null;
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    const tenDigits = digits.substring(2);
    if (/^[6-9]\d{9}$/.test(tenDigits)) return tenDigits;
  } else if (digits.length === 10 && /^[6-9]\d{9}$/.test(digits)) {
    return digits;
  }
  return null;
}

function formatProperName(rawName) {
  if (!rawName) return '';
  return rawName.trim().split(/\s+/).map(part => {
    if (/^[A-Z0-9]+$/.test(part) && part.length <= 3) return part; // Keep initials uppercase
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  }).join(' ');
}

const seenPhones = new Set();
const seenEmails = new Set();
const qualifiedLeads = [];

all.forEach(lead => {
  const phoneRaw = lead['Direct Mobile Phone'] || lead['Phone'] || lead['phones'] || '';
  const rawName = (lead['Full Name'] || lead['name'] || '').trim();
  const rawTitle = (lead['Job Title'] || lead['title'] || '').trim();
  const city = (lead['City'] || lead['city'] || '').trim();
  const state = (lead['State'] || lead['state'] || '').trim();
  const location = (lead['Location'] || lead['location'] || '').trim();
  const rawEmail = (lead['Direct Email'] || lead['Email'] || lead['emails'] || '').trim().toLowerCase();
  const linkedin = (lead['LinkedIn Profile'] || lead['LinkedIn'] || lead['linked_url'] || '').trim();

  if (!phoneRaw || !rawName) return;

  const cleanMobile = cleanIndianMobile(phoneRaw);
  if (!cleanMobile || seenPhones.has(cleanMobile)) return;

  const finalTitle = normalizeTitle(rawTitle);
  if (!finalTitle) return; // Disqualified medical/irrelevant profession

  const cleanName = formatProperName(rawName);
  const firstName = cleanName.split(' ')[0] || 'there';

  seenPhones.add(cleanMobile);
  if (rawEmail && rawEmail.includes('@')) seenEmails.add(rawEmail);

  const waNumber = '91' + cleanMobile;
  const formattedPhone = '+91 ' + cleanMobile.substring(0, 5) + ' ' + cleanMobile.substring(5);
  const waChatUrl = `https://wa.me/${waNumber}`;

  // High-converting B2B lead database pitch
  const pitchMessage = `Hello ${firstName} 👋
Last week alone, 3 agencies used our database to book 40+ sales calls in 72 hours.
What they used: 45M+ B2B records ,20M direct emails, 17M phone numbers, sorted by industry, job title & location (US + India).
No monthly fees. No per-contact pricing. One-time buy, you own the data.
Full breakdown here: https://data001.netlify.app/
DM now , price goes up after this week.`;

  const waPitchUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(pitchMessage)}`;

  qualifiedLeads.push({
    name: cleanName,
    title: finalTitle,
    priority: getPriorityScore(finalTitle),
    city: city || 'India',
    state: state || '',
    location: location || (city ? `${city}, India` : 'India'),
    phone: formattedPhone,
    waChatUrl,
    waPitchUrl,
    email: rawEmail || '',
    linkedin: linkedin || ''
  });
});

// Sort by Priority: Business Development -> Sales -> Agency/Growth -> Founders/CEOs -> Managing Directors/Owners
qualifiedLeads.sort((a, b) => a.priority - b.priority);

console.log(`Generated ${qualifiedLeads.length} verified Business Development, Sales & Founder leads for India.`);

const headers = [
  'Full Name',
  'Job Title',
  'City',
  'State',
  'Location',
  'Direct Mobile Phone',
  '1-Click WhatsApp Chat Link',
  '1-Click Pre-filled Pitch Link',
  'Direct Email',
  'LinkedIn Profile'
];

let csvContent = headers.join(',') + '\n';
qualifiedLeads.forEach(l => {
  const esc = (s) => '"' + (s || '').toString().replace(/"/g, '""') + '"';
  csvContent += [
    esc(l.name),
    esc(l.title),
    esc(l.city),
    esc(l.state),
    esc(l.location),
    esc(l.phone),
    esc(l.waChatUrl),
    esc(l.waPitchUrl),
    esc(l.email),
    esc(l.linkedin)
  ].join(',') + '\n';
});

const outPath = path.join(__dirname, '../Doott_SaaS_WhatsApp_Active_Founders_India.csv');
fs.writeFileSync(outPath, csvContent, 'utf8');
console.log('Successfully updated: ' + outPath);
