import crypto from 'crypto';
import { Product } from './types';

// Unambiguous alphabet — no 0/O/1/I/L to avoid support headaches reading codes aloud.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

const PRODUCT_ABBR: Record<Product, string> = {
  atlas: 'ATL',
  veridia: 'VER',
};

function randomGroup(length: number): string {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generates a Spark Code in the form SPRK-ATL-XXX-XXX-XXX. */
export function generateSparkCode(product: Product): string {
  const abbr = PRODUCT_ABBR[product];
  return `SPRK-${abbr}-${randomGroup(3)}-${randomGroup(3)}-${randomGroup(3)}`;
}

const SPARK_CODE_RE = /^SPRK-[A-Z]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

export function isValidSparkCodeFormat(code: string): boolean {
  return SPARK_CODE_RE.test(code);
}
