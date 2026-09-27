// Unit tests never open a real connection (only construct a DataSource in
// memory), but importing data-source.ts still validates the db group at
// module-load time. The `coverage` CI job sets no env vars at all, so this
// gives it safe fallback values without overriding a real local .env.
process.env.DB_HOST ??= 'localhost';
process.env.DB_PORT ??= '5432';
process.env.DB_USERNAME ??= 'checkout';
process.env.DB_PASSWORD ??= 'checkout';
process.env.DB_NAME ??= 'checkout';
