---
"@devlusoft/veer": patch
---

Fix `VeerPage` reusing the page component when only a route param changes, so `/productos/1` to `/productos/2` kept the first product. The page now has a key built from the matched route with its params substituted, so a param change remounts it, while a change in the query or the hash does not.
