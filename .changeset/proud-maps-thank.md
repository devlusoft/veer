---
"@devlusoft/veer": patch
---

Fix `useAsyncData` and `useFetch` showing data from another page after client navigation. Entries are now dropped when their last consumer unmounts, the server payload is only read during hydration, a reactive key switches to its own entry, and a new run aborts the previous one and discards its result. As a result, concurrent `refresh()` calls no longer share a single request: the last one wins.
