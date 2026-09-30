/**
 * Deterministic Non-AI Text Matching & Similarity Utility
 * Uses token overlap (Jaccard), character N-grams (Dice-Sørensen),
 * Levenshtein edit distance, and technical token boosting.
 */

export interface StockItemMatch {
  name: string;
  category?: string;
  makeModel?: string;
  currentStock: number;
  uom?: string;
  score: number; // 0 to 100 percentage
  isExactMatch: boolean;
}

export interface ExistingStockRef {
  name: string;
  category?: string;
  makeModel?: string;
  totalQty: number;
  uom?: string;
}

/**
 * Normalizes text by removing punctuation, lowercasing, and collapsing whitespace.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s\.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts meaningful tokens from string (words, model codes, numbers).
 */
export function extractTokens(text: string): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  return normalized
    .split(/[\s\-_/]+/)
    .filter(t => t.length > 1 || /\d/.test(t));
}

/**
 * Computes Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Levenshtein similarity ratio between 0.0 and 1.0.
 */
export function levenshteinRatio(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB) return 1.0;
  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(normA, normB);
  return Math.max(0, 1.0 - dist / maxLen);
}

/**
 * Computes character bigram (Dice-Sørensen) similarity between two strings.
 */
export function bigramSimilarity(a: string, b: string): number {
  const normA = normalizeText(a);
  const normB = normalizeText(b);
  if (normA === normB) return 1.0;
  if (normA.length < 2 || normB.length < 2) return 0;

  const getBigrams = (str: string) => {
    const s = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      s.add(str.substring(i, i + 2));
    }
    return s;
  };

  const bgA = getBigrams(normA);
  const bgB = getBigrams(normB);

  let intersection = 0;
  bgA.forEach(bg => {
    if (bgB.has(bg)) intersection++;
  });

  return (2.0 * intersection) / (bgA.size + bgB.size);
}

/**
 * Computes token Jaccard overlap similarity (0.0 to 1.0).
 */
export function tokenJaccardSimilarity(a: string, b: string): number {
  const tokensA = extractTokens(a);
  const tokensB = extractTokens(b);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;

  const setA = new Set(tokensA);
  const setB = new Set(tokensB);

  let intersection = 0;
  setA.forEach(t => {
    if (setB.has(t)) intersection++;
  });

  const union = new Set([...tokensA, ...tokensB]).size;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Checks for crucial technical model identifiers (e.g. "32700", "18650", "4S", "100A", "100Ah", "0.15mm").
 */
function technicalTokenBonus(tokensA: string[], tokensB: string[]): number {
  const isTechToken = (t: string) => /\d/.test(t) || t.length >= 3;
  const techA = tokensA.filter(isTechToken);
  const techB = new Set(tokensB.filter(isTechToken));

  if (techA.length === 0) return 0;

  let matches = 0;
  techA.forEach(t => {
    if (techB.has(t)) matches++;
  });

  return matches > 0 ? Math.min(0.25, (matches / techA.length) * 0.25) : 0;
}

/**
 * Comprehensive Deterministic Similarity Scorer (Returns 0 to 100 percentage).
 */
export function computeMatchScore(sourceText: string, targetText: string): number {
  const normA = normalizeText(sourceText);
  const normB = normalizeText(targetText);

  if (!normA || !normB) return 0;
  if (normA === normB) return 100;

  // Substring containment direct boost
  if (normA.includes(normB) || normB.includes(normA)) {
    const minLen = Math.min(normA.length, normB.length);
    const maxLen = Math.max(normA.length, normB.length);
    const containmentScore = (minLen / maxLen) * 0.5 + 0.5; // at least 50%
    return Math.round(containmentScore * 100);
  }

  const tokensA = extractTokens(sourceText);
  const tokensB = extractTokens(targetText);

  const jaccard = tokenJaccardSimilarity(sourceText, targetText);
  const bigram = bigramSimilarity(sourceText, targetText);
  const lev = levenshteinRatio(sourceText, targetText);
  const techBonus = technicalTokenBonus(tokensA, tokensB);

  // Weighted composite score
  const composite = (jaccard * 0.40) + (bigram * 0.35) + (lev * 0.25) + techBonus;
  return Math.min(100, Math.round(composite * 100));
}

/**
 * Finds and ranks matching items from existing plant stock for a given invoice description.
 */
export function findSimilarStockItems(
  query: string,
  stockMap: Record<string, ExistingStockRef>,
  maxResults = 4,
  minThreshold = 25
): StockItemMatch[] {
  if (!query || !stockMap) return [];
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  const matches: StockItemMatch[] = [];

  Object.entries(stockMap).forEach(([_, item]) => {
    const score = computeMatchScore(cleanQuery, item.name);
    const isExact = normalizeText(cleanQuery) === normalizeText(item.name);

    if (score >= minThreshold || isExact) {
      matches.push({
        name: item.name,
        category: item.category,
        makeModel: item.makeModel,
        currentStock: item.totalQty,
        uom: item.uom || 'qty',
        score: isExact ? 100 : score,
        isExactMatch: isExact
      });
    }
  });

  // Sort descending by score, then by stock count
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.currentStock - a.currentStock;
  });

  return matches.slice(0, maxResults);
}
