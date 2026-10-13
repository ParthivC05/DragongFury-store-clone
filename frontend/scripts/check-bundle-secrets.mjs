import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist/assets');
const needles = [
  'XXPAY_API_KEY',
  'DOLLARPAY_KEY',
  'XXPAY_MCH_NO',
  'PGSOFT_AUTH_TOKEN',
  'AMATIC_AUTH_TOKEN',
  'AMUSNET_AUTH_TOKEN',
  'GIT_SLOTPARK_AUTH_TOKEN',
  'winner4USD',
  'http://amapi',
  'http://apiang',
  'http://ggapi'
];

if (!fs.existsSync(dist)) {
  console.error('check-bundle-secrets: dist/assets missing. Run vite build first.');
  process.exit(1);
}

const files = fs.readdirSync(dist).filter((name) => name.endsWith('.js'));
const hits = [];
for (const name of files) {
  const text = fs.readFileSync(path.join(dist, name), 'utf8');
  for (const needle of needles) {
    if (text.includes(needle)) hits.push(`${name}: ${needle}`);
  }
}

if (hits.length) {
  console.error('Public bundle still contains secret-like values:');
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log('check-bundle-secrets: ok');
