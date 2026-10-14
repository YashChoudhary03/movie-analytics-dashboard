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

function parseList(value) {
  const entries = Array.isArray(value) ? value : [value];
  return entries
    .flatMap((entry) => (typeof entry === "string" ? entry.split(",") : []))
    .map((item) => item.replace(/\+/g, " ").trim())
    .filter(Boolean);
}

function parseDirectors(idsValue, namesValue) {
  const combined = [...parseList(idsValue), ...parseList(namesValue)];
  const ids = [];
  const names = [];
  for (const item of combined) {
    if (/^\d+$/.test(item)) {
      ids.push(Number(item));
    } else {
      names.push(item);
    }
  }
  return { ids, names };
}

function positiveInteger(value, fallback, maximum) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return Math.min(parsed, maximum);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const db = getPool();
    const {
      search = "",
      genres = "",
      directors = "",
      directorIds = "",
      language = "",
      yearFrom = "",
      yearTo = "",
      minRating = "",
      sort = "popularity",
      page: pageValue = "1",
      limit: limitValue = "12",
    } = req.query;

    const page = positiveInteger(pageValue, 1, 1000000);
    const limit = positiveInteger(limitValue, 12, 50);
    const offset = (page - 1) * limit;

    const conditions = [];
    const values = [];

    function addCondition(sql, value) {
      values.push(value);
      conditions.push(sql.replace("?", `$${values.length}`));
    }

    // ── Search: title OR director name (case-insensitive, full name + individual terms) ──
    if (typeof search === "string" && search.trim()) {
      const phrase = search
        .replace(/\+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 100);

      values.push(`%${phrase}%`);
      const phraseParam = `$${values.length}`;

      const words = phrase.split(" ").filter(Boolean);
      const directorTerms = words.map((term) => {
        values.push(`%${term}%`);
        return `d2.director_name ILIKE $${values.length}`;
      });

      conditions.push(`(
        m.title ILIKE ${phraseParam}
        OR EXISTS (
          SELECT 1
          FROM public.movie_directors md2
          JOIN public.directors d2 ON d2.director_id = md2.director_id
          WHERE md2.movie_id = m.movie_id
            AND (
              d2.director_name ILIKE ${phraseParam}
              OR (${directorTerms.join(" AND ")})
            )
        )
      )`);
    }

    // ── Genre filter (OR logic within genres) ──
    const selectedGenres = parseList(genres);
    if (selectedGenres.length) {
      values.push(selectedGenres);
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM public.movie_genres mg
          JOIN public.genres g ON g.genre_id = mg.genre_id
          WHERE mg.movie_id = m.movie_id
            AND g.genre_name = ANY($${values.length}::text[])
        )
      `);
    }

    // ── Director filter (OR logic within directors, supports IDs and names) ──
    const selectedDirectors = parseDirectors(directorIds, directors);
    if (selectedDirectors.ids.length || selectedDirectors.names.length) {
      const directorConds = [];
      if (selectedDirectors.ids.length) {
        values.push(selectedDirectors.ids);
        directorConds.push(`md.director_id = ANY($${values.length}::int[])`);
      }
      if (selectedDirectors.names.length) {
        values.push(selectedDirectors.names);
        directorConds.push(`d.director_name = ANY($${values.length}::text[])`);
      }
      conditions.push(`
        EXISTS (
          SELECT 1
          FROM public.movie_directors md
          JOIN public.directors d ON d.director_id = md.director_id
          WHERE md.movie_id = m.movie_id
            AND (${directorConds.join(" OR ")})
        )
      `);
    }

    // ── Language ──
    if (typeof language === "string" && language.trim()) {
      addCondition("m.original_language = ?", language.trim());
    }

    // ── Year range (inclusive) ──
    if (yearFrom !== "") {
      const year = Number(yearFrom);
      if (!Number.isInteger(year) || year < 1800 || year > 2200) {
        return res.status(400).json({ error: "Invalid starting year" });
      }
      addCondition("m.release_year >= ?", year);
    }

    if (yearTo !== "") {
      const year = Number(yearTo);
      if (!Number.isInteger(year) || year < 1800 || year > 2200) {
        return res.status(400).json({ error: "Invalid ending year" });
      }
      addCondition("m.release_year <= ?", year);
    }

    // ── Minimum rating ──
    if (minRating !== "") {
      const rating = Number(minRating);
      if (!Number.isFinite(rating) || rating < 0 || rating > 10) {
        return res.status(400).json({ error: "Rating must be between 0 and 10" });
      }
      addCondition("m.vote_average >= ?", rating);
    }

    const sortColumns = {
      popularity: "m.popularity DESC NULLS LAST",
      rating: "m.vote_average DESC NULLS LAST",
      newest: "m.release_date DESC NULLS LAST",
      oldest: "m.release_date ASC NULLS LAST",
      title: "m.title ASC",
      revenue: "m.revenue DESC",
    };

    const orderBy = sortColumns[sort] || sortColumns.popularity;
    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const countResult = await db.query(
      `SELECT COUNT(*)::int AS total
       FROM public.movies m
       ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;

    const dataValues = [...values, limit, offset];
    const result = await db.query(
      `SELECT
         m.movie_id,
         m.title,
         m.release_year,
         m.original_language,
         m.runtime,
         m.overview,
         m.popularity,
         m.vote_average,
         m.vote_count,
         m.budget,
         m.revenue,
         COALESCE(
           (SELECT json_agg(g.genre_name ORDER BY g.genre_name)
            FROM public.movie_genres mg
            JOIN public.genres g ON g.genre_id = mg.genre_id
            WHERE mg.movie_id = m.movie_id),
           '[]'::json
         ) AS genres,
         COALESCE(
           (SELECT json_agg(d.director_name ORDER BY d.director_name)
            FROM public.movie_directors md
            JOIN public.directors d ON d.director_id = md.director_id
            WHERE md.movie_id = m.movie_id),
           '[]'::json
         ) AS directors
       FROM public.movies m
       ${whereClause}
       ORDER BY ${orderBy}, m.movie_id ASC
       LIMIT $${dataValues.length - 1}
       OFFSET $${dataValues.length}`,
      dataValues
    );

    return res.status(200).json({
      data: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Movies API error:", error.message);
    return res.status(500).json({ error: "Unable to retrieve movies" });
  }
}
