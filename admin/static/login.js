import { supabase } from '../../src/lib/supabase/client.js';

// Sign-in for the admin panel: Supabase Auth email + password, then the account must have
// profiles.role = 'admin' (the same check the database's row-level security uses).
const form = document.querySelector('[data-login]');
const error = document.querySelector('[data-error]');
const params = new URLSearchParams(location.search);
const next = params.get('next');
const safeNext = next && /^\/admin\/[\w\-/]*$/.test(next) ? next : '/admin/dashboard';
if (params.get('denied')) document.querySelector('[data-denied]').hidden = false;

const fail = (message) => {
  error.textContent = message;
  error.hidden = false;
  form.password.select();
};

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  error.hidden = true;
  if (!form.reportValidity()) return;
  if (!supabase) return fail('The store isn’t connected to Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
  const btn = form.querySelector('button');
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  try {
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: form.email.value.trim(), password: form.password.value });
    if (authError || !data.session) throw new Error('That email and password don’t match.');
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).maybeSingle();
    if (profile?.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('That account isn’t an admin. Sign in with the store’s admin account.');
    }
    location.assign(safeNext);
  } catch (err) {
    fail(err.message || 'Unable to sign in. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});
