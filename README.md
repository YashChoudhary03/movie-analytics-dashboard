# CineMetrics — Movie Analytics Dashboard

CineMetrics is a full-stack dashboard for exploring the TMDB 5000 Movie Dataset. It provides movie search, cascading filters, pagination, sorting, and analytics charts backed by PostgreSQL.

## Features

- Search by movie title or director.
- Filter by genre, director, release-year range, language, and minimum rating.
- Use cascading filter options that update based on other active filters.
- View movie results, catalog statistics, and a genre-distribution chart.
- Use the responsive interface on desktop, tablet, and mobile.

## Tech Stack

- **Frontend:** React 19, Vite 8
- **Charts and icons:** Recharts, Lucide React
- **API:** Node.js handlers in `api/`, compatible with Vercel
- **Database:** Supabase PostgreSQL, accessed with `pg`

## Dataset and Database

The dashboard uses the [TMDB 5000 Movie Dataset on Kaggle](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata), containing 4,803 movie records. The source files are `tmdb_5000_movies.csv` and `tmdb_5000_credits.csv`. The optional `import_movies.py` script loads the CSV data into PostgreSQL.

The database uses five tables: `movies`, `genres`, `directors`, `movie_genres`, and `movie_directors`. The two junction tables represent the many-to-many relationships between movies and genres, and movies and directors.

## Setup

**Requirements:** Node.js 22.12 or newer, npm, and a PostgreSQL database with the project schema and data loaded. Python 3.10+ with `pandas` and `psycopg[binary]` is only needed to run the import script.

Clone the repository and install dependencies:

```bash
git clone https://github.com/YashChoudhary03/movie-analytics-dashboard.git
cd movie-analytics-dashboard
npm install
cp .env.example .env
```

Add your database connection string to `.env`:

```env
DATABASE_URL="your-postgresql-connection-string"
```

Never commit `.env` or expose database credentials in frontend code.

## Run Locally

Use the Vite development server:

```bash
npm run dev
```

Alternatively, run the Vercel development environment:

```bash
npx vercel dev
```

Open the local URL printed by the command.

## Common Commands

```bash
npm run lint    # Check code quality
npm run build   # Build the production frontend
npm run preview # Preview the production build
```

## API

- `GET /api/movies` — returns filtered, sorted, paginated movie results.
- `GET /api/filters` — returns available genre, director, year, language, and rating options.
- `GET /api/analytics` — returns catalog statistics and genre counts.

## Design Decisions

- **Cascading filters:** Each filter's options are calculated using the other active filters, omitting its own selection so alternatives remain available.
- **Multi-select logic:** Selected values within one category use OR logic; separate filter categories use AND logic.
- **Year and rating:** Year bounds are inclusive; minimum-rating choices are thresholds (5+, 6+, 7+, and 8+) and are offered when matching movies exist.
- **Pagination and requests:** Filter changes reset results to page 1, and `AbortController` prevents outdated requests from replacing newer results.
- **User feedback:** Loading, empty-result, and error/retry states help explain the dashboard's current status.

## Deployment

Deploy through Vercel and configure `DATABASE_URL` in the project's environment settings. Ensure the deployed API can connect to the PostgreSQL database. Do not expose database credentials in client-side code.
