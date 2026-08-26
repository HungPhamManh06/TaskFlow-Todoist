// One-shot deterministic fixture generator for tests/fixtures/document-daily-plan.pdf.
// Re-run: node tests/fixtures/make-fixture.mjs
// ASCII-only content so pdf-parse extraction is byte-stable across platforms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const lines = [
  'Embedded Systems Roadmap 2026',
  '01/09/2026 - 10/09/2026',
  'Ngay   Noi dung hoc / thuc hanh   Done',
  '01/09 Learn GPIO basics 1h [ ]',
  '02/09 Learn UART communication 45 min [ ]',
  '03/09 Learn SPI bus 90 min [ ]',
  '04/09 I2C sensors lab 1h30 [ ]',
  '05/09 Timer and PWM drills 60 min [ ]',
  '06/09 ADC practice set 2 hours [ ]',
  '07/09 Weekly review quiz 30 min [ ]',
  '08/09 Interrupt handling basics 1h [ ]',
  '09/09 DMA fundamentals 45 min [ ]',
  '10/09 Mini project sensor logger 2 hours [ ]',
];

let content = 'BT /F1 11 Tf 40 750 Td 16 TL\n';
for (const line of lines) {
  const esc = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  content += '(' + esc + ') Tj T*\n';
}
content += 'ET';

const objs = [
  '<</Type/Catalog/Pages 2 0 R>>',
  '<</Type/Pages/Kids[3 0 R]/Count 1>>',
  '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
  '<</Length ' + content.length + '>>\nstream\n' + content + '\nendstream',
  '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
];

let pdf = '%PDF-1.4\n';
const offsets = [];
objs.forEach((obj, i) => {
  offsets.push(pdf.length);
  pdf += (i + 1) + ' 0 obj\n' + obj + '\nendobj\n';
});
const xrefPos = pdf.length;
pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
  + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
pdf += 'trailer\n<</Size ' + (objs.length + 1) + '/Root 1 0 R>>\nstartxref\n' + xrefPos + '\n%%EOF\n';

const out = path.join(here, 'document-daily-plan.pdf');
fs.writeFileSync(out, Buffer.from(pdf, 'latin1'));
console.log('wrote', path.join('tests', 'fixtures', 'document-daily-plan.pdf'), fs.statSync(out).size, 'bytes');
