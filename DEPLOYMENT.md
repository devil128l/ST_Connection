# ST CONNECTION – Cloudflare D1 Database & R2 Bucket Deployment Guide

Yeh complete guide aapko batayegi ki **Cloudflare D1 (SQL Database)** aur **Cloudflare R2 (Media Storage Bucket)** ko ST CONNECTION me kaise setup aur deploy karna hai.

---

## 🌟 Overview

* **Database**: **Cloudflare D1** (Serverless SQLite at the Edge) – Saare users, chats, messages, groups, channels, aur security settings ko store karega.
* **Storage**: **Cloudflare R2** (S3-compatible Object Storage) – Photos, videos, voice messages, documents, aur avatars ko zero-egress fee ke sath store karega.
* **Main Chat Domain**: `https://stconnection.bond`
* **Admin Website Domain**: `https://admin.stconnection.bond`
* **Media Domain (Optional)**: `https://media.stconnection.bond`

---

## 🚀 PART 1: Cloudflare D1 Database Setup

Cloudflare D1 aapka primary serverless relational SQL database hai.

### Step 1.1: D1 Database Create Karein

Apne terminal me project directory me yeh command chalayein:

```bash
npx wrangler d1 create stconnection-db
```

Output me aapko ek **database_id** milega, jaise:
```
✅ Successfully created DB 'stconnection-db'!
database_name = "stconnection-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

### Step 1.2: `wrangler.toml` me Database ID dalein

`wrangler.toml` me `database_id` ko apne actual UUID se update karein:
```toml
[[d1_databases]]
binding = "DB"
database_name = "stconnection-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
migrations_dir = "migrations"
```

### Step 1.3: D1 Database me Schema Execute Karein (Table Structure & Initial Seed)

Hamne complete SQL schema aur initial admin seeds `schema.sql` aur `migrations/0001_d1_schema.sql` me ready kar rakhe hain.

Yeh command run karein:
```bash
# Method A: Direct Schema Execute (Sabse aasan)
npx wrangler d1 execute stconnection-db --file=./schema.sql --remote

# Method B: Wrangler Migrations apply
npx wrangler d1 migrations apply stconnection-db --remote
```

Isse Cloudflare D1 me automatically:
* Saare 17 production tables create ho jayenge (`users`, `chats`, `messages`, `channels`, `stories`, `system_settings`, etc.)
* Super Admin (`superadmin` / `admin@stconnection.bond`) seed ho jayega.
* Gemini AI Assistant bot (`st_ai`) seed ho jayega.
* Official Announcements channel (`st_official`) seed ho jayega.

---

## 📦 PART 2: Cloudflare R2 Bucket Setup (Media, Videos, Voice Notes)

Cloudflare R2 me aapke users ke saare photo, video, audio voice notes aur documents store honge. R2 ki sabse badi khasiyat hai: **Zero egress bandwidth fee** (koi download charges nahi).

### Step 2.1: R2 Bucket Create Karein

Terminal se:
```bash
npx wrangler r2 bucket create stconnection-media
```
Ya fir Cloudflare Dashboard me:
1. [dash.cloudflare.com](https://dash.cloudflare.com/) me login karein.
2. Left menu me **R2 Object Storage** par click karein.
3. **Create bucket** par click karein aur naam rakhein: `stconnection-media`.

### Step 2.2: R2 Bucket ka Public Domain Enable Karein

Taaki uploaded photos aur voice notes chat me dikh sakein:
1. R2 Dashboard me apne bucket `stconnection-media` par click karein.
2. **Settings** tab me jayein.
3. **Public access** section me:
   * Option A (Custom Domain): **Connect Domain** click karke `media.stconnection.bond` jodh dein.
   * Option B (R2.dev Subdomain): **Allow Access** par click karein (aapko ek URL milega jaise `https://pub-xxxxxx.r2.dev`).

### Step 2.3: R2 API Tokens (S3-Compatible Credentials) Generate Karein

1. Cloudflare Dashboard me **R2 Object Storage** main page par jayein.
2. Right side me **Manage R2 API Tokens** par click karein.
3. **Create API token** click karein.
4. Permissions: **Admin Read & Write** select karein.
5. **Create API Token** click karein.
6. Copy kar lein:
   * **Access Key ID**
   * **Secret Access Key**
   * **Endpoint URL** (`https://<account_id>.r2.cloudflarestorage.com`)

---

## 🔑 PART 3: GitHub Secrets Setup (`deploy.yml`)

GitHub Actions automated build aur deployment ke liye repository ke **Settings -> Secrets and variables -> Actions** me yeh secrets add karein:

| Secret Name | Value | Description |
| :--- | :--- | :--- |
| `CLOUDFLARE_API_TOKEN` | `xxxx...` | Cloudflare API Token (Workers, Pages & D1 access) |
| `CLOUDFLARE_ACCOUNT_ID` | `xxxx...` | Apka Cloudflare Account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | `xxxx...` | D1 database ka UUID (e.g. `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `R2_ACCESS_KEY_ID` | `xxxx...` | R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | `xxxx...` | R2 Secret Access Key |
| `R2_BUCKET_NAME` | `stconnection-media` | R2 Bucket ka naam |
| `R2_PUBLIC_URL` | `https://media.stconnection.bond` | R2 public URL ya custom domain |

---

## 🌐 PART 4: Custom Domains Setup

Cloudflare Dashboard me **Compute (Workers & Pages)** -> **stconnection** project open karein -> **Custom domains** tab me add karein:

1. `stconnection.bond` – **Main Chat Application** (Gate Security Code: `782223`)
2. `admin.stconnection.bond` – **Separate Admin Portal** (Login: `admin@stconnection.bond` / `AdminPass782!`)

---

## 🚢 PART 5: Push to GitHub & Live Deploy

Ab sab ready hai! Bas code ko push karein:

```bash
git add .
git commit -m "Configure Cloudflare D1 Database and R2 Object Storage"
git push origin main
```

GitHub Actions automatically:
1. Code ko verify karega.
2. Cloudflare D1 database ke migrations apply karega.
3. Production web app build karega.
4. Cloudflare Pages par live deploy kar dega!

---

## 🛠️ Verification Commands

Database table check karne ke liye:
```bash
npx wrangler d1 execute stconnection-db --command="SELECT username, role, email FROM users;" --remote
```

R2 bucket ke files list karne ke liye:
```bash
npx wrangler r2 object list stconnection-media
```
