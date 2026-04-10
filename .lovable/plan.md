

## Plan: Clean `supabase/config.toml`

### Change

Edit `supabase/config.toml` to remove all 18 `[functions.*]` blocks that set `verify_jwt = false`. Keep only the project-level settings (`project_id`, `[api]`, `[db]`, `[studio]`, `[auth]`, `[auth.email]`).

### Resulting file content

```toml
project_id = "fvzjfvxdmoylrcynnwsv"

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[db]
port = 54322
shadow_port = 54320
major_version = 15

[studio]
enabled = true
port = 54323
api_url = "http://127.0.0.1"

[auth]
enabled = true
site_url = "http://127.0.0.1:3000"
additional_redirect_urls = ["https://127.0.0.1:3000"]
jwt_expiry = 3600
enable_refresh_token_rotation = true
refresh_token_reuse_interval = 10
enable_signup = true
enable_anonymous_sign_ins = false

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false
```

### Verification after commit

1. `rg -n "verify_jwt = false" supabase/config.toml` → no output (0 matches)
2. Exact diff showing removal of all 18 function blocks

### Files changed
- `supabase/config.toml` (single file, removal only)

