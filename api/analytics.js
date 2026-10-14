
import pg from "pg";

const { Pool } = pg;

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured");
    }

    const connectionString = process.env.DATABASE_URL.replace(/^["']|["']$/g, "").trim();
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    });
  }

  return pool;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = getPool();

  const [
  summaryResult,
  genreResult,
  availableGenresResult,
  availableYearsResult,
  availableDirectorsResult,
] =
      await Promise.all([
        db.query(`
          SELECT
            COUNT(*)::int AS "totalMovies",
            COALESCE(ROUND(AVG(vote_average)::numeric, 2), 0)
              AS "averageRating",
            COALESCE(SUM(revenue), 0)::numeric AS "totalRevenue",
            COUNT(DISTINCT release_year)::int AS "releaseYears",
            COUNT(DISTINCT original_language)::int AS "languages"
          FROM public.movies
        `),

        db.query(`
          SELECT
            g.genre_name AS genre,
            COUNT(mg.movie_id)::int AS count
          FROM public.genres g
          JOIN public.movie_genres mg
            ON mg.genre_id = g.genre_id
          GROUP BY g.genre_id, g.genre_name
          ORDER BY count DESC, g.genre_name ASC
        `),

        db.query(`
          SELECT genre_name
          FROM public.genres
          ORDER BY genre_name ASC
        `),
          db.query(`
            SELECT DISTINCT release_year
            FROM public.movies
            WHERE release_year IS NOT NULL
            ORDER BY release_year DESC
        `),
          db.query(`
            SELECT director_name
            FROM public.directors
            ORDER BY director_name ASC
        `),
      ]);

    const summary = summaryResult.rows[0];

        return res.status(200).json({
        summary: {
            ...summary,
            totalRevenue: String(summary.totalRevenue),
        },
        genres: genreResult.rows,
        availableGenres: availableGenresResult.rows.map(
            (row) => row.genre_name
        ),
        availableYears: availableYearsResult.rows.map(
            (row) => row.release_year
        ),
        availableDirectors: availableDirectorsResult.rows.map(
            (row) => row.director_name
        ),
        });
  } catch (error) {
    console.error("Analytics API error:", error.message);
    return res.status(500).json({
      error: "Unable to retrieve analytics",
    });
  }
}
