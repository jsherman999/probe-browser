# Probe — Browser Edition 🤖🔤

A **100% browser-only** version of [Probe](https://github.com/jsherman999/Probe), the classic
Parker Brothers (1964) word-guessing board game — rebuilt with **LLM-powered AI bots**.

No backend. No database. No signup. Everything (game state, API keys, history) lives in your browser's
`localStorage`, and your LLM API keys are sent **only** to the provider you choose.

## 🎮 Play

👉 **Live: https://jsherman999.github.io/probe-browser/**

1. **Add an API key** on the Home screen: paste a key and the provider is **detected automatically**
   (OpenAI, Google Gemini, Anthropic, Groq, OpenRouter, DeepSeek, Mistral, Cerebras, or any
   OpenAI-compatible endpoint). Then pick a **model** from the dropdown — or keep **⭐ Default (free)**,
   which uses the provider's default free model (e.g. Groq's `llama-3.3-70b-versatile`, Gemini's
   `gemini-2.5-flash`, OpenRouter's `meta-llama/llama-3.3-70b-instruct:free`) — and hit **Test** to
   verify the connection. Or skip keys entirely and let bots use the built-in heuristic brain.
2. **Set up a game**: enter your name, add up to 3 bots, and give each a **brain**:
   - **LLM** — plays with the provider & model you configured above, or
   - **Built-in heuristic** (no key needed).
3. **Play Probe**: pick a secret word (4–12 letters, optionally padded with blanks), then take turns
   guessing letters in your opponents' words. Correct guesses reveal letters and score points
   (5/10/15 by position); a fully revealed word eliminates that player. Last player standing wins.
4. Bots think with their assigned model: they choose secret words, pick targets and letters, decide
   which duplicate/blank position to reveal, and occasionally attempt full-word guesses (🎯 Guess Word!).
   If an LLM call fails (bad key, rate limit, no network), the bot **falls back to the heuristic brain**
   and shows a warning — the game never stalls.

## ✨ Features

- **Single LLM setup window** — paste a key, the provider is auto-detected, and the model is picked from a dropdown (or ⭐ Default free model)
- **API key manager** with show/hide, a "Test connection" button, and a link to get keys
- **Auto-resume** — refresh the page and keep playing; active games are persisted locally
- **Turn timer** for humans (auto-skip on timeout), "thinking…" indicators for bots
- **Guess Now!** full-word guessing with the same +100/+50/−50 scoring as the original
- **Game history** — completed games archived in the browser with full turn-by-turn logs and revealed words
- **Heuristic fallback bots** — play without any API key
- Faithful port of the original game engine (scoring, blanks/padding, duplicate selection, elimination)

## 🗺️ How the browser-only build works

| Original repo | This build |
|---|---|
| Node.js/Express backend + Socket.io + PostgreSQL | Everything in the browser (React + TypeScript) |
| `GameManager` (Prisma/fs/crypto) | `src/game/GameEngine.ts` — pure in-memory port, serializable for resume |
| Server calls to a dictionary API | `WordValidator` calls the free `dictionaryapi.dev` directly (CORS-friendly) |
| — | `src/services/providers.ts` — provider registry with default free models |
| — | `src/services/llm.ts` — browser→provider chat completions (OpenAI-compatible + Anthropic formats) |
| — | `src/services/botBrain.ts` — LLM prompts + heuristic strategy |
| — | `src/services/LocalGameController.ts` — turn pump, timers, bot auto-play, persistence |

All LLM calls go straight from the browser to the provider (all listed providers are CORS-enabled), so no
proxy server is needed. Keys are stored only in `localStorage` on your machine.

## 🚀 Develop

```bash
npm install
npm run dev       # vite dev server on :5200
npm test          # vitest: engine + full-game simulation tests
npm run build     # tsc + vite build → dist/
```

## 🧪 Tests

- `ScoringEngine` — position scoring (5/10/15 pattern, blanks score 0)
- `GameEngine` — 18 tests covering word selection, guessing, blanks, duplicates, word guesses, elimination,
  serialization, turn timeouts
- `FullGame` — a complete simulated 4-player game (1 scripted human + 3 heuristic bots) driven to
  completion through the real controller

## 🔗 Credits

- Original multiplayer game: [jsherman999/Probe](https://github.com/jsherman999/Probe) (MIT)
- Game design: Parker Brothers, 1964

## 📄 License

MIT — see [LICENSE](LICENSE).
