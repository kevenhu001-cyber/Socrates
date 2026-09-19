const fs = require('fs');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const re = /text="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
let m;
while ((m = re.exec(xml))) {
  console.log(`${m[1]}  cx=${(Number(m[2])+Number(m[4]))/2|0} cy=${(Number(m[3])+Number(m[5]))/2|0}`);
}
const re2 = /content-desc="([^"]+)"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/g;
while ((m = re2.exec(xml))) {
  console.log(`desc=${m[1]}  cx=${(Number(m[2])+Number(m[4]))/2|0} cy=${(Number(m[3])+Number(m[5]))/2|0}`);
}