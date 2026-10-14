# CineMetrics — Movie Analytics Dashboard

CineMetrics is a full-stack movie analytics dashboard for exploring the TMDB 5000 Movie Dataset. It supports movie search, cascading multi-select filters, pagination, sorting, and analytics charts, backed by PostgreSQL.

## 1. Features

- Search movies by title or director name.
- Filter by genre, director, release-year range, language, and minimum rating.
- Use cascading Genre, Year, Director, Language, and Minimum Rating options based on the other active filters.
- Combine multi-select filters and browse paginated results.
- View catalog statistics and a genre-distribution chart.
- Use a responsive layout on desktop, tablet, and mobile.
- See loading, empty-result, and error/retry messages.

## 2. Technology Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, Vite 8 |
| Charts | Recharts |
| Icons | Lucide React |
| API | Node.js handlers in `api/`, compatible with Vercel |
| Database | PostgreSQL hosted on Supabase, accessed through `pg` |
| Code quality | ESLint |

## 3. Dataset

The project uses the [TMDB 5000 Movie Dataset on Kaggle](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata).

The source files are `tmdb_5000_movies.csv` and `tmdb_5000_credits.csv`. The repository includes `import_movies.py` to parse the CSV data and load movie, genre, and director records into PostgreSQL. The imported dataset contains 4,803 movie records.

## 4. Database Structure

The database uses five tables in the `public` schema:

| Table | Purpose |
| --- | --- |
| `movies` | Movie details, including title, release date and year, original language, runtime, popularity, rating, budget, and revenue. |
| `genres` | Unique genre names. |
| `directors` | Unique director names. |
| `movie_genres` | Junction table connecting movies and genres. |
| `movie_directors` | Junction table connecting movies and directors. |

Movies can have multiple genres and directors, so `movie_genres` and `movie_directors` represent many-to-many relationships. Foreign keys connect the junction tables to their related records.

## 5. Prerequisites

- Node.js 22.12 or newer (a supported LTS release is recommended).
- npm.
- A PostgreSQL database, such as Supabase, with the project schema and dataset loaded.
- Python 3.10+ with `pandas` and `psycopg[binary]` only if you need to run `import_movies.py`.

## 6. Installation and Environment Setup

1. Clone the repository and enter the project directory:

   ```bash
   git clone <repository-url>
   cd movie-analytics-dashboard
   npm install
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env
   ```

3. Set `DATABASE_URL` in `.env` to your PostgreSQL/Supabase connection string:

   ```env
   DATABASE_URL="<your-postgresql-connection-string>"
   ```

**Security:** Never commit `.env` or expose database credentials in frontend code. Keep `.env.example` limited to placeholders.

## 7. Running Locally

This project supports two local workflows.

### Option A: Vite development server

```bash
npm run dev
```

Open the local URL printed by Vite, usually [http://localhost:5173](http://localhost:5173). The project's Vite configuration includes development middleware for the API routes in `api/`.

### Option B: Vercel development environment

```bash
npx vercel dev
```

Open the local URL printed by Vercel, usually [http://localhost:3000](http://localhost:3000). Configure the project and environment variables if prompted.

## 8. Common Commands

```bash
npm run lint    # Check code quality
npm run build   # Build the production frontend into dist/
npm run preview # Preview the built frontend
```

## 9. API Overview

The API handlers are in `api/`:

- `GET /api/movies` — returns a paginated movie list, genre/director details, and pagination metadata. Supported parameters include `search`, `genres`, `directorIds` (and director names where supported), `language`, `yearFrom`, `yearTo`, `minRating`, `sort`, `page`, and `limit`.
- `GET /api/filters` — returns available genre, director, year, language, and minimum-rating threshold options (`availableGenres`, `availableDirectors`, `availableYears`, `availableLanguages`, `availableRatings`) based on the active filter context.
- `GET /api/analytics` — returns catalog-wide summary statistics and genre counts for the dashboard charts.

The API uses parameterized SQL for user-provided values. Sorting is selected from a predefined set of supported sort options.

## 10. Design Decisions

- **Cascading filters:** Each filter's available options are calculated dynamically using the other active filters while omitting that filter's own selection. This applies to Genre, Director, Year, Language, and Minimum Rating, keeping alternative options selectable when users change a filter.
- **Dynamic Language & Rating thresholds:** Language options reflect actual movie records in the database, while Minimum Rating options (5+, 6+, 7+, 8+) dynamically exclude thresholds that have no matching records under current constraints.
- **Multi-select logic:** Values selected within one filter use OR logic; separate filter groups combine with AND logic.
- **Inclusive year range:** The selected start and end years are both included.
- **Pagination:** Changing filters, search, or sorting returns the results to page 1. The API returns pagination metadata for the current query.
- **Request handling:** Frontend requests use cancellation via `AbortController` to prevent outdated responses from overwriting newer results.
- **User feedback:** Loading indicators, empty-result messaging, and error/retry states communicate the status of data requests.
- **Responsive layout:** Filter controls and the movie table adapt to smaller screens without forcing the page horizontally wider.

## 11. Deployment

Deploy the application using Vercel and configure `DATABASE_URL` in the project's environment settings. Ensure the PostgreSQL database is reachable from the deployed API functions. Never put database credentials in client-side environment variables.
