import { requireSupabase } from './client';
export async function uploadPersonalizationAsset(file) { const client = requireSupabase(); const { data: auth, error: authError } = await client.auth.getUser(); if (authError) throw authError; if (!auth.user) throw new Error('Authentication required to upload personalization photos.'); const extension = file.name.split('.').pop(); const path = `${auth.user.id}/${crypto.randomUUID()}.${extension}`; const { data, error } = await client.storage.from('customer-personalization').upload(path, file, { upsert: false, contentType: file.type }); if (error) throw error; return { storagePath: data.path, originalFilename: file.name }; }
export async function attachPersonalizationAsset(asset) { const { data, error } = await requireSupabase().from('personalization_assets').insert(asset).select().single(); if (error) throw error; return data; }
// The customer-personalization bucket is private, so a stored public_url (if any) will not
// open directly — admins need a short-lived signed URL, generated using their own authenticated
// session (RLS already allows is_admin() to read this bucket). Nothing is exposed to the frontend
// beyond what the admin's own session already grants.
export async function getPersonalizationSignedUrl(storagePath, expiresInSeconds = 3600) { const { data, error } = await requireSupabase().storage.from('customer-personalization').createSignedUrl(storagePath, expiresInSeconds); if (error) throw error; return data.signedUrl; }
