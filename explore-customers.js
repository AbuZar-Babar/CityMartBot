const { getLoggedInPage } = require('./browser.js');
const fs = require('fs');

(async () => {
  const { page } = await getLoggedInPage();

  await page.goto('https://citymart.i21web.com/iRelyProd/#/AR/Invoice?showSearch=true&menuId=833&moduleMenuId=829', {
    waitUntil: 'networkidle2'
  });
  await new Promise(resolve => setTimeout(resolve, 3000));

  const columns = 'strInvoiceNumber:strTransactionType:strTerm:strCustomerPaymentMethod:strBOLNumber:strPONumber:strTicketNumbers:strSalesOrderNumber:dtmDate:intDaysOld:dtmDueDate:dblInvoiceTotal:dblPayment:dblAmountDue:dblBaseInvoiceTotal:dblBasePayment:dblBaseAmountDue:strLocationName:intInvoiceId:intEntityCustomerId:intCurrencyId:strCustomerName:strCustomerNumber:';

  const searchScreenInfo = JSON.stringify({
    moduleName: 'AccountsReceivable.view.Invoice',
    screenName: 'Search Invoices',
    tabName: 'Invoice',
    uId: 'explore-script'
  });

  const sort = JSON.stringify([{ property: 'intInvoiceId', direction: 'DESC' }]);

  const result = await page.evaluate(async (columns, searchScreenInfo, sort) => {
    const url = `/iRelyProd/accountsreceivable/api/invoice/searchinvoicenotnsf?_dc=${Date.now()}&columns=${encodeURIComponent(columns)}&searchScreenInfo=${encodeURIComponent(searchScreenInfo)}&page=1&start=0&limit=1000&sort=${encodeURIComponent(sort)}`;
    const res = await fetch(url, { credentials: 'include' });
    return { status: res.status, text: await res.text() };
  }, columns, searchScreenInfo, sort);

  console.log('Status:', result.status);
  const parsed = JSON.parse(result.text);
  const rows = parsed.data || parsed.rows || [];
  console.log('Total records available:', parsed.total);
  console.log('Rows fetched this call:', rows.length);

  const invoicesOnly = rows.filter(r => r.strTransactionType === 'Invoice');
  console.log('Of those, actual Invoices:', invoicesOnly.length);

  const uniqueCustomers = [...new Set(rows.map(r => r.strCustomerName))].sort();
  console.log('\nUnique customer names in this batch (' + uniqueCustomers.length + '):');
  uniqueCustomers.forEach(name => console.log(' -', name));

  fs.writeFileSync('customers-sample.json', JSON.stringify(uniqueCustomers, null, 2));
  console.log('\nSaved full list to customers-sample.json');
})();