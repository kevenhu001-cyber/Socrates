const fs = require('fs');
const path = process.argv[2];
const xml = fs.readFileSync(path, 'utf8');
const re = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
const wanted = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
while ((m = re.exec(xml))) {
  if (!wanted || wanted.has(m[1])) {
    console.log(`${m[1].padEnd(28)} cx=${(Number(m[2])+Number(m[4]))/2|0} cy=${(Number(m[3])+Number(m[5]))/2|0}  [${m[2]},${m[3]}][${m[4]},${m[5]}]`);
  }
}