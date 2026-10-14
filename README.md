# CineMetrics — Movie Analytics Dashboard

A production-ready full-stack movie analytics dashboard built with **React 19**, **Vite**, **Vercel Serverless Functions**, and **Supabase PostgreSQL**. Browse, search, and analyze ~4,800 TMDB movie records with cascading multi-select filters, real-time pagination, interactive Recharts visualizations, and full responsive design across desktop, tablet, and mobile viewports.

---

## 1. Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Frontend Framework** | React 19 (`react` ^19.2.8, `react-dom` ^19.2.8) | Modern functional components, custom hooks, and state management |
| **Build Tool & Bundler** | Vite 8 (`vite` ^8.3.0, `@vitejs/plugin-react` ^6.1.1) | Fast HMR, production minification, and built-in API dev proxy |
| **Data Visualizations** | Recharts (`recharts` ^3.10.1) | Responsive SVG bar charts with tooltips and custom ticks |
| **UI Icons** | Lucide React (`lucide-react` ^1.56.0) | Accessible feather icons |
| **Backend / API** | Node.js Serverless Functions (`api/*.js`) | Hosted on Vercel or run locally via Vite SSR / Vercel CLI |
| **Database** | PostgreSQL on Supabase (`pg` ^8.23.1) | Connection pooler with SSL and parameterized SQL |
| **Code Quality** | ESLint 10 (`eslint` ^10.10.0) | Browser & React Hooks rules for `src/`, Node rules for `api/` |

---

## 2. Data Source

The application is powered by the **TMDB 5000 Movie Dataset** sourced from Kaggle:
- **Source**: [TMDB 5000 Movie Dataset on Kaggle](https://www.kaggle.com/datasets/tmdb/tmdb-movie-metadata)
- **Source Files**: `tmdb_5000_movies.csv` and `tmdb_5000_credits.csv`
- **Volume**: 4,803 movie records spanning release years 1916 through 2017
- **Import Utility**: Included in the repository as [`import_movies.py`](./import_movies.py), which reads the raw CSV files, normalizes JSON attributes (genres, crew/directors), and seeds PostgreSQL with conflict-safe statements.

---

## 3. Database Schema & Relationships

The database utilizes 5 relational tables in PostgreSQL (`public` schema) structured in third normal form (3NF):

```
┌─────────────────────────────────────────────────────────┐
│                     public.movies                       │
├─────────────────┬───────────────────────────────────────┤
│ movie_id (PK)   │ integer                               │
│ title           │ text                                  │
│ original_title  │ text                                  │
│ release_date    │ date                                  │
│ release_year    │ integer (indexed)                     │
│ overview        │ text                                  │
│ original_lang   │ varchar(10)                           │
│ runtime         │ integer                               │
│ popularity      │ numeric                               │
│ vote_average    │ numeric (0.0 - 10.0)                  │
│ vote_count      │ integer                               │
│ budget          │ bigint                                │
│ revenue         │ bigint                                │
└────────┬────────────────────────────────┬───────────────┘
         │ 1                              │ 1
         │                                │
         │ M                              │ M
┌────────┴──────────────┐       ┌─────────┴────────────────┐
│  public.movie_genres  │       │  public.movie_directors  │
├───────────────────────┤       ├──────────────────────────┤
│ movie_id (FK)         │       │ movie_id (FK)            │
│ genre_id (FK)         │       │ director_id (FK)         │
└────────┬──────────────┘       └─────────┬────────────────┘
         │ M                              │ M
         │                                │
         │ 1                              │ 1
┌────────┴──────────────┐       ┌─────────┴────────────────┐
│     public.genres     │       │     public.directors     │
├───────────────────────┤       ├──────────────────────────┤
│ genre_id (PK)         │       │ director_id (PK)         │
│ genre_name            │       │ director_name            │
└───────────────────────┘       └──────────────────────────┘
```

- **Relationships**: Many-to-Many between `movies` and `genres` via `movie_genres`, and Many-to-Many between `movies` and `directors` via `movie_directors`.
- **Integrity**: Junction tables use foreign keys referencing the primary keys, supporting efficient subquery joins and `EXISTS` clauses.

---

## 4. Prerequisites

- **Node.js**: Version `18.x`, `20.x`, or higher
- **npm**: Version `9.x` or higher
- **PostgreSQL Database**: A hosted Supabase PostgreSQL database instance (or self-hosted PostgreSQL instance with the schema created)
- **Python** *(Optional, only needed if executing `import_movies.py`)*: Python 3.10+ with `pandas` and `psycopg[binary]`

---

## 5. Installation & Setup

### 1. Clone the repository and install dependencies
```bash
git clone <repository-url>
cd movie-analytics-dashboard
npm install
```

### 2. Configure environment variables
Copy the template configuration file:
```bash
cp .env.example .env
```

Open `.env` and configure your PostgreSQL database connection string:
```env
# Supabase Transaction Pooler connection string (Port 6543 recommended)
DATABASE_URL="postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres"
```

> **Security Rule**: The `.env` file is explicitly ignored in [`.gitignore`](./.gitignore). Never commit real database credentials or API secrets to version control.

---

## 6. Running Local Development

This project supports two development workflows:

### Option A: Standard Vite Dev Server (Recommended)
```bash
npm run dev
```
- Starts the Vite server at `http://localhost:5173`.
- **Integrated API Middleware**: [`vite.config.js`](./vite.config.js) includes an embedded `apiDevPlugin` that reads `.env` and executes serverless handlers (`/api/movies`, `/api/filters`, `/api/analytics`) inside Vite's local dev server with full HMR. No secondary terminal or external proxy is required!

### Option B: Vercel CLI Emulator
```bash
npx vercel dev
```
- Emulates the full Vercel serverless environment locally on `http://localhost:3000`.

---

## 7. Testing, Linting & Production Build

### Run ESLint
```bash
npm run lint
```
Checks syntax, import cleanliness, and React Hooks rules (`eslint-plugin-react-hooks`) across `src/` and `api/`.

### Run Production Build
```bash
npm run build
```
Builds the optimized production client bundle in `dist/`.

### Preview Production Build
```bash
npm run preview
```
Serves the generated `dist/` directory locally.

---

## 8. API Architecture & Parameterized Endpoints

All endpoints reside in `api/` and run as Vercel serverless functions using Node.js:

### `GET /api/movies`
Returns a paginated list of movies with associated genres, directors, and pagination metadata.
- **Query Parameters**:
  - `search` *(string)*: Case-insensitive search matching movie title or director name.
  - `genres` *(string)*: Comma-separated genre names (OR condition within genres).
  - `directors` / `directorIds` *(string)*: Comma-separated director names or IDs (OR condition within directors).
  - `language` *(string)*: ISO-639-1 language code (e.g. `en`, `fr`, `es`).
  - `yearFrom` / `yearTo` *(number)*: Inclusive release year range.
  - `minRating` *(number)*: Minimum average rating (0 to 10).
  - `sort` *(string)*: Sorting metric (`popularity`, `rating`, `revenue`, `newest`, `oldest`, `title`).
  - `page` *(number, default: 1)*: Page number.
  - `limit` *(number, default: 12, max: 50)*: Page size.
- **Response Format**:
  ```json
  {
    "data": [
      {
        "movie_id": 27205,
        "title": "Inception",
        "release_year": 2010,
        "original_language": "en",
        "vote_average": 8.1,
        "popularity": 167.58,
        "revenue": "825532764",
        "genres": ["Action", "Adventure", "Science Fiction"],
        "directors": ["Christopher Nolan"]
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 12,
      "total": 4803,
      "totalPages": 401
    }
  }
  ```

### `GET /api/filters`
Returns available filter options dynamically computed against the database under active filter constraints.
- **Query Parameters**: Same parameters as `/api/movies`.
- **Response Format**:
  ```json
  {
    "availableGenres": ["Action", "Adventure", "Drama", ...],
    "availableDirectors": [
      { "id": "525", "name": "Christopher Nolan" },
      ...
    ],
    "availableYears": [2017, 2016, 2015, ...]
  }
  ```

### `GET /api/analytics`
Returns aggregate statistics and genre distribution for catalog-wide insights.
- **Response Format**:
  ```json
  {
    "summary": {
      "totalMovies": 4803,
      "averageRating": "6.09",
      "totalRevenue": "39704289874",
      "releaseYears": 90,
      "languages": 87
    },
    "genres": [
      { "genre": "Drama", "count": 2297 },
      { "genre": "Comedy", "count": 1722 },
      ...
    ]
  }
  ```

---

## 9. Core Design & Architectural Decisions

### 1. Genuine Cascading Filter Logic
- **Cross-Filter Cascading (AND Logic)**: Selecting a genre (e.g. `Drama`) and year range (e.g. `2010–2015`) narrows the director list so users only see directors who actually directed a drama within that timeframe.
- **Intra-Filter Multi-Select (OR Logic)**: Selecting multiple genres (e.g., `Action` + `Adventure`) returns movies categorized under either genre.
- **Self-Filter Omission**: In `/api/filters`, when querying available options for a particular facet (e.g., available genres), that facet's own active selection is intentionally omitted from the SQL WHERE clause. This ensures that selecting "Drama" does not collapse the Genre dropdown down to 1 item, allowing the user to seamlessly add more genres or change their choice.

### 2. Search Across Titles and Directors
- The search input evaluates both `m.title ILIKE $1` and an `EXISTS` subquery on `movie_directors` and `directors`.
- Supports both full-phrase queries (e.g., *"Christopher Nolan"*) and multi-word tokenized matches, allowing partial and full director searches.

### 3. Pagination & State Synchronization
- Changing any filter (search, genre, director, language, rating, year range) or sorting order automatically resets pagination to **Page 1**.
- Out-of-bounds page requests are safely clamped.
- Network requests use `AbortController` in React effects, ensuring that slow, pending responses from earlier queries are discarded and never overwrite newer data.

### 4. Responsive UI & Overflow Containment
- **Responsive Breakpoints**:
  - **Large Desktop (> 1400px)**: 6-column grid with search and dropdowns in a single aligned row.
  - **Desktop / Laptop (≤ 1400px)**: 2-tier row layout; the search input occupies row 1 (`grid-column: 1 / -1`), while the 5 dropdowns (`repeat(5, minmax(0, 1fr))`) span row 2, completely preventing horizontal overflow.
  - **Tablet (≤ 1080px)**: 3-tier row layout; search on row 1, multi-select dropdowns on row 2 (50% width each), single-select dropdowns on row 3 (33.3% width each).
  - **Mobile (≤ 600px)**: 2-column stacked grid with full-width search, full-width rating, and wrapped year range controls.
- **No Artificial Clipping**: The library panel does not hide overflow with `overflow: hidden`, ensuring absolute-positioned dropdown menus remain fully visible. Instead, items use `min-width: 0`, `max-width: 100%`, and ellipsis truncation on long label texts.

### 5. Explicit Feedback & State Handling
- **Loading State**: Descriptive loading text and spinner indicators appear during data fetching; controls are disabled during active transitions to prevent duplicate requests.
- **Empty State**: When no movies match the active criteria, a dedicated empty state displays: *"No movies found. Try changing your filters or search terms."* alongside a one-click *"Clear all filters"* action button.
- **Error & Retry State**: Network or server errors display an alert banner with a dedicated *"Retry"* action, ensuring loading spinners never get permanently stuck.

---

## 10. Security & SQL Injection Prevention

1. **Strictly Parameterized SQL**: All queries across `api/movies.js`, `api/filters.js`, and `api/analytics.js` use PostgreSQL positional parameters (`$1`, `$2`, `$3`, etc.) with typed array casts (`ANY($1::text[])`, `ANY($2::int[])`). User inputs are never interpolated directly into SQL strings.
2. **Strict Parameter Validation**: Numerical inputs (years, ratings, pagination limits) are strictly parsed and validated before reaching queries.
3. **Zero Secrets in Frontend**: `DATABASE_URL` is accessed strictly in serverless runtime environments. No database credentials, pool configurations, or secrets are bundled in the Vite client output.
