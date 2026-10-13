
import os
import json
import math
from pathlib import Path

import pandas as pd
import psycopg
from psycopg.rows import dict_row

DATA_DIR = Path.home() / ".cache/kagglehub/datasets/tmdb/tmdb-movie-metadata/versions/2"

MOVIES_FILE = DATA_DIR / "tmdb_5000_movies.csv"
CREDITS_FILE = DATA_DIR / "tmdb_5000_credits.csv"


def clean(value):
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


def parse_json(value):
    value = clean(value)
    if not value:
        return []
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return []


def main():
    if not os.environ.get("DATABASE_URL"):
        raise RuntimeError(
            "DATABASE_URL is missing. Load your .env file first."
        )

    if not MOVIES_FILE.exists() or not CREDITS_FILE.exists():
        raise FileNotFoundError(
            f"Dataset files not found in: {DATA_DIR}"
        )

    movies_df = pd.read_csv(MOVIES_FILE)
    credits_df = pd.read_csv(CREDITS_FILE)

    credits_by_movie = credits_df.set_index("movie_id").to_dict("index")

    with psycopg.connect(
        os.environ["DATABASE_URL"],
        sslmode="require",
        row_factory=dict_row,
    ) as conn:
        with conn.cursor() as cur:
            # Stop if this database already contains movie records.
            cur.execute("SELECT COUNT(*) AS total FROM public.movies")
            if cur.fetchone()["total"] > 0:
                raise RuntimeError(
                    "The movies table is not empty. Import cancelled "
                    "to avoid duplicate or conflicting data."
                )

            # Load movie records.
            movie_rows = []

            for _, row in movies_df.iterrows():
                movie_id = int(row["id"])
                release_date = clean(row["release_date"])

                release_year = None
                if release_date:
                    try:
                        release_year = int(str(release_date)[:4])
                    except ValueError:
                        release_date = None

                runtime = clean(row["runtime"])
                popularity = clean(row["popularity"])
                vote_average = clean(row["vote_average"])

                movie_rows.append((
                    movie_id,
                    clean(row["title"]) or "Untitled",
                    clean(row["original_title"]),
                    release_date,
                    release_year,
                    clean(row["overview"]),
                    clean(row["original_language"]),
                    clean(row["status"]),
                    runtime,
                    int(clean(row["budget"]) or 0),
                    int(clean(row["revenue"]) or 0),
                    popularity,
                    vote_average,
                    int(clean(row["vote_count"]) or 0),
                ))

            cur.executemany(
                """
                INSERT INTO public.movies (
                    movie_id, title, original_title, release_date,
                    release_year, overview, original_language, status,
                    runtime, budget, revenue, popularity,
                    vote_average, vote_count
                )
                VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s
                )
                """,
                movie_rows,
            )
            print(f"Inserted {len(movie_rows)} movies.")

            # Collect genres and their TMDB IDs.
            genre_map = {}

            for _, row in movies_df.iterrows():
                for genre in parse_json(row["genres"]):
                    genre_id = int(genre["id"])
                    genre_map[genre_id] = genre["name"]

            cur.executemany(
                """
                INSERT INTO public.genres (genre_id, genre_name)
                VALUES (%s, %s)
                ON CONFLICT (genre_id) DO NOTHING
                """,
                list(genre_map.items()),
            )
            print(f"Processed {len(genre_map)} genres.")

            # Extract directors from the credits dataset.
            director_names = set()
            movie_director_names = []

            for movie_id in movies_df["id"].astype(int):
                credit = credits_by_movie.get(movie_id, {})
                crew = parse_json(credit.get("crew"))

                names_for_movie = {
                    person["name"]
                    for person in crew
                    if person.get("job") == "Director"
                    and person.get("name")
                }

                for name in names_for_movie:
                    director_names.add(name)
                    movie_director_names.append((movie_id, name))

            cur.executemany(
                """
                INSERT INTO public.directors (director_name)
                VALUES (%s)
                ON CONFLICT (director_name) DO NOTHING
                """,
                [(name,) for name in sorted(director_names)],
            )

            cur.execute(
                "SELECT director_id, director_name FROM public.directors"
            )
            director_ids = {
                row["director_name"]: row["director_id"]
                for row in cur.fetchall()
            }

            cur.executemany(
                """
                INSERT INTO public.movie_genres (movie_id, genre_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                [
                    (int(row["id"]), int(genre["id"]))
                    for _, row in movies_df.iterrows()
                    for genre in parse_json(row["genres"])
                ],
            )

            cur.executemany(
                """
                INSERT INTO public.movie_directors (movie_id, director_id)
                VALUES (%s, %s)
                ON CONFLICT DO NOTHING
                """,
                [
                    (movie_id, director_ids[name])
                    for movie_id, name in movie_director_names
                ],
            )

        # The connection commits automatically if no error occurs.
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS total FROM public.movies")
            movie_count = cur.fetchone()["total"]

            cur.execute("SELECT COUNT(*) AS total FROM public.genres")
            genre_count = cur.fetchone()["total"]

            cur.execute("SELECT COUNT(*) AS total FROM public.directors")
            director_count = cur.fetchone()["total"]

            cur.execute("SELECT COUNT(*) AS total FROM public.movie_genres")
            movie_genre_count = cur.fetchone()["total"]

            cur.execute(
                "SELECT COUNT(*) AS total FROM public.movie_directors"
            )
            movie_director_count = cur.fetchone()["total"]

    print("\nImport completed successfully!")
    print(f"Movies: {movie_count}")
    print(f"Genres: {genre_count}")
    print(f"Directors: {director_count}")
    print(f"Movie-genre relationships: {movie_genre_count}")
    print(f"Movie-director relationships: {movie_director_count}")


if __name__ == "__main__":
    main()
