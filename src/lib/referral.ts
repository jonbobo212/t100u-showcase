/** Sub-agent referral attribution (see docs/HANDOFF_TO_APLIFY.md).
 * ?ref={agency_code} → first-touch cookies set by src/proxy.ts, read by the
 * consultation server action. */
export const REF_COOKIE = "t100u_ref";
export const REF_AT_COOKIE = "t100u_ref_at";
export const REF_CODE_PATTERN = /^[a-z0-9-]{2,32}$/;
export const REF_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days
