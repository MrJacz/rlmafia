# Database Setup Guide

This bot uses **PostgreSQL with Prisma ORM** for persistent storage of player ELO ratings and game history.

## Quick Start

### 1. Install PostgreSQL

**Option A: Docker (Recommended)**
```bash
docker run --name rlmafia-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:16
```

**Option B: Local Installation**
- **macOS**: `brew install postgresql@16 && brew services start postgresql`
- **Ubuntu/Debian**: `sudo apt install postgresql-16 postgresql-contrib`
- **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/)

### 2. Create Database

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE rlmafia;

# Exit
\q
```

Or using command line:
```bash
createdb rlmafia
```

### 3. Configure Environment Variables

Create a `.env` file in the project root:

```env
# Discord Bot
DISCORD_TOKEN=your_discord_bot_token_here
OWNERS=["your_discord_user_id"]

# Database (Prisma)
DATABASE_URL="postgresql://postgres:password@localhost:5432/rlmafia?schema=public"
```

**Connection String Format**:
`postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=SCHEMA`

### 4. Run Prisma Migrations

```bash
# Install dependencies
npm install

# Generate Prisma Client
npm run prisma:generate

# Create and apply migrations
npm run prisma:migrate

# Or push schema directly (development only)
npm run prisma:push
```

### 5. Verify Setup

```bash
# Open Prisma Studio to view your database
npm run prisma:studio
```

Visit http://localhost:5555 to see your database tables and data.

## Schema Overview

The database uses **Prisma ORM** with the following models:

- **Guild** - Per-server game configuration (numMafia, gameState, activePlayers)
- **Player** - Player stats and ELO ratings (persistent across sessions)
- **ActiveRound** - Current game state (roles, teams, votes)
- **GameHistory** - Completed rounds for analytics
- **SchemaMigration** - Tracks database schema versions

### Key Features

✅ **Per-server isolation**: Each Discord server has its own player database
✅ **ELO persistence**: Ratings survive bot restarts
✅ **Automatic migrations**: Schema changes are tracked and versioned
✅ **Type-safe queries**: Prisma generates TypeScript types from your schema
✅ **Cascading deletes**: Removing a guild automatically cleans up all related data

## Available Scripts

```bash
# Generate Prisma Client (after schema changes)
npm run prisma:generate

# Create a new migration
npm run prisma:migrate

# Push schema without creating migration (dev only)
npm run prisma:push

# Open database GUI
npm run prisma:studio

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# View migration status
npx prisma migrate status

# Format Prisma schema
npx prisma format
```

## Troubleshooting

### Connection Errors

If you see `P1000: Authentication failed`:
1. Check your `DATABASE_URL` in `.env`
2. Verify PostgreSQL is running: `pg_isready`
3. Test connection: `psql $DATABASE_URL`
4. Check PostgreSQL logs: `tail -f /usr/local/var/log/postgres.log` (macOS)

### Migration Issues

If migrations fail:
```bash
# View current status
npx prisma migrate status

# Reset and start fresh (WARNING: deletes data)
npx prisma migrate reset

# Mark migrations as applied without running
npx prisma migrate resolve --applied <migration_name>
```

### Prisma Client Not Found

If you see "Cannot find module '@prisma/client'":
```bash
npm install
npm run prisma:generate
```

### Port Already in Use

If PostgreSQL won't start (port 5432 in use):
```bash
# Find process using port
lsof -i :5432

# Kill it if needed
kill -9 <PID>
```

## Making Schema Changes

When modifying `prisma/schema.prisma`:

1. **Edit the schema file** with your changes
2. **Format the schema**: `npx prisma format`
3. **Create migration**: `npm run prisma:migrate`
4. **Name your migration** descriptively (e.g., "add_player_stats")
5. **Commit both files**: `schema.prisma` and the new migration file

The migration will be automatically applied when deployed.

## Production Deployment

For production, use a hosted PostgreSQL service:

### Recommended Providers

- **Railway**: https://railway.app (Free tier, auto-deploys)
- **Supabase**: https://supabase.com (Free tier with 500MB)
- **Neon**: https://neon.tech (Serverless Postgres, 3GB free)
- **AWS RDS**: https://aws.amazon.com/rds/ (Scalable, paid)
- **Google Cloud SQL**: https://cloud.google.com/sql (Enterprise, paid)

### Deployment Steps

1. Create a PostgreSQL database on your chosen provider
2. Copy the connection string
3. Set `DATABASE_URL` environment variable in your hosting platform
4. Deploy your bot
5. Migrations will run automatically on first start

### Production Tips

- Enable SSL in production (most providers require it)
- Use connection pooling for better performance (Prisma Accelerate)
- Set up automated backups
- Monitor query performance with Prisma Studio or pgAdmin

## Quick Reset (Development)

To wipe and recreate the database:
```bash
# Using Prisma
npx prisma migrate reset

# Or manually
dropdb rlmafia && createdb rlmafia && npm run prisma:migrate
```

## Migration from schema.sql

If you previously used `schema.sql`, you can migrate to Prisma:

1. **Backup your data** (if any exists):
   ```bash
   pg_dump rlmafia > backup.sql
   ```

2. **Drop the old database**:
   ```bash
   dropdb rlmafia
   createdb rlmafia
   ```

3. **Run Prisma migrations**:
   ```bash
   npm run prisma:migrate
   ```

4. **Restore data** (if needed):
   ```bash
   psql rlmafia < backup.sql
   ```
