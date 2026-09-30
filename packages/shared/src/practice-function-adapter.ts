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

export const PRACTICE_ORACLE_BATCH_ADAPTER_PATH = '.codesync/practice-oracle-batch-runner.cjs';

export const PRACTICE_ORACLE_BATCH_ADAPTER_SOURCE = `
const path = require('node:path');

function sanitizeError(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.replaceAll('/workspace/', '');
  }
  return 'Reference solution failed.';
}

function serializeJson(value, message) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(message);
  }
  return serialized;
}

async function readStdin() {
  let rawInput = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    rawInput += chunk;
  }
  return rawInput;
}

async function main() {
  const rawInput = await readStdin();
  let payload;
  try {
    payload = JSON.parse(rawInput || '{"tests":[]}');
  } catch {
    throw new Error('Oracle input payload must be valid JSON.');
  }
  const testInputs = Array.isArray(payload) ? payload.map((input) => ({ input })) : payload.tests;
  if (!Array.isArray(testInputs)) {
    throw new Error('Oracle input payload must contain a tests array.');
  }

  const entryFile = process.env.CODESYNC_ENTRY_FILE || 'index.js';
  const solutionModule = require(path.resolve('/workspace', entryFile));
  if (!solutionModule || typeof solutionModule.solution !== 'function') {
    throw new Error('Expected module.exports.solution to be a function.');
  }

  const tests = [];
  for (const [index, item] of testInputs.entries()) {
    const input = item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'input') ? item.input : item;
    const result = await solutionModule.solution(input);
    tests.push({
      index,
      name: item && typeof item === 'object' && typeof item.name === 'string' ? item.name : null,
      input,
      weight: item && typeof item === 'object' && typeof item.weight === 'number' ? item.weight : null,
      expectedOutput: serializeJson(result, 'solution(input) must return a JSON-serializable value.'),
    });
  }

  process.stdout.write(serializeJson({ tests }, 'Oracle output must be JSON-serializable.'));
}

main().catch((error) => {
  process.stderr.write(sanitizeError(error));
  process.exit(1);
});
`.trimStart();

export const PRACTICE_GENERATOR_ORACLE_ADAPTER_PATH = '.codesync/practice-generator-oracle-runner.cjs';

export const PRACTICE_GENERATOR_ORACLE_ADAPTER_SOURCE = `
const path = require('node:path');

function sanitizeError(error) {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.replaceAll('/workspace/', '');
  }
  return 'Generator failed.';
}

function fail(code, message, extra) {
  const payload = JSON.stringify({ code, message, ...(extra || {}) });
  process.stderr.write('CODESYNC_ERROR_JSON:' + payload);
  process.exit(1);
}

function serializeJson(value, message) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error(message);
  }
  return serialized;
}

async function main() {
  const entryFile = process.env.CODESYNC_ENTRY_FILE || 'index.js';
  const generatorFile = process.env.CODESYNC_GENERATOR_FILE || '.codesync/generator.cjs';
  const maxOutputBytes = Number.parseInt(process.env.CODESYNC_MAX_OUTPUT_BYTES || '100000', 10);
  let solutionModule;
  try {
    solutionModule = require(path.resolve('/workspace', entryFile));
  } catch (error) {
    fail('REFERENCE_SOLUTION_FAILED', 'Reference Solution could not be loaded.');
  }
  if (!solutionModule || typeof solutionModule.solution !== 'function') {
    fail('REFERENCE_SOLUTION_FAILED', 'Expected module.exports.solution to be a function.');
  }

  let generatorModule;
  try {
    generatorModule = require(path.resolve('/workspace', generatorFile));
  } catch (error) {
    fail('GENERATOR_EXECUTION_FAILED', sanitizeError(error));
  }
  if (!generatorModule || typeof generatorModule.generateTests !== 'function') {
    fail('GENERATOR_CONTRACT_INVALID', 'generateTests() must be exported from module.exports.');
  }

  let generated;
  try {
    generated = await generatorModule.generateTests();
  } catch (error) {
    fail('GENERATOR_EXECUTION_FAILED', sanitizeError(error));
  }
  if (!Array.isArray(generated)) {
    fail('GENERATOR_CONTRACT_INVALID', 'generateTests() must return an array.');
  }

  const tests = [];
  for (const [index, input] of generated.entries()) {
    try {
      serializeJson(input, 'Every generated input must be JSON-serializable.');
    } catch (error) {
      fail('GENERATOR_CONTRACT_INVALID', sanitizeError(error), { testIndex: index });
    }
    let result;
    try {
      result = await solutionModule.solution(input);
    } catch (error) {
      fail(
        'REFERENCE_SOLUTION_FAILED',
        'Generator succeeded, but the Reference Solution failed on generated test #' + (index + 1) + '.',
        { testIndex: index }
      );
    }
    let expectedOutput;
    try {
      expectedOutput = serializeJson(result, 'solution(input) must return a JSON-serializable value.');
    } catch (error) {
      fail('REFERENCE_SOLUTION_FAILED', sanitizeError(error), { testIndex: index });
    }
    tests.push({
      index,
      name: null,
      input,
      weight: null,
      expectedOutput,
    });
  }

  const serialized = serializeJson({ tests }, 'Generator output must be JSON-serializable.');
  if (Buffer.byteLength(serialized, 'utf8') > maxOutputBytes) {
    fail('GENERATOR_OUTPUT_LIMIT_EXCEEDED', 'Generated payload exceeds the configured output limit.');
  }
  process.stdout.write(serialized);
}

main().catch((error) => {
  fail('EXECUTION_WORKER_FAILED', sanitizeError(error));
});
`.trimStart();
