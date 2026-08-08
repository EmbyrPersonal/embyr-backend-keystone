import { Router } from 'express';
import { supabase } from '../supabaseClient';
import { requireAuth, requireRole } from '../middleware/requireAuth';
import { generateSparkCode, isValidSparkCodeFormat } from '../keyUtils';
import { Product } from '../types';

const router = Router();

/**
 * POST /spark-codes/redeem
 * header: Authorization: Bearer <access_token>
 * body: { code, hardwareId? }
 */
router.post('/redeem', requireAuth, async (req, res) => {
  const { code, hardwareId } = req.body ?? {};
  const userId = req.authedUser!.userId;

  if (typeof code !== 'string' || !isValidSparkCodeFormat(code)) {
    res.status(400).json({ error: 'Malformed Spark Code.' });
    return;
  }

  const { data: sparkCode, error: fetchErr } = await supabase
    .from('spark_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (fetchErr) {
    res.status(500).json({ error: fetchErr.message });
    return;
  }

  if (!sparkCode) {
    res.status(404).json({ error: 'Spark Code not found.' });
    return;
  }

  if (sparkCode.status !== 'active') {
    // Track the failed attempt for abuse detection even though this code can't be claimed.
    await supabase
      .from('spark_codes')
      .update({ redemption_attempts: sparkCode.redemption_attempts + 1 })
      .eq('code', code);
    res.status(409).json({ error: `Spark Code is ${sparkCode.status}.` });
    return;
  }

  const ip = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim() ?? req.ip ?? null;
  const now = new Date();

  const update: Record<string, unknown> = {
    status: 'claimed',
    claimed_by: userId,
    claimed_time: now.toISOString(),
    ip_address_at_claim: ip,
  };

  if (typeof hardwareId === 'string' && hardwareId.length > 0) {
    update.hardware_id = hardwareId;
  }

  if (sparkCode.is_trial) {
    update.trial_start_date = now.toISOString();
    if (sparkCode.trial_duration_days) {
      const expiry = new Date(now.getTime() + sparkCode.trial_duration_days * 86400000);
      update.trial_expiry_date = expiry.toISOString();
    }
  }

  const { data: claimed, error: updateErr } = await supabase
    .from('spark_codes')
    .update(update)
    .eq('code', code)
    .eq('status', 'active') // guards against a race between two simultaneous redeem calls
    .select()
    .single();

  if (updateErr || !claimed) {
    res.status(409).json({ error: 'Spark Code was claimed by someone else just now.' });
    return;
  }

  const { data: account } = await supabase
    .from('accounts')
    .select('products_owned')
    .eq('user_id', userId)
    .single();

  const productsOwned: string[] = account?.products_owned ?? [];
  if (!productsOwned.includes(claimed.product)) {
    await supabase
      .from('accounts')
      .update({ products_owned: [...productsOwned, claimed.product] })
      .eq('user_id', userId);
  }

  res.json({ sparkCode: claimed });
});

/**
 * POST /spark-codes/generate
 * header: Authorization: Bearer <access_token>  (developer role required)
 * body: { product, isTrial?, trialDurationDays?, licenseTier?, platform?, notes? }
 *
 * Manual generation only, per current product decision — no purchase/checkout flow yet.
 * Defaults to an infinite, non-expirable code unless trial fields are explicitly set.
 */
router.post('/generate', requireAuth, requireRole('developer'), async (req, res) => {
  const { product, isTrial, trialDurationDays, licenseTier, platform, notes } = req.body ?? {};

  if (product !== 'atlas' && product !== 'veridia') {
    res.status(400).json({ error: 'product must be "atlas" or "veridia".' });
    return;
  }

  const { data: authorAccount } = await supabase
    .from('accounts')
    .select('username')
    .eq('user_id', req.authedUser!.userId)
    .single();

  let code = generateSparkCode(product as Product);
  // Extremely unlikely collision given the alphabet/length, but guard anyway.
  for (let attempts = 0; attempts < 5; attempts++) {
    const { data: clash } = await supabase.from('spark_codes').select('code').eq('code', code).maybeSingle();
    if (!clash) break;
    code = generateSparkCode(product as Product);
  }

  const row = {
    code,
    product,
    status: 'active',
    generation_method: 'manual',
    author: authorAccount?.username ?? null,
    is_trial: Boolean(isTrial),
    trial_duration_days: isTrial && typeof trialDurationDays === 'number' ? trialDurationDays : null,
    license_tier: typeof licenseTier === 'string' ? licenseTier : null,
    platform: typeof platform === 'string' ? platform : null,
    notes: typeof notes === 'string' ? notes : null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('spark_codes')
    .insert(row)
    .select()
    .single();

  if (insertErr) {
    res.status(500).json({ error: insertErr.message });
    return;
  }

  res.status(201).json({ sparkCode: inserted });
});

export default router;
