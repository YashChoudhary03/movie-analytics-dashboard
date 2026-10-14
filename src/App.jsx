import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  Languages,
  RefreshCw,
  Search,
  Star,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import "./App.css";

/* ---------- Constants ---------- */

const PAGE_SIZE = 12;
const DEBOUNCE_MS = 350;


const DEFAULT_FILTERS = {
  search: "",
  genres: [],
  directors: [],
  language: "",
  sort: "popularity",
  yearFrom: "",
  yearTo: "",
  minRating: "",
};

const LANGUAGES = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "es", label: "Spanish" },
  { value: "hi", label: "Hindi" },
  { value: "ja", label: "Japanese" },
  { value: "ko", label: "Korean" },
  { value: "zh", label: "Chinese" },
];

const SORT_OPTIONS = [
  { value: "popularity", label: "Most popular" },
  { value: "rating", label: "Highest rated" },
  { value: "revenue", label: "Highest revenue" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A–Z" },
];

const RATING_OPTIONS = [5, 6, 7, 8];

const EMPTY_PAGINATION = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

/* ---------- Helpers ---------- */

const formatNumber = (value, options) =>
  Number(value || 0).toLocaleString("en-US", options);

const money = (value) => {
  const amount = Number(value || 0);
  if (amount >= 1_000_000_000) return `$${(amount / 1_000_000_000).toFixed(2)}B`;
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
};

/** Returns `value` after it has stopped changing for `delay` ms. */
function useDebounced(value, delay = DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

/** Fetches JSON and throws a friendly error on non-2xx responses. */
async function fetchJson(url, { signal, errorMessage }) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(errorMessage);
  return response.json();
}

/**
 * Counts how many filters differ from the defaults.
 * Handles arrays correctly by comparing their serialised forms.
 */
function countActiveFilters(filters) {
  return Object.entries(filters).filter(([key, value]) => {
    const def = DEFAULT_FILTERS[key];
    if (Array.isArray(value)) return value.length !== def.length;
    return value !== def;
  }).length;
}

/* ---------- App ---------- */

function App() {
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [analyticsError, setAnalyticsError] = useState("");

  const [movies, setMovies] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [moviesLoading, setMoviesLoading] = useState(true);
  const [moviesError, setMoviesError] = useState("");

  // Cascading filter options from /api/filters
  const [filterOptions, setFilterOptions] = useState({
  availableGenres: [],
  availableDirectors: [],
  availableYears: [],
});
const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
const [filterOptionsError, setFilterOptionsError] = useState("");

  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  // Dropdown open states
  const [genreMenuOpen, setGenreMenuOpen] = useState(false);
  const [directorMenuOpen, setDirectorMenuOpen] = useState(false);
  const [directorSearch, setDirectorSearch] = useState("");

  // Refs for click-outside detection
  const genreRef = useRef(null);
  const directorRef = useRef(null);

  // Only text/number inputs are debounced; selects apply immediately.
  const debouncedSearch = useDebounced(filters.search.trim());
  const debouncedYearFrom = useDebounced(filters.yearFrom);
  const debouncedYearTo = useDebounced(filters.yearTo);

  const { genres, directors, language, sort, minRating } = filters;

  // Pre-computed join strings so useEffect dependency arrays don't contain
  // inline expressions (satisfies react-hooks/exhaustive-deps)
  const genreKey = genres.join(",");
  const directorKey = directors.join(",");


  /* ----- Close dropdowns on outside click or Escape ----- */

  useEffect(() => {
    function handleClick(e) {
      if (genreRef.current && !genreRef.current.contains(e.target)) {
        setGenreMenuOpen(false);
      }
      if (directorRef.current && !directorRef.current.contains(e.target)) {
        setDirectorMenuOpen(false);
        setDirectorSearch("");
      }
    }

    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setGenreMenuOpen(false);
        setDirectorMenuOpen(false);
        setDirectorSearch("");
      }
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  /* ----- Analytics (global stats + chart — not cascaded) ----- */

  // Inlined as a named async function inside the effect so setState calls
  // are inside an async callback, not synchronously in the effect body.
  // This satisfies react-hooks/set-state-in-effect (react-hooks v7+).
  useEffect(() => {
    const controller = new AbortController();

    async function loadAnalytics() {
      setAnalyticsLoading(true);
      setAnalyticsError("");
      try {
        const result = await fetchJson("/api/analytics", {
          signal: controller.signal,
          errorMessage: "Unable to load analytics.",
        });
        setAnalytics(result);
      } catch (err) {
        if (err.name === "AbortError") return;
        setAnalyticsError(err.message || "Analytics could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setAnalyticsLoading(false);
      }
    }

    loadAnalytics();
    return () => controller.abort();
  }, [reloadKey]);




  /* ----- Cascading filter options from /api/filters ----- */

  useEffect(() => {
  const controller = new AbortController();

  async function loadFilterOptions() {
    setFilterOptionsLoading(true);
    setFilterOptionsError("");
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (genreKey) params.set("genres", genreKey);
      if (directorKey) {
        params.set("directorIds", directorKey);
        params.set("directors", directorKey);
      }
      if (language) params.set("language", language);
      if (debouncedYearFrom) params.set("yearFrom", debouncedYearFrom);
      if (debouncedYearTo) params.set("yearTo", debouncedYearTo);
      if (minRating) params.set("minRating", minRating);

      const result = await fetchJson(`/api/filters?${params}`, {
        signal: controller.signal,
        errorMessage: "Could not load filter options.",
      });

      setFilterOptions({
        availableGenres: result.availableGenres || [],
        availableDirectors: result.availableDirectors || [],
        availableYears: (result.availableYears || []).map(String),
      });
    } catch (err) {
      if (err.name === "AbortError") return;
      setFilterOptionsError(err.message || "Could not load filter options.");
    } finally {
      if (!controller.signal.aborted) setFilterOptionsLoading(false);
    }
  }

  loadFilterOptions();
  return () => controller.abort();
}, [
  debouncedSearch,
  genreKey,
  directorKey,
  language,
  minRating,
  debouncedYearFrom,
  debouncedYearTo,
  reloadKey,
]);

  /* ----- Movies (stale requests are aborted) ----- */

  useEffect(() => {
    const controller = new AbortController();

    async function loadMovies() {
      setMoviesLoading(true);
      setMoviesError("");

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          sort,
        });

        if (debouncedSearch) params.set("search", debouncedSearch);
        if (genreKey) params.set("genres", genreKey);
        if (directorKey) {
          params.set("directorIds", directorKey);
          params.set("directors", directorKey);
        }
        if (language) params.set("language", language);
        if (debouncedYearFrom) params.set("yearFrom", debouncedYearFrom);
        if (debouncedYearTo) params.set("yearTo", debouncedYearTo);
        if (minRating) params.set("minRating", minRating);

        const result = await fetchJson(`/api/movies?${params}`, {
          signal: controller.signal,
          errorMessage: "Unable to load movies. Please try again.",
        });

        setMovies(result.data || []);
        setPagination(result.pagination || EMPTY_PAGINATION);
      } catch (err) {
        if (err.name === "AbortError") return;
        setMoviesError(err.message || "Something went wrong.");
        setMovies([]);
      } finally {
        if (!controller.signal.aborted) setMoviesLoading(false);
      }
    }

    loadMovies();
    return () => controller.abort();
  }, [
    page,
    sort,
    genreKey,
    directorKey,
    debouncedSearch,
    language,
    minRating,
    debouncedYearFrom,
    debouncedYearTo,
    reloadKey,
  ]);


  /* ----- Handlers ----- */

  const updateFilter = (key) => (event) => {
    const value = event.target.value;
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const clearSearch = () => {
    setFilters((current) => ({ ...current, search: "" }));
    setPage(1);
  };

  const resetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setDirectorSearch("");
    setPage(1);
  };

  const refreshAll = () => setReloadKey((key) => key + 1);

  const toggleGenre = (item) => {
    setFilters((current) => ({
      ...current,
      genres: current.genres.includes(item)
        ? current.genres.filter((g) => g !== item)
        : [...current.genres, item],
    }));
    setPage(1);
  };

  const toggleDirector = (directorId) => {
    const idStr = String(directorId);
    setFilters((current) => ({
      ...current,
      directors: current.directors.some((id) => String(id) === idStr)
        ? current.directors.filter((id) => String(id) !== idStr)
        : [...current.directors, idStr],
    }));
    setPage(1);
  };

  const activeFilterCount = useMemo(
    () => countActiveFilters(filters),
    [filters]
  );

  const summary = analytics?.summary;
  const topGenres = useMemo(
    () => (analytics?.genres || []).slice(0, 10),
    [analytics]
  );

  // Filtered director list for the searchable dropdown
  const filteredDirectorOptions = useMemo(() => {
    const q = directorSearch.trim().toLowerCase();
    if (!q) return filterOptions.availableDirectors;
    return filterOptions.availableDirectors.filter((director) =>
      (director?.name || "").toLowerCase().includes(q)
    );
  }, [filterOptions.availableDirectors, directorSearch]);


  const totalPages = Math.max(1, pagination.totalPages || 1);
  const busy = moviesLoading || analyticsLoading;

  const stat = (value) => (analyticsLoading ? "—" : value);

  return (
    <div className="app-shell">
      <Sidebar />

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span aria-hidden="true">/</span>
            <strong>Overview</strong>
          </div>
          <div className="topbar-right">
            <span className="live-indicator">
              <span className="status-dot" aria-hidden="true" />
              Live data
            </span>
            <div className="avatar" aria-hidden="true">
              CM
            </div>
          </div>
        </header>

        <div className="dashboard-content">
          <section className="page-heading">
            <div>
              <p className="eyebrow">YOUR MOVIE DATA, AT A GLANCE</p>
              <h1>Movie analytics</h1>
              <p className="page-description">
                Explore titles, discover trends, and uncover what makes movies
                stand out.
              </p>
            </div>

            <button
              className="refresh-button"
              type="button"
              onClick={refreshAll}
              disabled={busy}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
              Refresh data
            </button>
          </section>

          {analyticsError && (
            <ErrorBanner message={analyticsError} onRetry={refreshAll} />
          )}

          <section className="stats-grid" aria-label="Key statistics">
            <StatCard
              icon={<Film size={21} />}
              label="Total movies"
              value={stat(formatNumber(summary?.totalMovies))}
              note="Titles in the database"
              color="blue"
            />
            <StatCard
              icon={<Star size={21} />}
              label="Average rating"
              value={stat(`${Number(summary?.averageRating || 0).toFixed(2)} / 10`)}
              note="TMDB audience scores"
              color="orange"
            />
            <StatCard
              icon={<Wallet size={21} />}
              label="Total box office"
              value={stat(money(summary?.totalRevenue))}
              note="Reported movie revenue"
              color="green"
            />
            <StatCard
              icon={<CalendarDays size={21} />}
              label="Release years"
              value={stat(summary?.releaseYears ?? "—")}
              note="Distinct release years"
              color="purple"
            />
          </section>

          <section className="analytics-grid">
            <article className="panel genre-panel" id="genre-analysis">
              <div className="panel-heading">
                <div>
                  <h2>Movies by genre</h2>
                  <p>Top 10 genres across the catalog</p>
                </div>
                <span className="panel-icon" aria-hidden="true">
                  <TrendingUp size={20} />
                </span>
              </div>

              {analyticsLoading ? (
                <div className="chart-message" role="status">
                  Loading genre data…
                </div>
              ) : topGenres.length ? (
                <div
                  className="chart-container"
                  role="img"
                  aria-label="Bar chart of movie counts by genre"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={topGenres}
                      layout="vertical"
                      margin={{ top: 4, right: 12, left: 4, bottom: 4 }}
                    >
                      <CartesianGrid
                        stroke="#e9edf5"
                        strokeDasharray="3 3"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fill: "#6b788f", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => formatNumber(v)}
                      />
                      <YAxis
                        type="category"
                        dataKey="genre"
                        width={110}
                        interval={0}
                        tick={{ fill: "#4b5870", fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "#f1f5ff" }}
                        formatter={(v) => [formatNumber(v), "Movies"]}
                        contentStyle={{
                          borderRadius: 10,
                          border: "1px solid #e6ebf4",
                          boxShadow: "0 6px 18px rgb(23 32 51 / 8%)",
                          fontSize: 13,
                        }}
                      />
                      <Bar
                        dataKey="count"
                        name="Movies"
                        fill="#4778ee"
                        radius={[0, 6, 6, 0]}
                        barSize={16}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="chart-message">No genre data available.</div>
              )}
            </article>

            <article className="panel highlights-panel">
              <div className="panel-heading">
                <div>
                  <h2>Catalog highlights</h2>
                  <p>A quick look at your data</p>
                </div>
                <span className="panel-icon" aria-hidden="true">
                  <Activity size={20} />
                </span>
              </div>

              <Highlight
                icon={<Film size={20} />}
                label="Movie records"
                detail="Connected to PostgreSQL"
                value={stat(formatNumber(summary?.totalMovies))}
                color="blue"
              />
              <Highlight
                icon={<Star size={20} />}
                label="Average rating"
                detail="Out of ten points"
                value={stat(Number(summary?.averageRating || 0).toFixed(1))}
                color="orange"
              />
              <Highlight
                icon={<Languages size={20} />}
                label="Languages"
                detail="Original languages represented"
                value={stat(summary?.languages ?? "—")}
                color="purple"
              />

              <div className="metadata-note">
                <span className="status-dot" aria-hidden="true" />
                Real TMDB movie metadata
              </div>
            </article>
          </section>

          <section className="panel library-panel" id="movie-library">
            <div className="library-heading">
              <div>
                <h2>Movie library</h2>
                <p>Search and filter titles from your database.</p>
              </div>
              <span className="result-count" role="status" aria-live="polite">
                {moviesLoading
                  ? "Loading…"
                  : `${formatNumber(pagination.total)} results`}
              </span>
            </div>

            {/* ── Primary filters row ── */}
            <div className="filters">
              {/* Search */}
              <label className="search-field">
                <Search size={18} aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search by title or director…"
                  aria-label="Search by title or director"
                  value={filters.search}
                  onChange={updateFilter("search")}
                />
                {filters.search && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={clearSearch}
                  >
                    <X size={16} />
                  </button>
                )}
              </label>

              {/* Genre multi-select */}
              <div className="multi-select-filter" ref={genreRef}>
                <button
                  type="button"
                  className="filter-trigger"
                  onClick={() => setGenreMenuOpen((o) => !o)}
                  aria-expanded={genreMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Choose genres"
                >
                  <span className="filter-trigger-text">
                    {filters.genres.length
                      ? `${filters.genres.length} genre${filters.genres.length > 1 ? "s" : ""} selected`
                      : "All genres"}
                  </span>
                  <span className="filter-trigger-arrow" aria-hidden="true">▾</span>
                </button>

                {genreMenuOpen && (
                  <div className="multi-select-menu" role="listbox" aria-multiselectable="true" aria-label="Genre options">
                    {filterOptionsLoading && filterOptions.availableGenres.length === 0 ? (
                      <div className="multi-select-empty">Loading…</div>
                    ) : filterOptions.availableGenres.length === 0 ? (
                      <div className="multi-select-empty">No genres available</div>
                    ) : (
                      filterOptions.availableGenres.map((item) => {
                        const checked = filters.genres.includes(item);
                        return (
                          <label
                            key={item}
                            className={`multi-select-option${checked ? " is-checked" : ""}`}
                            role="option"
                            aria-selected={checked}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGenre(item)}
                            />
                            <span>{item}</span>
                          </label>
                        );
                      })
                    )}
                    {filters.genres.length > 0 && (
                      <button
                        type="button"
                        className="multi-select-clear"
                        onClick={() => {
                          setFilters((c) => ({ ...c, genres: [] }));
                          setPage(1);
                        }}
                      >
                        <X size={13} /> Clear genres
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Director multi-select (searchable) */}
              <div className="multi-select-filter" ref={directorRef}>
                <button
                  type="button"
                  className="filter-trigger"
                  onClick={() => setDirectorMenuOpen((o) => !o)}
                  aria-expanded={directorMenuOpen}
                  aria-haspopup="listbox"
                  aria-label="Choose directors"
                >
                  <span className="filter-trigger-text">
                    {filters.directors.length
                      ? `${filters.directors.length} director${filters.directors.length > 1 ? "s" : ""} selected`
                      : "All directors"}
                  </span>
                  <span className="filter-trigger-arrow" aria-hidden="true">▾</span>
                </button>

                {directorMenuOpen && (
                  <div className="multi-select-menu multi-select-menu--tall" role="listbox" aria-multiselectable="true" aria-label="Director options">
                    {/* Search box inside dropdown */}
                    <div className="multi-select-search">
                      <Search size={14} aria-hidden="true" />
                      <input
                        type="search"
                        placeholder="Search directors…"
                        aria-label="Search directors"
                        value={directorSearch}
                        onChange={(e) => setDirectorSearch(e.target.value)}
                        autoFocus
                      />
                      {directorSearch && (
                        <button
                          type="button"
                          aria-label="Clear director search"
                          onClick={() => setDirectorSearch("")}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>

                    <div className="multi-select-list">
                      {filterOptionsLoading && filterOptions.availableDirectors.length === 0 ? (
                        <div className="multi-select-empty">Loading…</div>
                      ) : filteredDirectorOptions.length === 0 ? (
                        <div className="multi-select-empty">
                          {directorSearch ? "No directors match your search" : "No directors available"}
                        </div>
                      ) : (
                        filteredDirectorOptions.map((director) => {
                          const checked = filters.directors.some(
                            (id) => String(id) === String(director.id)
                          );
                          return (
                            <label
                              key={director.id}
                              className={`multi-select-option${checked ? " is-checked" : ""}`}
                              role="option"
                              aria-selected={checked}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDirector(director.id)}
                              />
                              <span>{director.name}</span>
                            </label>
                          );
                        })
                      )}
                    </div>

                    {filters.directors.length > 0 && (
                      <button
                        type="button"
                        className="multi-select-clear"
                        onClick={() => {
                          setFilters((c) => ({ ...c, directors: [] }));
                          setPage(1);
                        }}
                      >
                        <X size={13} /> Clear directors
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Language */}
              <select
                aria-label="Filter by language"
                value={filters.language}
                onChange={updateFilter("language")}
              >
                <option value="">All languages</option>
                {LANGUAGES.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {/* Sort */}
              <select
                aria-label="Sort movies"
                value={filters.sort}
                onChange={updateFilter("sort")}
              >
                {SORT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>

              {/* Rating */}
              <select
                aria-label="Minimum rating"
                value={filters.minRating}
                onChange={updateFilter("minRating")}
              >
                <option value="">Any rating</option>
                {RATING_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}+ rating
                  </option>
                ))}
              </select>
            </div>

            {/* ── Advanced filters (year range + clear) ── */}
            <div className="advanced-filters">

              <label>
                <span>Release year from</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1916}
                  max={2017}
                  placeholder="e.g. 2000"
                  aria-label="Release year from"
                  value={filters.yearFrom}
                  onChange={updateFilter("yearFrom")}
                />
              </label>

              <label>
                <span>Release year to</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1916}
                  max={2017}
                  placeholder="e.g. 2015"
                  aria-label="Release year to"
                  value={filters.yearTo}
                  onChange={updateFilter("yearTo")}
                />
              </label>


              <button
                type="button"
                className="clear-filters"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                <X size={15} />
                Clear filters
                {activeFilterCount > 0 && ` (${activeFilterCount})`}
              </button>
            </div>

{filterOptionsError && (
  <ErrorBanner message={filterOptionsError} onRetry={refreshAll} />
)}


            {moviesError && (
              <ErrorBanner message={moviesError} onRetry={refreshAll} />
            )}

            <div className="table-wrap">
              <table className="movie-table">
                <thead>
                  <tr>
                    <th scope="col">Movie</th>
                    <th scope="col">Release year</th>
                    <th scope="col">Genre</th>
                    <th scope="col">Rating</th>
                    <th scope="col">Popularity</th>
                    <th scope="col">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {moviesLoading ? (
                    <MessageRow>
                      <RefreshCw size={18} className="spin" />
                      Loading movies…
                    </MessageRow>
                  ) : moviesError ? (
                    <MessageRow>Movies could not be loaded.</MessageRow>
                  ) : movies.length === 0 ? (
                    <MessageRow>
                      No movies match your filters. Try changing your search.
                    </MessageRow>
                  ) : (
                    movies.map((movie) => (
                      <MovieRow key={movie.movie_id} movie={movie} />
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Page {pagination.page} of {totalPages}
                <span className="pagination-total">
                  {" "}
                  · {formatNumber(pagination.total)} movies
                </span>
              </span>

              <div className="pagination-actions">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={moviesLoading || page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={moviesLoading || page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>CineMetrics · Movie Intelligence</span>
            <span>Powered by PostgreSQL and Supabase</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

/* ---------- Components ---------- */

function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Clapperboard size={25} />
        </div>
        <div>
          <h2>CineMetrics</h2>
          <span>MOVIE INTELLIGENCE</span>
        </div>
      </div>

      <div className="sidebar-label">WORKSPACE</div>

      <nav className="sidebar-nav" aria-label="Primary">
        <a className="nav-link active" href="#overview" aria-current="page">
          <Activity size={19} />
          <span>Overview</span>
        </a>
        <a className="nav-link" href="#movie-library">
          <Film size={19} />
          <span>Movie library</span>
        </a>
        <a className="nav-link" href="#genre-analysis">
          <TrendingUp size={19} />
          <span>Genre analysis</span>
        </a>
      </nav>

      <div className="sidebar-footer">
        <div className="data-source">
          <span className="status-dot" aria-hidden="true" />
          <div>
            <strong>Data source</strong>
            <p>PostgreSQL · Supabase</p>
          </div>
        </div>
        <p className="sidebar-caption">Movie Analytics Dashboard</p>
      </div>
    </aside>
  );
}

function ErrorBanner({ message, onRetry }) {
  return (
    <div className="error-banner" role="alert">
      {message}
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

function MessageRow({ children }) {
  return (
    <tr>
      <td colSpan={6} className="table-message">
        {children}
      </td>
    </tr>
  );
}

function MovieRow({ movie }) {
  const genres = movie.genres || [];

  return (
    <tr>
      <td>
        <div className="movie-title">
          <span className="movie-poster-icon" aria-hidden="true">
            <Film size={18} />
          </span>
          <div>
            <strong>{movie.title}</strong>
            <span>{movie.original_language?.toUpperCase() || "—"}</span>
          </div>
        </div>
      </td>
      <td>{movie.release_year || "—"}</td>
      <td>
        <div className="genre-tags">
          {genres.slice(0, 2).map((item) => (
            <span key={item}>{item}</span>
          ))}
          {genres.length === 0 && "—"}
        </div>
      </td>
      <td>
        <span className="rating-badge">
          <Star size={13} aria-hidden="true" />
          {Number(movie.vote_average || 0).toFixed(1)}
        </span>
      </td>
      <td>{formatNumber(movie.popularity, { maximumFractionDigits: 1 })}</td>
      <td>
        {Number(movie.revenue) > 0 ? money(movie.revenue) : "N/A"}
      </td>
    </tr>
  );
}

function StatCard({ icon, label, value, note, color }) {
  return (
    <article className="stat-card">
      <div className="stat-card-top">
        <span>{label}</span>
        <span className={`stat-icon ${color}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="stat-value">{value}</div>
      <p>{note}</p>
    </article>
  );
}

function Highlight({ icon, label, detail, value, color }) {
  return (
    <div className="highlight-row">
      <span className={`highlight-icon ${color}`} aria-hidden="true">
        {icon}
      </span>
      <div className="highlight-copy">
        <strong>{label}</strong>
        <span>{detail}</span>
      </div>
      <strong className="highlight-value">{value}</strong>
    </div>
  );
}

export default App;
