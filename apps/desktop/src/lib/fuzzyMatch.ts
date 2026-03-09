/**
 * Simple fuzzy match: checks if each character of `query` appears in order in `text`.
 * Scores higher for consecutive matches and word-boundary matches.
 */
export function fuzzyMatch(
  query: string,
  text: string,
): { match: boolean; score: number } {
  if (!query) return { match: true, score: 0 };

  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  let score = 0;
  let prevMatchIdx = -2;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      // Consecutive match bonus
      if (ti === prevMatchIdx + 1) score += 3;
      // Word-boundary bonus (start of string, after space/punctuation)
      if (ti === 0 || /[\s_\-./]/.test(t[ti - 1])) score += 2;
      // Basic match point
      score += 1;
      prevMatchIdx = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}
