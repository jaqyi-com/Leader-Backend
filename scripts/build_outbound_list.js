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

const f1 = parseCSV(path.join(__dirname, '../Sample_India_100_Final_LeaderData.csv'));
const f2 = parseCSV(path.join(__dirname, '../Sample_India_WithJobTitles_LeaderData.csv'));
const f3 = parseCSV(path.join(__dirname, '../Sample_India_DecisionMakers_LeaderData.csv'));
const f4 = parseCSV(path.join(__dirname, '../Sample_India_Contacts_LeaderData.csv'));

const all = [...f1, ...f2, ...f3, ...f4];
const seenEmails = new Set();
const uniqueLeads = [];

all.forEach(lead => {
  const email = (lead['Email'] || '').trim().toLowerCase();
  const name = (lead['Full Name'] || '').trim();
  const title = (lead['Job Title'] || '').trim();
  const phone = (lead['Phone'] || '').trim();
  const city = (lead['City'] || '').trim();
  const state = (lead['State'] || '').trim();
  const linkedin = (lead['LinkedIn'] || '').trim();
  const location = (lead['Location'] || '').trim();

  if (email && email.includes('@') && !seenEmails.has(email) && name) {
    seenEmails.add(email);
    uniqueLeads.push({
      name,
      title: title || 'Business Owner / Founder',
      city: city || 'India',
      state,
      location: location || (city ? city + ', India' : 'India'),
      email,
      phone,
      linkedin
    });
  }
});

console.log('Total unique leads with verified contacts:', uniqueLeads.length);

const csvHeaders = ['Full Name', 'Job Title', 'City', 'State', 'Location', 'Email', 'Phone', 'LinkedIn Profile'];
let csvOut = csvHeaders.join(',') + '\n';

uniqueLeads.forEach(l => {
  const esc = (s) => '"' + (s || '').replace(/"/g, '""') + '"';
  csvOut += [
    esc(l.name),
    esc(l.title),
    esc(l.city),
    esc(l.state),
    esc(l.location),
    esc(l.email),
    esc(l.phone),
    esc(l.linkedin)
  ].join(',') + '\n';
});

const outPath = path.join(__dirname, '../Doott_SaaS_Outbound_Founders_India.csv');
fs.writeFileSync(outPath, csvOut);
console.log('Successfully saved to ' + outPath);
