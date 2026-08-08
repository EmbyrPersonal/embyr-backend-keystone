export type Role = 'user' | 'moderator' | 'developer' | 'beta_tester';
export type AccountStatus = 'active' | 'suspended' | 'banned' | 'deleted';
export type SparkCodeStatus = 'active' | 'claimed' | 'revoked' | 'expired';
export type GenerationMethod = 'manual' | 'purchase' | 'trial';
export type Product = 'atlas' | 'veridia';

export interface Account {
  user_id: string;
  username: string;
  email: string;
  created_at: string;
  last_login: string | null;
  email_verified: boolean;
  products_owned: Product[];
  role: Role;
  permissions: Record<string, boolean>;
  status: AccountStatus;
  suspension_reason: string | null;
  suspended_by: string | null;
  suspended_until: string | null;
  pin_hash: string | null;
  pin_updated_at: string | null;
  hardware_ids: string[];
  ip_last_known: string | null;
  notes: string | null;
  billing_email: string | null;
  payment_method_ref: string | null;
  subscription_status: string | null;
}

export interface SparkCode {
  code: string;
  product: Product;
  status: SparkCodeStatus;
  generation_method: GenerationMethod;
  author: string | null;
  generation_time: string;
  claimed_by: string | null;
  claimed_time: string | null;
  is_trial: boolean;
  trial_duration_days: number | null;
  trial_start_date: string | null;
  trial_expiry_date: string | null;
  trial_converted: boolean;
  converted_order_id: string | null;
  revoked_by: string | null;
  revoked_time: string | null;
  revoked_reason: string | null;
  order_id: string | null;
  purchase_platform: string | null;
  price_paid: number | null;
  currency: string | null;
  license_tier: string | null;
  platform: string | null;
  expiration_date: string | null;
  hardware_id: string | null;
  ip_address_at_claim: string | null;
  redemption_attempts: number;
  notes: string | null;
  support_ticket_id: string | null;
}

// Attached to Express's Request by requireAuth once a bearer token has been verified.
export interface AuthedUser {
  userId: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      authedUser?: AuthedUser;
    }
  }
}
