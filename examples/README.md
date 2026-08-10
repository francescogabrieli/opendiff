# OpenDiff fixtures

The renderer keeps deterministic browser fixtures behind query parameters so the production path never silently substitutes demo data:

```text
/?fixture=small
/?fixture=medium
/?fixture=rename
/?fixture=deleted
/?fixture=lockfile
/?fixture=large
/?fixture=invalid
/?fixture=stale
```

The catalogue is in [`fixtures/manifest.json`](fixtures/manifest.json). `small-review/` contains a portable `review.json` and `diff.json` pair that can also be served as static data.
