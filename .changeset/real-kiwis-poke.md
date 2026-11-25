---
"@devlusoft/veer": patch
---

`veer build` default `NODE_ENV` to `production` before loading `.env` files, so `.env.development` is no longer loaded in production, and `veer start` respects a `NODE_ENV` from the environment (e.g. `staging`) instead of forcing `production`
