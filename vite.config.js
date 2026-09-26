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

// The admin panel lives in admin/ (its own pages, outside the React shop). /admin/login maps to
// admin/login.html and every other /admin/… page to admin/index.html, whose router shows the screen.
// (/api/admin/… is untouched: those are the serverless API routes.)
function adminPages() {
  const rewrite = (req, _res, next) => {
    const [pathname, query] = req.url.split('?');
    const q = query ? `?${query}` : '';
    if (/^\/admin\/login\/?$/.test(pathname)) req.url = `/admin/login.html${q}`;
    else if (/^\/admin(\/[^.]*)?$/.test(pathname)) req.url = `/admin/index.html${q}`;
    next();
  };
  return {
    name: 'admin-pages',
    configureServer: server => { server.middlewares.use(rewrite); },
    configurePreviewServer: server => { server.middlewares.use(rewrite); },
  };
}

export default defineConfig(({ command }) => {
  const localRazorpayKey = command === 'serve' ? readLocalRazorpayKey() : '';

  return {
    plugins: [adminPages()],
    define: localRazorpayKey.startsWith('rzp_test_')
      ? {
          'import.meta.env.VITE_RAZORPAY_KEY_ID': JSON.stringify(localRazorpayKey),
        }
      : {},
    build: {
      rollupOptions: {
        input: { shop: 'index.html', admin: 'admin/index.html', adminLogin: 'admin/login.html' },
      },
    },
  };
});
