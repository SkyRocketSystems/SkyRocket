const fs = require('fs');

// Empty (placeholder) SVG shells — referenced as static files, filled in later.
const logo =
  '<svg xmlns="http://www.w3.org/2000/svg" width="325" height="426" viewBox="0 0 325 426"/>\n';
const star =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="207 -2 38 38"/>\n';

fs.writeFileSync('public/skyrocket-logo.svg', logo);
fs.writeFileSync('public/section-star.svg', star);

console.log(
  'logo:',
  fs.statSync('public/skyrocket-logo.svg').size,
  'bytes | star:',
  fs.statSync('public/section-star.svg').size,
  'bytes',
);