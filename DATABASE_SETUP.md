# Database Setup Guide

## Prerequisites

1. Install PostgreSQL:
   - **macOS**: `brew install postgresql && brew services start postgresql`
   - **Ubuntu/Debian**: `sudo apt install postgresql postgresql-contrib`
   - **Windows**: Download from [postgresql.org](https://www.postgresql.org/download/)

2. Ensure PostgreSQL is running:
   ```bash
   # Check if running
   pg_isready

   # Start if needed (macOS)
   brew services start postgresql

   # Start if needed (Linux)
   sudo systemctl start postgresql
   ```

## Database Creation

1. Create the database:
   ```bash
   createdb rlmafia
   ```

2. Run the schema:
   ```bash
   psql rlmafia < schema.sql
   ```

   Or manually:
   ```bash
   psql rlmafia
   # Then paste the contents of schema.sql
   ```

3. Verify tables were created:
   ```bash
   psql rlmafia -c "\dt"
   ```

   You should see:
   - guilds
   - players
   - active_rounds
   - game_history
   - schema_migrations

## Environment Configuration

1. Copy or edit `src/.env`:
   ```bash
   cd src
   cp .env .env.local  # if you want to keep original
   ```

2. Add the DATABASE_URL:
   ```
   DISCORD_TOKEN=your_bot_token_here
   DATABASE_URL=postgresql://localhost/rlmafia
   OWNERS=["your_discord_user_id"]
   ```

   For custom PostgreSQL settings:
   ```
   DATABASE_URL=postgresql://username:password@localhost:5432/rlmafia
   ```

## Testing the Connection

1. Build the bot:
   ```bash
   export PATH="$HOME/.bun/bin:$PATH"
   bun run build
   ```

2. Start the bot:
   ```bash
   bun run dev
   ```

3. Watch for "Database connected successfully" in the logs

## Troubleshooting

### Connection refused
- Ensure PostgreSQL is running: `pg_isready`
- Check if port 5432 is in use: `lsof -i :5432`

### Authentication failed
- Update DATABASE_URL with correct username/password
- Default PostgreSQL user is usually your system username

### Database doesn't exist
- Run: `createdb rlmafia`

### Permission denied
- Grant permissions: `psql -c "GRANT ALL PRIVILEGES ON DATABASE rlmafia TO your_username;"`

## Quick Reset (Development)

To wipe and recreate the database:
```bash
dropdb rlmafia && createdb rlmafia && psql rlmafia < schema.sql
```

## Production Deployment

For production (e.g., Railway, Heroku, Render):

1. Add DATABASE_URL environment variable in your hosting dashboard
2. Schema will be created automatically on first connection
3. Ensure `NODE_ENV=production` is set
4. SSL will be enabled automatically for production databases
