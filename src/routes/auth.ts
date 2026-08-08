import { Router } from 'express';
import { supabase, supabaseAnon } from '../supabaseClient';

const router = Router();

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/**
 * POST /auth/signup
 * body: { username, email, password }
 * Creates a Supabase Auth user, then the matching `accounts` row. Atlas access itself
 * is still gated behind a Spark Code — this only creates the EmbyrKeystone identity.
 */
router.post('/signup', async (req, res) => {
  const { username, email, password } = req.body ?? {};

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore.' });
    return;
  }
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required.' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters.' });
    return;
  }

  const { data: existingUsername } = await supabase
    .from('accounts')
    .select('user_id')
    .eq('username', username)
    .maybeSingle();

  if (existingUsername) {
    res.status(409).json({ error: 'Username already taken.' });
    return;
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });

  if (createErr || !created.user) {
    res.status(400).json({ error: createErr?.message ?? 'Could not create account.' });
    return;
  }

  const { error: insertErr } = await supabase.from('accounts').insert({
    user_id: created.user.id,
    username,
    email,
  });

  if (insertErr) {
    // Roll back the auth user so we don't leave an orphaned credential with no profile.
    // supabase-js returns { error } rather than throwing on API-level failures — a prior
    // version of this code awaited this without checking, which let the rollback itself
    // fail silently (an orphaned auth user with no accounts row, blocking future signups
    // with "already registered" and no way to log in) if it hit its own permission error.
    const { error: deleteErr } = await supabase.auth.admin.deleteUser(created.user.id);
    if (deleteErr) {
      console.error(`Signup rollback failed for ${created.user.id}: ${deleteErr.message}. Orphaned auth user needs manual cleanup.`);
    }
    res.status(500).json({ error: 'Could not create account profile: ' + insertErr.message });
    return;
  }

  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session) {
    // Account exists but auto-login failed for some reason — client can just log in manually.
    res.status(201).json({ userId: created.user.id, username, email, session: null });
    return;
  }

  res.status(201).json({
    userId: created.user.id,
    username,
    email,
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at,
    },
  });
});

/**
 * POST /auth/login
 * body: { email, password, deviceName? }
 * Also records a row in `sessions` for the Account page's active-sessions list.
 */
router.post('/login', async (req, res) => {
  const { email, password, deviceName } = req.body ?? {};

  if (typeof email !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Email and password required.' });
    return;
  }

  const { data: signIn, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signInErr || !signIn.session || !signIn.user) {
    res.status(401).json({ error: 'Invalid email or password.' });
    return;
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', signIn.user.id)
    .single();

  if (!account) {
    res.status(404).json({ error: 'No EmbyrKeystone account profile found for this login.' });
    return;
  }

  if (account.status !== 'active') {
    res.status(403).json({ error: `Account is ${account.status}.` });
    return;
  }

  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.ip ?? null;

  await supabase.from('sessions').insert({
    user_id: account.user_id,
    device_name: typeof deviceName === 'string' ? deviceName : null,
    ip_address: ip,
  });

  await supabase
    .from('accounts')
    .update({ last_login: new Date().toISOString(), ip_last_known: ip })
    .eq('user_id', account.user_id);

  res.json({
    account,
    session: {
      accessToken: signIn.session.access_token,
      refreshToken: signIn.session.refresh_token,
      expiresAt: signIn.session.expires_at,
    },
  });
});

/**
 * POST /auth/logout
 * header: Authorization: Bearer <access_token>
 */
router.post('/logout', async (req, res) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return;
  }

  const { error } = await supabase.auth.admin.signOut(token);
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(204).send();
});

/**
 * POST /auth/request-password-reset
 * body: { email }
 * Always responds 200 regardless of whether the email matches an account — doesn't leak
 * which emails are registered. Supabase sends the actual reset email itself.
 */
router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required.' });
    return;
  }

  await supabaseAnon.auth.resetPasswordForEmail(email);
  res.status(200).json({ message: 'If that email is registered, a reset link has been sent.' });
});

export default router;
