const fs = require('fs');

const cookies = JSON.parse(fs.readFileSync('session.json', 'utf8'));

console.log('Cookie expiry report:\n');

cookies.forEach(cookie => {
  if (cookie.expires && cookie.expires !== -1) {
    const expiryDate = new Date(cookie.expires * 1000);
    const now = new Date();
    const daysLeft = ((expiryDate - now) / (1000 * 60 * 60 * 24)).toFixed(1);

    console.log(`Name: ${cookie.name}`);
    console.log(`  Expires: ${expiryDate.toISOString()}`);
    console.log(`  Days from now: ${daysLeft}`);
    console.log('');
  } else {
    console.log(`Name: ${cookie.name}`);
    console.log('  Session cookie (expires when browser closes, not persistent)');
    console.log('');
  }
});
