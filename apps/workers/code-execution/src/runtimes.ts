export interface RuntimeDefinition {
  readonly language: string;
  readonly image: string;
  readonly entryFile: string;
  readonly command: (entryFile: string) => readonly string[];
}

export const RUNTIMES = {
  javascript: {
    language: 'javascript',
    image: 'node:22.13.1-alpine',
    entryFile: 'index.js',
    command: (entryFile: string) => ['node', entryFile],
  },
} satisfies Record<string, RuntimeDefinition>;

export function getRuntime(language: string): RuntimeDefinition {
  const runtime = RUNTIMES[language.toLowerCase() as keyof typeof RUNTIMES];

  if (!runtime) {
    throw new Error('Unsupported runtime language');
  }

  return runtime;
}
