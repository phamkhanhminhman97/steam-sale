import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const run = (cmd: string): string => {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] }).trim();
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message: string };
    throw new Error(`Lệnh thất bại: ${cmd}\n${e.stderr || e.stdout || e.message}`);
  }
};

console.log('--- [1/5] Kiểm tra đăng nhập Cloudflare ---');
const who = run('npx wrangler whoami');
console.log(who.split('\n').slice(0, 5).join('\n'));

console.log('\n--- [2/5] Kiểm tra và khởi tạo D1 Database ---');
const d1ListRaw = run('npx wrangler d1 list --json');
let dbId: string | null = null;
try {
  const d1List = JSON.parse(d1ListRaw) as Array<{ name: string; uuid: string }>;
  const existing = d1List.find(d => d.name === 'steam-sale');
  if (existing) {
    dbId = existing.uuid;
    console.log(`Đã tìm thấy D1 database 'steam-sale': ${dbId}`);
  }
} catch {}

if (!dbId) {
  console.log("Đang tạo D1 database 'steam-sale'...");
  const createOut = run('npx wrangler d1 create steam-sale');
  const match = /database_id = "([a-f0-9-]+)"/i.exec(createOut) || /"database_id": "([a-f0-9-]+)"/i.exec(createOut);
  if (match) {
    dbId = match[1];
  } else {
    // Re-check list
    const listAfter = JSON.parse(run('npx wrangler d1 list --json')) as Array<{ name: string; uuid: string }>;
    dbId = listAfter.find(d => d.name === 'steam-sale')?.uuid ?? null;
  }
  console.log(`Đã tạo D1 database thành công: ${dbId}`);
}

if (!dbId) throw new Error('Không thể xác định database_id cho D1 steam-sale');

console.log('\n--- [3/5] Cập nhật database_id vào wrangler.jsonc ---');
const wranglerPath = resolve(process.cwd(), 'wrangler.jsonc');
let wranglerContent = readFileSync(wranglerPath, 'utf8');
wranglerContent = wranglerContent.replace(
  /"database_id":\s*"[0-9a-f-]+"/,
  `"database_id": "${dbId}"`
);
writeFileSync(wranglerPath, wranglerContent, 'utf8');
console.log(`Đã gán database_id = ${dbId} vào wrangler.jsonc`);

console.log('\n--- [4/5] Kiểm tra và khởi tạo R2 Bucket ---');
const r2List = run('npx wrangler r2 bucket list');
if (r2List.includes('steam-sale-data')) {
  console.log("R2 bucket 'steam-sale-data' đã tồn tại.");
} else {
  console.log("Đang tạo R2 bucket 'steam-sale-data'...");
  run('npx wrangler r2 bucket create steam-sale-data');
  console.log("Đã tạo R2 bucket 'steam-sale-data' thành công.");
}

console.log('\n--- [5/5] Chạy D1 migrations lên remote ---');
run('npx wrangler d1 migrations apply steam-sale --remote');
console.log('Migrations đã áp dụng thành công lên D1 remote.');

console.log('\n========================================');
console.log('✅ HẠ TẦNG CLOUDFLARE SẴN SÀNG CHO PRODUCTION!');
console.log('Bước tiếp theo:');
console.log('  1. Deploy: npm run deploy');
console.log('  2. Kiểm thử probe: npx wrangler workflows trigger steam-sale-sync \'{"probe":true}\'');
console.log('  3. Khi probe thành công, đổi SYNC_ENABLED thành "true" trong wrangler.jsonc và redeploy.');
console.log('========================================');
