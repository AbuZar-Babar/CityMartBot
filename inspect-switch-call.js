const fs = require('fs');

const calls = JSON.parse(fs.readFileSync('company-switch-calls.json', 'utf8'));

const matches = calls.filter(c => {
  const url = c.url || c.request?.url || '';
  return /ChangePortalEntity/i.test(url) || /entityId/i.test(url);
});

if (matches.length === 0) {
  console.log(`No calls matching "ChangePortalEntity" or "entityId" found in company-switch-calls.json.`);
  console.log(`Total calls in file: ${calls.length}`);
  console.log('Here is the first captured call, to check the actual shape of the records:');
  console.log(JSON.stringify(calls[0], null, 2));
} else {
  console.log(`Found ${matches.length} matching call(s):\n`);
  matches.slice(0, 3).forEach((c, i) => {
    console.log(`--- Match ${i + 1} ---`);
    console.log(JSON.stringify(c, null, 2));
    console.log('');
  });
}