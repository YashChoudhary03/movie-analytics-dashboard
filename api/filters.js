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

/**
 * Builds a parameterized WHERE clause for `public.movies m`.
 *
 * Cascade semantics — each options query calls this with ONE filter
 * intentionally omitted so users can still change that filter:
 *   - Genre options  → omit selectedGenres
 *   - Director opts  → omit selectedDirectors
 *   - Year options   → omit yearFrom / yearTo
 *
 * All user values are passed as SQL parameters — never interpolated.
 *
 * @returns {{ whereClause: string, values: any[] }}
 */
function buildWhere({
  search = "",
  selectedGenres = [],
  selectedDirectors = { ids: [], names: [] },
  language = "",
  yearFrom = "",
  yearTo = "",
  minRating = "",
} = {}) {
  const conditions = [];
  const values = [];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  // ── Search: title OR director name (case-insensitive, full names + individual terms) ──
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
      return `d_s.director_name ILIKE $${values.length}`;
    });

    conditions.push(`(
      m.title ILIKE ${phraseParam}
      OR EXISTS (
        SELECT 1
        FROM public.movie_directors md_s
        JOIN public.directors d_s ON d_s.director_id = md_s.director_id
        WHERE md_s.movie_id = m.movie_id
          AND (
            d_s.director_name ILIKE ${phraseParam}
            OR (${directorTerms.join(" AND ")})
          )
      )
    )`);
  }

  // ── Genre filter (OR logic within genres) ──
  if (selectedGenres.length) {
    values.push(selectedGenres);
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM public.movie_genres mg_g
        JOIN public.genres g_g ON g_g.genre_id = mg_g.genre_id
        WHERE mg_g.movie_id = m.movie_id
          AND g_g.genre_name = ANY($${values.length}::text[])
      )
    `);
  }

  // ── Director filter (OR logic within directors, supports IDs and names) ──
  if (selectedDirectors.ids.length || selectedDirectors.names.length) {
    const directorConds = [];
    if (selectedDirectors.ids.length) {
      values.push(selectedDirectors.ids);
      directorConds.push(`md_d.director_id = ANY($${values.length}::int[])`);
    }
    if (selectedDirectors.names.length) {
      values.push(selectedDirectors.names);
      directorConds.push(`d_d.director_name = ANY($${values.length}::text[])`);
    }
    conditions.push(`
      EXISTS (
        SELECT 1
        FROM public.movie_directors md_d
        JOIN public.directors d_d ON d_d.director_id = md_d.director_id
        WHERE md_d.movie_id = m.movie_id
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
    const yr = Number(yearFrom);
    if (Number.isInteger(yr) && yr >= 1800 && yr <= 2200) {
      addCondition("m.release_year >= ?", yr);
    }
  }
  if (yearTo !== "") {
    const yr = Number(yearTo);
    if (Number.isInteger(yr) && yr >= 1800 && yr <= 2200) {
      addCondition("m.release_year <= ?", yr);
    }
  }

  // ── Minimum rating ──
  if (minRating !== "") {
    const rating = Number(minRating);
    if (Number.isFinite(rating) && rating >= 0 && rating <= 10) {
      addCondition("m.vote_average >= ?", rating);
    }
  }

  return {
    whereClause: conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "",
    values,
  };
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
    } = req.query;

    const selectedGenres = parseList(genres);
    const selectedDirectors = parseDirectors(directorIds, directors);

    // Shared filter context (filters that apply to ALL three option queries)
    const base = { search, language, minRating };

    // ── Genre options ──────────────────────────────────────────────────────
    // Omit selectedGenres so users can change their genre selection freely.
    // All other active filters still apply.
    const forGenres = buildWhere({
      ...base,
      selectedGenres: [],          // intentionally omitted
      selectedDirectors,
      yearFrom,
      yearTo,
    });

    // ── Director options ───────────────────────────────────────────────────
    // Omit selectedDirectors so users can change their director selection.
    // All other active filters still apply.
    const forDirectors = buildWhere({
      ...base,
      selectedGenres,
      selectedDirectors: { ids: [], names: [] }, // intentionally omitted
      yearFrom,
      yearTo,
    });

    // ── Year options ───────────────────────────────────────────────────────
    // Omit yearFrom/yearTo so users can change the range without hiding years.
    // All other active filters still apply.
    const forYears = buildWhere({
      ...base,
      selectedGenres,
      selectedDirectors,
      yearFrom: "",                // intentionally omitted
      yearTo: "",                  // intentionally omitted
    });

    // Add IS NOT NULL guard for years
    const yearsWhere = forYears.whereClause
      ? `${forYears.whereClause} AND m.release_year IS NOT NULL`
      : "WHERE m.release_year IS NOT NULL";

    // Run all three queries concurrently
    const [genreResult, directorResult, yearResult] = await Promise.all([

      // Available genres: distinct genres in movies matching forGenres filters
      db.query(
        `SELECT DISTINCT g.genre_name
         FROM public.genres g
         JOIN public.movie_genres mg ON mg.genre_id = g.genre_id
         JOIN public.movies m        ON m.movie_id  = mg.movie_id
         ${forGenres.whereClause}
         ORDER BY g.genre_name ASC`,
        forGenres.values
      ),

      // Available directors: distinct directors in movies matching forDirectors filters
      db.query(
        `SELECT DISTINCT d.director_id, d.director_name
         FROM public.directors d
         JOIN public.movie_directors md ON md.director_id = d.director_id
         JOIN public.movies m           ON m.movie_id     = md.movie_id
         ${forDirectors.whereClause}
         ORDER BY d.director_name ASC, d.director_id ASC`,
        forDirectors.values
      ),

      // Available years: distinct release years in movies matching forYears filters
      db.query(
        `SELECT DISTINCT m.release_year
         FROM public.movies m
         ${yearsWhere}
         ORDER BY m.release_year DESC`,
        forYears.values
      ),
    ]);

    return res.status(200).json({
      availableGenres:    genreResult.rows.map((r) => r.genre_name),
      availableDirectors: directorResult.rows.map((r) => ({
        id: String(r.director_id),
        name: r.director_name,
      })),
      availableYears:     yearResult.rows.map((r) => r.release_year),
    });
  } catch (error) {
    console.error("Filters API error:", error.message);
    return res.status(500).json({ error: "Unable to retrieve filter options" });
  }
}
