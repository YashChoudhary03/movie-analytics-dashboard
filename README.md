# CineMetrics — Movie Analytics Dashboard

A full-stack movie analytics dashboard built with **React + Vite**, **Vercel serverless API routes**, and **Supabase PostgreSQL**. Browse, search, and filter ~4,800 TMDB movie records with cascading multi-select filters, real-time pagination, and interactive genre charts powered by Recharts.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18 + Vite (JavaScript)        |
| Charts      | Recharts                            |
| Icons       | Lucide React                        |
| Backend     | Vercel Serverless Functions (Node.js)|
| Database    | Supabase PostgreSQL (via `pg`)      |
| Deployment  | Vercel                              |

---

## Features

- **Cascading multi-select filters** — Genre and Director dropdowns narrow their options based on the other active filters using real PostgreSQL queries. Selecting Drama shows only directors who have Drama movies; adding a year range narrows further.
- **Searchable Director dropdown** — Built-in search input for quickly finding directors across hundreds of names.
- **Search** — Matches both movie titles and director names via `ILIKE`.
- **Year range filters** — Free-form number inputs for "Release year from" and "Release year to".
- **Language, rating, and sort filters** — All applied server-side with parameterized SQL.
- **Pagination** — 12 movies per page; resets to page 1 on any filter change.
- **Analytics panel** — Total movies, average rating, box office, and a top-10 genre bar chart.
- **Loading / error / empty states** — Spinner, retry button, and friendly empty messages.
- **Responsive layout** — Desktop, tablet (≤1250px), and mobile (≤600px).
- **Security** — All SQL queries use parameterized statements (`$1`, `$2`, …); no credentials are ever exposed to the browser.

---

## Database Schema

Five tables in the `public` schema:

```
movies          — movie_id, title, release_year, release_date, overview,
                  original_language, runtime, popularity, vote_average,
                  vote_count, budget, revenue

genres          — genre_id, genre_name
directors       — director_id, director_name
movie_genres    — movie_id, genre_id  (join table)
movie_directors — movie_id, director_id  (join table)
```

The dataset (~4,803 movies, release years 1916–2017) is sourced from the [TMDB 5000 Movie Dataset on Kaggle](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata).

---

## Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A **Supabase** project with the schema above (or any PostgreSQL database)
- **Vercel CLI** for local development: `npm i -g vercel`

---

## Local Setup

### 1. Clone and install

```bash
git clone <your-repo-url>
cd movie-analytics-dashboard
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your real values:

```env
# Supabase Transaction Pooler connection string (port 6543 recommended)
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

> **Never commit `.env`** — it is listed in `.gitignore`. Only `.env.example` (with placeholder values) should be committed.

### 3. Start the development server

```bash
npx vercel dev
```

This starts both the Vite dev server (frontend) and the Vercel serverless functions (`/api/*`) on a single local port (usually `http://localhost:3000`).

---

## Data Import

If you are setting up the database from scratch:

1. Download the TMDB dataset from Kaggle.
2. Run the provided `import_movies.py` script (requires `psycopg2` and `pandas`):

```bash
pip install psycopg2-binary pandas
python import_movies.py
```

The script creates the five tables and populates them from the CSV files.

---

## API Routes

All routes are in `api/` and run as Vercel serverless functions.

| Route           | Description                                      |
|-----------------|--------------------------------------------------|
| `GET /api/movies`   | Paginated, filtered, sorted movie list         |
| `GET /api/filters`  | Cascading filter options (genres, directors, years) |
| `GET /api/analytics`| Global stats and top-10 genre counts           |

### Query parameters — `/api/movies`

| Parameter   | Type   | Description                                     |
|-------------|--------|-------------------------------------------------|
| `search`    | string | Title or director name (ILIKE match)            |
| `genres`    | string | Comma-separated genre names                     |
| `directors` | string | Comma-separated director names                  |
| `language`  | string | ISO 639-1 code (e.g. `en`, `fr`)                |
| `yearFrom`  | number | Minimum release year                            |
| `yearTo`    | number | Maximum release year                            |
| `minRating` | number | Minimum `vote_average` (0–10)                   |
| `sort`      | string | `popularity` \| `rating` \| `revenue` \| `newest` \| `oldest` \| `title` |
| `page`      | number | Page number (default 1)                         |
| `limit`     | number | Results per page (default 12, max 50)           |

### Query parameters — `/api/filters`

Same filter parameters as `/api/movies`. Returns:

```json
{
  "availableGenres":    ["Action", "Adventure", ...],
  "availableDirectors": ["Alfred Hitchcock", ...],
  "availableYears":     [2017, 2016, ...]
}
```

Each options list is narrowed by the **other** active filters (cascading semantics). For example, sending `genres=Drama` returns only directors who have at least one Drama movie.

---

## Build

```bash
npm run build
```

Output goes to `dist/`. A Recharts bundle-size warning (>500 KB chunk) is expected and does not prevent deployment.

## Lint

```bash
npm run lint
```

ESLint is configured with two targets: browser globals for `src/**` and Node.js globals for `api/**`.

---

## Deployment (Vercel)

> **Do not run these commands without reviewing the output first.**

1. Ensure all changes are committed and pushed to GitHub.
2. Connect the repository to a Vercel project:

   ```bash
   vercel link
   ```

3. Add the `DATABASE_URL` environment variable in the Vercel dashboard:
   **Project → Settings → Environment Variables → Add `DATABASE_URL`**

4. Deploy:

   ```bash
   vercel deploy --prod
   ```

Vercel automatically serves `dist/` as the static frontend and `api/*.js` files as serverless functions.

---

## Environment Variables

| Variable       | Required | Description                              |
|----------------|----------|------------------------------------------|
| `DATABASE_URL` | Yes      | PostgreSQL connection string (Supabase)  |

See `.env.example` for the expected format.

---

## Security Notes

- `DATABASE_URL` is only ever read in server-side API functions (`api/*.js`). It is **never** sent to the browser.
- All SQL queries use positional parameters (`$1`, `$2`, …) — no string concatenation of user input.
- `.env` is in `.gitignore`. Only `.env.example` with placeholder values is committed.

---

## Project Structure

```
movie-analytics-dashboard/
├── api/
│   ├── analytics.js      # Global stats endpoint
│   ├── filters.js        # Cascading filter options
│   └── movies.js         # Paginated movie list
├── src/
│   ├── App.jsx           # Main React component + all UI
│   ├── App.css           # All styles
│   └── main.jsx          # React entry point
├── import_movies.py      # One-time data import script
├── .env.example          # Template for required env vars
├── .gitignore
├── eslint.config.js
├── package.json
├── vercel.json           # Vercel routing config
└── vite.config.js
```
