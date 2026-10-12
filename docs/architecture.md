# Architecture

```text
Browser (React + Vite)
       |
       | HTTPS / JSON REST
       v
Node.js + Express API
  |          |             |
  |          |             +--> Authorization + audit services
  |          |
  |          +--> Master PostgreSQL (Neon)
  |                 - organizations
  |                 - users
  |                 - tenant DB routing reference
  |                 - subscription / trial
  |
  +--> Tenant PostgreSQL DB selected from master record
        - employees
        - products
        - orders
        - activity_logs
```

## Tenant isolation
After authentication, the API reloads the user and organization from the master database and uses the tenant database name stored in that trusted record. The browser cannot supply a tenant database name or connection string. Public catalog routes resolve the organization ID through the master database before connecting to the mapped tenant database.

## Database-per-tenant considerations
Database-per-tenant offers a strong separation boundary but increases provisioning complexity, connection-pool count, migrations, backup, and operational overhead. Confirm Neon API permissions, owner roles, quotas, and branch strategy before using this architecture for real customers.
