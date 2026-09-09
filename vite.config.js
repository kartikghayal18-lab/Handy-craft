import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function readLocalRazorpayKey() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return '';

  const match = fs
    .readFileSync(envPath, 'utf8')
    .match(/^VITE_RAZORPAY_KEY_ID\s*=\s*([^\r\n]*)/m);

  return match?.[1]?.trim().replace(/^(['"])(.*)\1$/, '$2') || '';
}

export default defineConfig(({ command }) => {
  const localRazorpayKey = command === 'serve' ? readLocalRazorpayKey() : '';

  return {
    define: localRazorpayKey.startsWith('rzp_test_')
      ? {
          'import.meta.env.VITE_RAZORPAY_KEY_ID': JSON.stringify(localRazorpayKey),
        }
      : {},
  };
});
