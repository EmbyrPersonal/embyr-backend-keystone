import { Request, Response, NextFunction } from 'express';
import { supabase } from '../supabaseClient';

/**
 * Verifies the `Authorization: Bearer <access_token>` header against Supabase Auth,
 * then loads the matching `accounts` row and attaches { userId, role } to req.authedUser.
 * Rejects if the account is suspended/banned/deleted.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;

  if (!token) {
    res.status(401).json({ error: 'Missing Authorization bearer token' });
    return;
  }

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { data: account, error: accountErr } = await supabase
    .from('accounts')
    .select('user_id, role, status')
    .eq('user_id', userData.user.id)
    .single();

  if (accountErr || !account) {
    res.status(401).json({ error: 'No EmbyrKeystone account found for this user' });
    return;
  }

  if (account.status !== 'active') {
    res.status(403).json({ error: `Account is ${account.status}` });
    return;
  }

  req.authedUser = { userId: account.user_id, role: account.role };
  next();
}

export function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.authedUser || !allowed.includes(req.authedUser.role)) {
      res.status(403).json({ error: 'Insufficient role for this action' });
      return;
    }
    next();
  };
}
