const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');

// Match the two <image> elements with base64-encoded PNG patterns.
// The HTML uses double quotes around attributes.
const re0 = /image0_1_51".*?xlink:href="data:image\/png;base64,([^"]+)"/s;
const re1 = /image1_1_51".*?xlink:href="data:image\/png;base64,([^"]+)"/s;

const m0 = html.match(re0);
const m1 = html.match(re1);

if (!m0 || !m1) {
  console.error('pattern not found', !!m0, !!m1);
  process.exit(1);
}

fs.mkdirSync(path.join(__dirname, 'public'), { recursive: true });
fs.writeFileSync(
  path.join(__dirname, 'public/logo-pattern-0.png'),
  Buffer.from(m0[1], 'base64'),
);
fs.writeFileSync(
  path.join(__dirname, 'public/logo-pattern-1.png'),
  Buffer.from(m1[1], 'base64'),
);

console.log(
  'OK: wrote',
  fs.statSync(path.join(__dirname, 'public/logo-pattern-0.png')).size,
  'and',
  fs.statSync(path.join(__dirname, 'public/logo-pattern-1.png')).size,
  'bytes',
);