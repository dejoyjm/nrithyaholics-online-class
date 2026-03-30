# NrithyaHolics Development Principles

## Edge Function Rules
1. Fire-and-forget ONLY after synchronous version is proven working in prod
2. Every deploy must be verified: run `supabase functions list` and confirm version incremented
3. Add [feature-name] prefix to all console.logs so Supabase log filter works

## Payment Flow Rules
4. Razorpay webhook creates buyer booking BEFORE verify-payment runs — always_existed fires in prod
5. Any logic in verify-payment must also exist in the already_existed branch
6. Test payments must use sessions the test user has NEVER booked

## Testing Rules  
7. Feature is NOT done until one real end-to-end payment confirmed in DB — build passing is not enough
8. Every payment test: check DB immediately with SQL, don't trust UI alone
9. New chat for each sprint — context bloat causes missed constraints

## React Rules
10. Never capture state in Razorpay handler closure — always read from sessionStorage at call time

## RLS Rules
11. Never write RLS policy that queries the same table it protects — causes recursive 500
12. After any schema change, test with the actual user role (not postgres)

Commit: git add docs/DEVELOPMENT_PRINCIPLES.md
        git commit -m "docs: add development principles from guest booking post-mortem"
        git push origin master


Append to docs/DEVELOPMENT_PRINCIPLES.md:

## Known Architectural Gaps (prioritised)

### P1 — Before high-demand session launch
- Pre-payment capacity locking: reserve seat on create-razorpay-order 
  with 10-min expiry, release if payment not completed

### P2
- Guest invite for new users: if guest has no account, magic link 
  creates account but claim needs ?session= param in invite URL 
  to auto-land on session page and trigger claim
- Notification retry: if Resend fails, booking confirmation is lost 
  silently. Stamp confirmation_email_sent_at only on success; 
  admin attention banner already catches missing stamps.

### P3
- Frontend guest email validation: regex + deduplicate against 
  buyer email before allowing payment

### Already done (reviewer missed)
- Razorpay webhook safety net: razorpay-webhook v19 handles 
  payment.captured server-side regardless of browser state

Commit: git add docs/DEVELOPMENT_PRINCIPLES.md
        git commit -m "docs: add architectural gaps from external review"
        git push origin master