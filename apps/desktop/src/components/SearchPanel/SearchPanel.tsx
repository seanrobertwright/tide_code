import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSearchStore } from "../../stores/searchStore";
import { useWorkspaceStore } from "../../stores/workspace";
import styles from "./SearchPanel.module.css";

function MatchText({ text, column, length }: { text: string; column: number; length: number }) {
  const col = column - 1; // 1-indexed to 0-indexed
  const before = text.slice(0, col);
  const match = text.slice(col, col + length);
  const after = text.slice(col + length);
  return (
    <span className={styles.matchText}>
      {before}
      <span className={styles.matchHighlight}>{match}</span>
      {after}
    </span>
  );
}

export function SearchPanel() {
  const {
    query, replaceText, isRegex, caseSensitive, wholeWord,
    includeGlob, excludeGlob,
    results, isSearching, totalMatches, expanded,
    setQuery, setReplaceText, toggleRegex, toggleCase, toggleWholeWord,
    setIncludeGlob, setExcludeGlob, toggleExpanded,
    search, replaceInFile, replaceAll,
  } = useSearchStore();

  const [showReplace, setShowReplace] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const rootPath = useWorkspaceStore((s) => s.rootPath);

  // Debounced search
  const triggerSearch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      search();
    }, 300);
  }, [search]);

  // Re-search when toggles change
  useEffect(() => {
    if (query.trim()) triggerSearch();
  }, [isRegex, caseSensitive, wholeWord, includeGlob, excludeGlob]);

  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setQuery(e.target.value);
      triggerSearch();
    },
    [setQuery, triggerSearch],
  );

  const handleQueryKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        search();
      }
    },
    [search],
  );

  const openFileAtLine = useCallback(
    async (filePath: string, line: number) => {
      try {
        const result = await invoke<{
          content: string;
          totalLines: number;
          language: string;
        }>("fs_read_file", { path: filePath });
        const name = filePath.split("/").pop() || filePath;
        useWorkspaceStore.getState().openFile({
          path: filePath,
          name,
          content: result.content,
          isDirty: false,
          language: result.language,
        });
        // TODO: scroll to line in Monaco editor
      } catch (err) {
        console.error("open file error:", err);
      }
    },
    [],
  );

  const shortPath = useCallback(
    (file: string) => {
      if (rootPath && file.startsWith(rootPath)) {
        return file.slice(rootPath.length + 1);
      }
      return file;
    },
    [rootPath],
  );

  return (
    <div className={styles.panel}>
      <div className={styles.controls}>
        {/* Search row */}
        <div className={styles.inputRow}>
          <button
            className={styles.toggleBtn}
            onClick={() => setShowReplace(!showReplace)}
            title="Toggle Replace"
            style={{ fontSize: 14 }}
          >
            {showReplace ? "▾" : "▸"}
          </button>
          <input
            id="search-input"
            ref={searchInputRef}
            className={styles.searchInput}
            placeholder="Search"
            value={query}
            onChange={handleQueryChange}
            onKeyDown={handleQueryKeyDown}
          />
          <button
            className={`${styles.toggleBtn} ${isRegex ? styles.toggleBtnActive : ""}`}
            onClick={toggleRegex}
            title="Use Regular Expression"
          >
            .*
          </button>
          <button
            className={`${styles.toggleBtn} ${caseSensitive ? styles.toggleBtnActive : ""}`}
            onClick={toggleCase}
            title="Match Case"
          >
            Aa
          </button>
          <button
            className={`${styles.toggleBtn} ${wholeWord ? styles.toggleBtnActive : ""}`}
            onClick={toggleWholeWord}
            title="Match Whole Word"
            style={{ fontSize: 10, letterSpacing: -0.5 }}
          >
            ab
          </button>
        </div>

        {/* Replace row */}
        {showReplace && (
          <div className={styles.inputRow}>
            <span style={{ width: 22, flexShrink: 0 }} />
            <input
              className={styles.searchInput}
              placeholder="Replace"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
            />
            <button
              className={styles.actionBtn}
              onClick={replaceAll}
              disabled={!query.trim() || totalMatches === 0}
              title="Replace All"
            >
              All
            </button>
          </div>
        )}

        {/* Filter toggle */}
        <div className={styles.inputRow}>
          <button
            className={styles.toggleBtn}
            onClick={() => setShowFilters(!showFilters)}
            title="Toggle File Filters"
            style={{ fontSize: 10 }}
          >
            {showFilters ? "▾" : "▸"} filters
          </button>
        </div>

        {/* Filter inputs */}
        {showFilters && (
          <div className={styles.filterRow}>
            <input
              className={styles.filterInput}
              placeholder="Include (e.g. *.ts, src/**)"
              value={includeGlob}
              onChange={(e) => setIncludeGlob(e.target.value)}
            />
            <input
              className={styles.filterInput}
              placeholder="Exclude (e.g. node_modules)"
              value={excludeGlob}
              onChange={(e) => setExcludeGlob(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Results */}
      <div className={styles.results}>
        {isSearching && (
          <div className={styles.summary}>Searching...</div>
        )}
        {!isSearching && query.trim() && (
          <div className={styles.summary}>
            {totalMatches} result{totalMatches !== 1 ? "s" : ""} in {results.length} file{results.length !== 1 ? "s" : ""}
          </div>
        )}
        {results.map((fileResult) => {
          const isExpanded = expanded.has(fileResult.file);
          return (
            <div key={fileResult.file}>
              <div
                className={styles.fileNode}
                onClick={() => toggleExpanded(fileResult.file)}
              >
                <svg
                  className={`${styles.chevron} ${isExpanded ? styles.chevronOpen : ""}`}
                  viewBox="0 0 12 12"
                >
                  <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
                <span className={styles.fileName}>{shortPath(fileResult.file)}</span>
                <span className={styles.matchCount}>{fileResult.matches.length}</span>
                {showReplace && (
                  <button
                    className={styles.replaceFileBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      replaceInFile(fileResult.file);
                    }}
                    title="Replace in this file"
                  >
                    ⟳
                  </button>
                )}
              </div>
              {isExpanded &&
                fileResult.matches.map((m, i) => (
                  <div
                    key={`${m.line}-${m.column}-${i}`}
                    className={styles.matchLine}
                    onClick={() => openFileAtLine(fileResult.file, m.line)}
                  >
                    <span className={styles.lineNum}>{m.line}</span>
                    <MatchText text={m.text} column={m.column} length={m.length} />
                  </div>
                ))}
            </div>
          );
        })}
        {!isSearching && !query.trim() && results.length === 0 && (
          <div className={styles.emptyState}>
            Type to search across files
          </div>
        )}
        {!isSearching && query.trim() && results.length === 0 && (
          <div className={styles.emptyState}>
            No results found
          </div>
        )}
      </div>
    </div>
  );
}
