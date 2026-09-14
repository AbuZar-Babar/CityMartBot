const readline = require('readline');

function ask(questionText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(questionText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function pauseForHuman(message = 'Paused for manual action in Chrome. Press Enter when ready...') {
  console.log(`\n>>> ${message}`);
  await ask('Press [Enter] to continue: ');
}

async function promptStepMenu(companyDisplayName, activeCurrent) {
  console.log('\n' + '='.repeat(60));
  console.log(`TARGET COMPANY: ${companyDisplayName}`);
  console.log(`CURRENT ACTIVE IN PORTAL: [${activeCurrent}]`);
  console.log('='.repeat(60));
  console.log('  [1] Switch Company in portal');
  console.log('  [2] Open Invoices Grid tab/screen');
  console.log('  [3] Scan & Download Invoices for this company');
  console.log('  [4] Move to Next Company (Skip remaining)');
  console.log('  [5] Auto-run all 3 steps for this company (1 -> 2 -> 3)');
  console.log('  [a] Auto-run ALL remaining companies without prompts');
  console.log('  [m] Manual pause (interact with Chrome yourself)');
  console.log('  [q] Quit');
  console.log('-'.repeat(60));

  const choice = await ask('Choose an option [1/2/3/4/5/a/m/q] (default: 5): ');
  return choice || '5';
}

async function promptErrorRecovery(actionName, errorMessage) {
  console.log('\n' + '!'.repeat(60));
  console.log(`[ERROR IN: ${actionName}]`);
  console.log(`Details: ${errorMessage}`);
  console.log('!'.repeat(60));
  console.log('What would you like to do?');
  console.log('  [r] Retry this step');
  console.log('  [m] Manual intervention (fix it in Chrome, then press Enter)');
  console.log('  [s] Skip this step and continue');
  console.log('  [n] Skip to Next Company');
  console.log('  [q] Quit bot');
  console.log('-'.repeat(60));

  const choice = await ask('Choice [r/m/s/n/q] (default: r): ');
  return (choice || 'r').toLowerCase();
}

module.exports = {
  ask,
  pauseForHuman,
  promptStepMenu,
  promptErrorRecovery
};
