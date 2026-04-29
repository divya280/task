# Appointment Booking

## Setup

1. Go to [supabase.com](https://supabase.com), sign in, and create a new project

2. Once the project is ready, go to **SQL Editor** and run the contents of `schema.sql`

3. Place the `.env` file you received into the root of this project

4. Install dependencies:
   ```bash
   npm install
   ```

5. Seed the database (creates all users, the admin login, slots, and a sample appointment):
   ```bash
   npm run seed
   ```

6. Start the dev server:
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000)

## Test Credentials

| Role     | Email               | Password   |
|----------|---------------------|------------|
| Doctor 1 | doctor1@test.com    | doctor123  |
| Doctor 2 | doctor2@test.com    | doctor123  |
| Doctor 3 | doctor3@test.com    | doctor123  |
| Patient 1| patient1@test.com   | patient123 |
| Patient 2| patient2@test.com   | patient123 |
| Patient 3| patient3@test.com   | patient123 |
| Admin    | admin@test.com      | admin123   |
