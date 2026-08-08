import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { requireAuth } from '../middleware/requireAuth';

const router = Router();
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

/** GET /account/me — profile + linked Spark Codes. */
router.get('/me', requireAuth, async (req, res) => {
  const userId = req.authedUser!.userId;

  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (accountErr || !account) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const { data: sparkCodes } = await supabase
    .from('spark_codes')
    .select('*')
    .eq('claimed_by', userId);

  res.json({ account, sparkCodes: sparkCodes ?? [] });
});

/** PATCH /account/me — currently just username. body: { username } */
router.patch('/me', requireAuth, async (req, res) => {
  const { username } = req.body ?? {};
  const userId = req.authedUser!.userId;

  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: 'Username must be 3-20 characters: letters, numbers, underscore.' });
    return;
  }

  const { data: clash } = await supabase
    .from('accounts')
    .select('user_id')
    .eq('username', username)
    .neq('user_id', userId)
    .maybeSingle();

  if (clash) {
    res.status(409).json({ error: 'Username already taken.' });
    return;
  }

  const { data: updated, error } = await supabase
    .from('accounts')
    .update({ username })
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !updated) {
    res.status(500).json({ error: error?.message ?? 'Could not update username.' });
    return;
  }

  res.json({ account: updated });
});

/**
 * DELETE /account/me — deletes the Supabase Auth user, which cascades to accounts/
 * spark_codes/sessions via the FK ON DELETE CASCADE set up in 001_init_keystone.sql.
 */
router.delete('/me', requireAuth, async (req, res) => {
  const { error } = await supabase.auth.admin.deleteUser(req.authedUser!.userId);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(204).send();
});

/** GET /account/sessions — active session/device list for the Account page. */
router.get('/sessions', requireAuth, async (req, res) => {
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', req.authedUser!.userId)
    .eq('revoked', false)
    .order('last_active_at', { ascending: false });

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json({ sessions: sessions ?? [] });
});

/** POST /account/sessions/:id/revoke */
router.post('/sessions/:id/revoke', requireAuth, async (req, res) => {
  const { error } = await supabase
    .from('sessions')
    .update({ revoked: true })
    .eq('session_id', req.params.id)
    .eq('user_id', req.authedUser!.userId); // scoped to the caller's own sessions only

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(204).send();
});

export default router;
