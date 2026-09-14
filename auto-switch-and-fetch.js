const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { loadSession } = require('./load-session.js');

// 1. Yahan saari company IDs daal do. Ye tum dropdown se ya API se nikalogi
const COMPANIES = [
  { id: 1040, name: "Charger 101" },
  { id: 1041, name: "Charger 102" },
  { id: 1042, name: "Charger 103" },
  { id: 1043, name: "Charger 104" }, // ye tumhare json me hai
];

async function switchCompany(entityId, headers) {
  const url = `https://citymart.i21web.com/iRelyProd/Web/api/Security/ChangePortalEntity?entityId=${entityId}`;
  const res = await fetch(url, { method: 'POST', headers });
  if (res.status!== 200) throw new Error("Switch failed: " + res.status);
  console.log(`Switched to EntityId: ${entityId}`);
  await new Promise(r => setTimeout(r, 2000)); // 2 sec wait for portal to load
}

async function fetchInvoices(headers, companyName) {
  // Ye URL tumhare explore-invoices.js me hoga. Common hai:
  const url = `https://citymart.i21web.com/iRelyProd/accountsreceivable/api/invoice/searchinvoicenotnsf`;

  const res = await fetch(url, { method: 'GET', headers });
  const data = await res.json();

  // Sirf latest invoices + due date
  const invoices = data.data.map(inv => ({
    InvoiceNumber: inv.strInvoiceNumber,
    Customer: inv.strCustomerName,
    InvoiceDate: inv.dtmInvoiceDate,
    DueDate: inv.dtmDueDate,
    Amount: inv.dblInvoiceTotal,
    Status: inv.strTransactionType
  }));

  // JSON me save
  const outDir = path.join(__dirname, 'invoices', new Date().toISOString().split('T')[0]);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  fs.writeFileSync(path.join(outDir, `${companyName}.json`), JSON.stringify(invoices, null, 2));
  console.log(`Saved ${invoices.length} invoices for ${companyName}`);
}

async function main() {
  const session = await loadSession(); // tumhare load-session.js se cookies/headers
  const headers = session.headers;

  for (const comp of COMPANIES) {
    try {
      await switchCompany(comp.id, headers);
      await fetchInvoices(headers, comp.name);
    } catch (e) {
      console.error(`Error with ${comp.name}:`, e.message);
    }
  }
  console.log("All done!");
}

main();