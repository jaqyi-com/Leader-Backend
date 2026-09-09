const fs = require('fs');
const path = require('path');

function parseCSV(filepath) {
  const content = fs.readFileSync(filepath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
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

const leads = parseCSV(path.join(__dirname, '../Doott_SaaS_Outbound_Founders_USA.csv'));
const tollFreeAreaCodes = new Set(['800', '888', '877', '866', '855', '844', '833']);
const whatsappLeads = [];

leads.forEach(l => {
  const rawPhones = l['Phone Numbers'] || '';
  if (!rawPhones) return;
  
  const phoneList = rawPhones.split(';').map(p => p.trim()).filter(Boolean);
  let validPhone = '';
  let waNumber = '';
  
  for (const p of phoneList) {
    const digits = p.replace(/\D/g, '');
    let cleanDigits = digits;
    if (digits.length === 11 && digits.startsWith('1')) {
      cleanDigits = digits.substring(1);
    }
    
    if (cleanDigits.length === 10) {
      const areaCode = cleanDigits.substring(0, 3);
      if (!tollFreeAreaCodes.has(areaCode)) {
        validPhone = '+1' + cleanDigits;
        waNumber = '1' + cleanDigits;
        break;
      }
    }
  }
  
  if (validPhone && waNumber) {
    const name = (l['Full Name'] || '').trim();
    const firstName = name.split(' ')[0] || 'there';
    const company = (l['Estimated Company / Domain'] || '').trim() || 'your company';
    const waLink = `https://wa.me/${waNumber}`;
    const pitchText = encodeURIComponent(`Hi ${firstName}, saw what you are building at ${company}. We help SaaS & tech businesses accelerate growth and automate lead generation with Doott SaaS. Would love to share a quick 2-min demo if you're open to exploring!`);
    const waPitchLink = `https://wa.me/${waNumber}?text=${pitchText}`;
    
    whatsappLeads.push({
      name,
      title: l['Job Title'],
      company,
      city: l['City'],
      state: l['State'],
      location: l['Location'],
      email: l['Primary Email'],
      phone: validPhone,
      waLink,
      waPitchLink
    });
  }
});

console.log(`Exporting ${whatsappLeads.length} WhatsApp active USA leads...`);

const headers = [
  'Full Name',
  'Job Title',
  'Company',
  'City',
  'State',
  'Location',
  'Direct Email',
  'WhatsApp Number',
  'WhatsApp 1-Click Chat URL',
  'Pre-filled WhatsApp Pitch Link'
];

let csv = headers.join(',') + '\n';
whatsappLeads.forEach(row => {
  const esc = (s) => '"' + (s || '').toString().replace(/"/g, '""') + '"';
  csv += [
    esc(row.name),
    esc(row.title),
    esc(row.company),
    esc(row.city),
    esc(row.state),
    esc(row.location),
    esc(row.email),
    esc(row.phone),
    esc(row.waLink),
    esc(row.waPitchLink)
  ].join(',') + '\n';
});

const outPath = path.join(__dirname, '../Doott_SaaS_USA_WhatsApp_Active_Leads.csv');
fs.writeFileSync(outPath, csv);
console.log(`Saved WhatsApp leads to ${outPath}`);
