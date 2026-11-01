// Languages supported by the Coding Round.
//
// The ids are the compiler ids published by OnlineCompiler.io in
// `GET https://api.onlinecompiler.io/api/compilers/` (also enumerated in the
// provider's OpenAPI description). Keep this list in sync with
// `frontend/src/lib/codingRound.ts`; the frontend only displays a language when
// the backend can execute it.

export interface CodingRoundLanguage {
  /** Stable key used by this app and stored with each attempt. */
  id: string
  /** Monospace editor language id (Monaco). */
  monaco: string
  /** OnlineCompiler.io compiler id. */
  compiler: string
  label: string
}

export const CODING_ROUND_LANGUAGES = {
  python: { id: 'python', monaco: 'python', compiler: 'python-3.14', label: 'Python 3.14' },
  javascript: { id: 'javascript', monaco: 'javascript', compiler: 'nodejs-24', label: 'JavaScript (Node.js 24)' },
  typescript: { id: 'typescript', monaco: 'typescript', compiler: 'typescript-deno', label: 'TypeScript (Deno)' },
  c: { id: 'c', monaco: 'c', compiler: 'gcc-15', label: 'C (GCC 15)' },
  cpp: { id: 'cpp', monaco: 'cpp', compiler: 'g++-15', label: 'C++ (G++ 15)' },
  java: { id: 'java', monaco: 'java', compiler: 'openjdk-25', label: 'Java 25' },
  go: { id: 'go', monaco: 'go', compiler: 'go-1.26', label: 'Go 1.26' },
  rust: { id: 'rust', monaco: 'rust', compiler: 'rust-1.93', label: 'Rust 1.93' },
} as const satisfies Record<string, CodingRoundLanguage>

export type CodingRoundLanguageId = keyof typeof CODING_ROUND_LANGUAGES

export const CODING_ROUND_LANGUAGE_IDS = Object.keys(CODING_ROUND_LANGUAGES) as CodingRoundLanguageId[]

export function isCodingRoundLanguage(value: unknown): value is CodingRoundLanguageId {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(CODING_ROUND_LANGUAGES, value)
}

export function compilerForLanguage(language: CodingRoundLanguageId): string {
  return CODING_ROUND_LANGUAGES[language].compiler
}
