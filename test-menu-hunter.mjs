import { huntMenu } from './extractor/menu-hunter.mjs';

console.log('Testing Menu Hunter on Torchy\'s Tacos...');
console.log('This will take 30-60 seconds...\n');

const result = await huntMenu('https://torchystacos.com', {
  location: 'Austin TX',
  format: 'detailed',
  browserEnv: 'LOCAL',
  headless: true,
});

console.log('\n=== RESULT ===');
console.log('Success:', result.success);
console.log('URL:', result.url);
console.log('Final URL:', result.finalUrl);

if (result.metadata) {
  console.log('Discovery type:', result.metadata.discoveryType);
  console.log('Confidence:', result.metadata.confidence);
  console.log('Duration:', result.metadata.durationMs + 'ms');
  console.log('Tokens used:', result.metadata.tokensUsed);
}

if (result.validation) {
  console.log('Validation:', result.validation.stats);
}

if (result.error) {
  console.log('Error:', result.error);
}

if (result.menu) {
  // Count items
  let totalItems = 0;
  let sections = 0;
  for (const [key, value] of Object.entries(result.menu)) {
    if (key.startsWith('_')) continue;
    sections++;
    for (const itemKey of Object.keys(value)) {
      if (itemKey !== 'common_options') totalItems++;
    }
  }
  console.log(`Menu: ${totalItems} items in ${sections} sections`);
  
  // Save to file
  const fs = await import('fs');
  fs.writeFileSync('torchys-menu.json', JSON.stringify(result.menu, null, 2));
  console.log('\nSaved menu to torchys-menu.json');
}

console.log('\nPhases:');
for (const phase of result.phases || []) {
  console.log(`  ${phase.phase}: ${phase.durationMs}ms`);
}
