# Tor Browser Developers — signing key (bundled)

File: `torbrowser.asc`  
Fingerprint (must match at runtime):

```
EF6E 286D DA85 EA2A 4BA7 DE68 4E2C 6E87 9329 8290
```

UID: Tor Browser Developers (signing key) `<torbrowser@torproject.org>`

## Verification flow (`tor-daemon.cjs`)

1. Load `torbrowser.asc` via **openpgp** (pure JS) — refuse if fingerprint ≠ above.
2. Download `sha256sums-signed-build.txt` **and** `.asc` from `https://www.torproject.org/dist/…` only (`*.torproject.org`).
3. Verify detached signature with the bundled key (**fail closed** — no hash-only fallback).
4. Read SHA-256 for our Expert Bundle filename from the verified list.
5. Hash local archive; mismatch → delete archive and abort.

Source of this key copy: keys.openpgp.org by fingerprint (synced into repo).
