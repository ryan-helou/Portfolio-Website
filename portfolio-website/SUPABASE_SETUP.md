# Supabase Setup Instructions for Portfolio Key Feature

Follow these steps to enable the portfolio save/load feature with database persistence.

---

## Step 1: Create a Supabase Account (2 minutes)

1. Go to https://supabase.com
2. Click **"Start your project"** or **"Sign Up"**
3. Sign up with GitHub, Google, or email
4. Verify your email if required

---

## Step 2: Create a New Project (2 minutes)

1. Once logged in, click **"New Project"**
2. Fill in the details:
   - **Name**: `portfolio-tracker` (or any name you prefer)
   - **Database Password**: Create a strong password (save it somewhere safe)
   - **Region**: Choose the closest region to you
   - **Pricing Plan**: Select **"Free"** (no credit card required)
3. Click **"Create new project"**
4. Wait 1-2 minutes for the project to be provisioned (you'll see a loading screen)

---

## Step 3: Run the SQL Script (1 minute)

1. In your Supabase dashboard, find the left sidebar
2. Click on **"SQL Editor"** (it looks like a code icon)
3. Click **"New query"**
4. Open the file `supabase-setup.sql` in this directory
5. Copy the entire contents of that file
6. Paste it into the SQL Editor
7. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
8. You should see a success message: "Success. No rows returned"

**What this does:** Creates the `portfolios` table in your database with proper structure and permissions.

---

## Step 4: Get Your Supabase Credentials (1 minute)

1. In the left sidebar, click **"Settings"** (gear icon at the bottom)
2. Click **"API"** in the Settings menu
3. You'll see two important values:
   - **Project URL** (looks like: `https://abcdefghijk.supabase.co`)
   - **anon public** key (under "Project API keys" - it's a long string starting with `eyJ...`)
4. Keep this page open - you'll need these values in the next step

---

## Step 5: Add Credentials to Your .env File (1 minute)

1. Open your `.env` file in the project root (same folder as `package.json`)
   - If it doesn't exist, create it by copying `.env.example`
2. Add these two lines at the end:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...your-long-key-here
```

3. Replace the values with your actual credentials from Step 4
4. Save the file

**Important:**
- Make sure there are NO quotes around the values
- Make sure there are NO spaces before or after the `=` sign
- Your `.env` file should never be committed to git (it's already in `.gitignore`)

---

## Step 6: Restart Your Development Server

If your app is currently running:

1. Stop the server (Ctrl+C in the terminal)
2. Start it again:
   ```bash
   npm run dev
   ```

**Why?** Vite only reads environment variables on startup, so you need to restart for the new Supabase credentials to be loaded.

---

## Step 7: Test the Feature

1. Open your app in the browser (usually `http://localhost:5173`)
2. Look at the top-right corner - you should see:
   - An input field for portfolio key
   - "Save" button
   - "Load" button
3. Add some stocks to your portfolio
4. Enter a key name in the input (e.g., "myportfolio")
5. Click **"Save"**
6. You should see a success toast message
7. Refresh the page - your holdings should still be there
8. Try loading from another browser or device using the same key!

---

## Troubleshooting

### "Supabase not configured" message
- Check that your `.env` file has both `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Make sure you restarted the dev server after adding the credentials
- Check that there are no typos in the variable names

### "Failed to save portfolio" error
- Check that you ran the SQL script in Step 3
- Go to Supabase dashboard → Table Editor → verify `portfolios` table exists
- Check browser console (F12) for detailed error messages

### SQL script errors
- Make sure you copied the entire `supabase-setup.sql` file
- If you see errors about objects already existing, that's okay - it means the table was already created
- You can re-run the script safely - it won't duplicate anything

### Key already exists prompt doesn't appear
- This is actually expected on the first save
- The prompt only appears when you try to save to a key that already exists in the database
- Try saving with the same key twice to test this feature

---

## How It Works

### Database Structure
Your portfolios are stored in a PostgreSQL database with this structure:

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Unique identifier (auto-generated) |
| key | text | Your portfolio key (e.g., "myportfolio") |
| holdings | jsonb | Array of {symbol, shares} objects |
| created_at | timestamp | When the portfolio was first created |
| updated_at | timestamp | When it was last updated |

### Security
- Currently set to **public read/write** (anyone with a key can view/edit)
- No authentication required
- Your keys should be kept private (like passwords)
- Future enhancement: Add password protection for keys

### Data Flow
1. **Save**: Holdings → Supabase database (with your key)
2. **Load**: Key → Query database → Load holdings
3. **Refresh**: Key stored in localStorage → Auto-load from database

---

## Next Steps

### Verify Your Database
1. Go to Supabase dashboard → **Table Editor**
2. Click on the **portfolios** table
3. You should see your saved portfolios with their keys and holdings

### Share Your Portfolio
1. Give your portfolio key to someone (e.g., "myportfolio")
2. They enter the key and click "Load"
3. They'll see your exact holdings!

### Update Your Portfolio
1. Make changes to your holdings
2. Click "Save" with the same key
3. Confirm the overwrite prompt
4. Your portfolio is updated in the database

---

## FAQ

**Q: Is my data safe?**
A: Your data is stored in Supabase's secure PostgreSQL database with automatic backups. However, since keys are public, anyone who knows your key can access/modify that portfolio.

**Q: What's the free tier limit?**
A: 500MB database storage, 2GB bandwidth per month, and 50,000 monthly active users. More than enough for personal use!

**Q: Can I have multiple portfolios?**
A: Yes! Just use different keys (e.g., "retirement", "daytrading", "longterm")

**Q: What if I forget my key?**
A: Unfortunately, there's no key recovery system right now. Make sure to write down your keys somewhere safe.

**Q: Can I delete a portfolio?**
A: Currently, the UI doesn't have a delete feature. You can delete directly in Supabase: Dashboard → Table Editor → portfolios → delete the row.

**Q: Does this work offline?**
A: No, you need an internet connection to save/load from the database. However, your last loaded portfolio is cached locally.

---

## Support

If you run into any issues:
1. Check the browser console (F12 → Console tab) for error messages
2. Verify your Supabase credentials in `.env`
3. Check that the `portfolios` table exists in your Supabase dashboard
4. Make sure you restarted the dev server after adding credentials

---

## Summary Checklist

- [ ] Created Supabase account
- [ ] Created new project
- [ ] Ran SQL script in SQL Editor
- [ ] Copied Project URL and anon key
- [ ] Added credentials to `.env` file
- [ ] Restarted dev server
- [ ] Tested save feature
- [ ] Tested load feature
- [ ] Verified data in Supabase Table Editor

**You're all set! Enjoy your database-powered portfolio tracker!** 🚀
