export const PRACTICE_FUNCTION_ADAPTER_PATH = '.codesync/practice-function-runner.cjs';

export const PRACTICE_FUNCTION_ADAPTER_SOURCE = `
const path = require('node:path');

function sanitizeError(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.replaceAll('/workspace/', '');
  }
  return 'Student solution failed.';
}

async function main() {
  let rawInput = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    rawInput += chunk;
  }

  let input = null;
  if (rawInput.trim()) {
    try {
      input = JSON.parse(rawInput);
    } catch {
      throw new Error('Practice test input must be valid JSON.');
    }
  }

  const entryFile = process.env.CODESYNC_ENTRY_FILE || 'index.js';
  const solutionModule = require(path.resolve('/workspace', entryFile));
  if (!solutionModule || typeof solutionModule.solution !== 'function') {
    throw new Error('Expected module.exports.solution to be a function.');
  }

  const result = await solutionModule.solution(input);
  const serialized = JSON.stringify(result);
  if (serialized === undefined) {
    throw new Error('solution(input) must return a JSON-serializable value.');
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  process.stderr.write(sanitizeError(error));
  process.exit(1);
});
`.trimStart();
