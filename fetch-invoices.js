const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

(async () => {
  const { page } = await getLoggedInPage();

  // Make sure we're on the Invoices screen first so the session context is right
  await page.goto('https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true&menuId=833&moduleMenuId=829', {
    waitUntil: 'networkidle2'
  });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const columns = 'strInvoiceNumber:strTransactionType:strTerm:strCustomerPaymentMethod:strBOLNumber:strPONumber:strTicketNumbers:strSalesOrderNumber:dtmDate:intDaysOld:dtmDueDate:dblInvoiceTotal:dblPayment:dblAmountDue:dblBaseInvoiceTotal:dblBasePayment:dblBaseAmountDue:strLocationName:intInvoiceId:intEntityCustomerId:intCurrencyId:';

  const searchScreenInfo = JSON.stringify({
    moduleName: 'AccountsReceivable.view.Invoice',
    screenName: 'Search Invoices',
    tabName: 'Invoice',
    uId: 'fetch-script'
  });

  const sort = JSON.stringify([{ property: 'intInvoiceId', direction: 'DESC' }]);

  const result = await page.evaluate(async (columns, searchScreenInfo, sort) => {
    const url = `/iRelyProd/accountsreceivable/api/invoice/searchinvoicenotnsf?_dc=${Date.now()}&columns=${encodeURIComponent(columns)}&searchScreenInfo=${encodeURIComponent(searchScreenInfo)}&page=1&start=0&limit=20&sort=${encodeURIComponent(sort)}`;
    const res = await fetch(url, { credentials: 'include' });
    const status = res.status;
    const text = await res.text();
    return { status, text };
  }, columns, searchScreenInfo, sort);

  console.log('Status:', result.status);
  fs.writeFileSync('invoices-raw.json', result.text);
  console.log('Saved raw response to invoices-raw.json');

  try {
    const parsed = JSON.parse(result.text);
    console.log('\nTotal records:', parsed.total);
    console.log('\nFirst 3 rows:');
    console.log(JSON.stringify(parsed.data?.slice(0, 3) || parsed.rows?.slice(0, 3) || parsed, null, 2));
  } catch (e) {
    console.log('Could not parse as JSON, check invoices-raw.json manually.');
  }

  console.log('\nChrome will remain open.');
})();
