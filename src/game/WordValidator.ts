/**
 * Word validation for the browser-only build.
 * Uses the free dictionaryapi.dev endpoint (CORS-friendly), with caching
 * and a fallback that accepts the word if the API is unreachable.
 */
export class WordValidator {
  private validWordCache: Set<string> = new Set();
  private invalidWordCache: Set<string> = new Set();
  private apiTimeout = 3000;

  async isValidWord(word: string): Promise<boolean> {
    const upperWord = word.toUpperCase();

    if (!this.isValidLength(word) || !this.hasValidCharacters(word)) {
      return false;
    }

    if (this.validWordCache.has(upperWord)) {
      return true;
    }
    if (this.invalidWordCache.has(upperWord)) {
      return false;
    }

    try {
      const isValid = await this.checkDictionaryAPI(word.toLowerCase());
      if (isValid) {
        this.validWordCache.add(upperWord);
      } else {
        this.invalidWordCache.add(upperWord);
      }
      return isValid;
    } catch (error) {
      // API failed - fallback to accepting the word
      console.warn(`Dictionary API failed for "${word}", accepting word as fallback:`, error);
      this.validWordCache.add(upperWord);
      return true;
    }
  }

  private async checkDictionaryAPI(word: string): Promise<boolean> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);

    try {
      const response = await fetch(
        `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
      return response.ok;
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Dictionary API timeout');
      }
      throw error;
    }
  }

  isValidLength(word: string): boolean {
    const len = word.length;
    return len >= 4 && len <= 12;
  }

  hasValidCharacters(word: string): boolean {
    return /^[A-Za-z]+$/.test(word);
  }

  clearCache(): void {
    this.validWordCache.clear();
    this.invalidWordCache.clear();
  }
}
