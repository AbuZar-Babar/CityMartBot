const fs = require('fs');

const raw = JSON.parse(fs.readFileSync('invoices-raw.json', 'utf8'));
const rows = raw.data || raw.rows || raw;

console.log('Total rows fetched:', rows.length);

const invoicesOnly = rows.filter(r => r.strTransactionType === 'Invoice');

console.log('Invoice-type rows (excluding Credit Memo / Debit Memo):', invoicesOnly.length);

console.log('\nLatest invoices:');
invoicesOnly.slice(0, 10).forEach(inv => {
  console.log(`${inv.strInvoiceNumber} | ${inv.dtmDate.slice(0,10)} | $${inv.dblInvoiceTotal} | ${inv.strLocationName} | id=${inv.intInvoiceId}`);
});

fs.writeFileSync('invoices-filtered.json', JSON.stringify(invoicesOnly, null, 2));
console.log('\nSaved filtered list to invoices-filtered.json');
