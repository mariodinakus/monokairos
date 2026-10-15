# Security and deployment notes

MONO is a public, read-only information app, without end-user accounts. No protection is a guarantee against compromise.

Implemented controls: CSP without inline scripts/eval, frame blocking, MIME sniffing protection, no-referrer policy, limited browser permissions, HTTPS policy, fixed upstream hosts, coordinate/range validation, outbound timeouts, generic upstream errors, cached/coalesced NOAA and GCN requests, local vendor files for Astronomy Engine/Leaflet, integrity checking for the pinned globe.gl bundle, and an in-memory API burst limiter.

The burst limiter applies to each warm function instance; it is **not a distributed rate limit or DDoS firewall**. Configure and verify a Vercel WAF rule for `/api/*` if required. Platform cache, firewall, logging and spending settings are managed outside this repository. No paid service or new account is required by this change.

Owner actions still required:

- Enable MFA/passkeys on GitHub, Vercel and the email account; keep recovery codes privately offline.
- Review collaborator access, app installations and deployment tokens. Remove unnecessary access; rotate any credential with suspected exposure.
- Protect `main` from deletion/force pushes and require successful Application checks. Verify how these rules affect the owner's deployment workflow.
- Check Vercel firewall rules, usage alerts, log retention and the hosting DPA/international transfer settings. Free-tier allowances may change; do not enable paid features without a budget decision.
- Complete the operator identity/contact details and review `privacy.html` before treating it as a completed GDPR notice.
- Keep vendored libraries updated and preserve their licenses. Recompute the globe.gl integrity value when upgrading that bundle.

Do not put tokens, private information or exploit details into public issues. A private security contact must be supplied by the operator. Do not test attacks on third-party data services.

Validation: `node --test tests/*.test.cjs`; syntax checks for scripts and handlers; browser checks with live NOAA/GCN data, local-sky cards, both languages, privacy controls, radar and globe loading. A credential-pattern scan of current tracked text found no matches; this is not a forensic audit of history or hosting secrets.
