import { createHash } from 'node:crypto';
import { createReadStream, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const apkPath = resolve(process.argv[2] || 'android/app/build/outputs/apk/release/app-release.apk');
const requiredAbis = ['arm64-v8a', 'armeabi-v7a', 'x86', 'x86_64'];

let entries;
try {
  entries = execFileSync('jar', ['tf', apkPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
} catch (error) {
  console.error(`Unable to inspect ${apkPath}. Ensure the JDK 'jar' command is available.`);
  throw error;
}

const missing = requiredAbis.filter((abi) => !entries.includes(`lib/${abi}/libreactnative.so`));
if (missing.length) {
  throw new Error(`APK is missing libreactnative.so for: ${missing.join(', ')}`);
}

const hash = createHash('sha256');
for await (const chunk of createReadStream(apkPath)) hash.update(chunk);
const digest = hash.digest('hex');
const checksumPath = `${apkPath}.sha256`;
writeFileSync(checksumPath, `${digest}  ${basename(apkPath)}\n`, 'utf8');

console.log(`Verified React Native core library for: ${requiredAbis.join(', ')}`);
console.log(`SHA-256: ${digest}`);
console.log(`Checksum: ${checksumPath}`);
