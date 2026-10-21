const GENERATED_PREFIX = /^(?:(?:css|svelte)-[a-z0-9]*\d|jsx-\d)/;
const PLAIN_TOKEN = /^[A-Za-z0-9_-]+$/;
const ALPHANUMERIC = /^[A-Za-z0-9]+$/;
const SEGMENT_SEPARATOR = /[-_]+/;
const NUMBER_THEN_UNIT = /^\d+[A-Za-z]+$/;
const WORD_THEN_NUMBER = /^[A-Za-z]+\d+$/;
const CAMEL_OR_PASCAL_CASE = /^(?:[a-z]+(?:[A-Z][a-z]+)+|(?:[A-Z][a-z]+)+)$/;
const CASE_WORD = /[A-Z]?[a-z]+/g;
const VOWEL = /[aeiouy]/i;
const MIN_HASH_LENGTH = 5;
const MAX_CASE_HASH_LENGTH = 8;

function isCamelCaseWords(segment: string): boolean {
  return (
    CAMEL_OR_PASCAL_CASE.test(segment) &&
    [...segment.matchAll(CASE_WORD)].every((match) => VOWEL.test(match[0]))
  );
}

function isHashedSegment(segment: string): boolean {
  if (segment.length < MIN_HASH_LENGTH || !ALPHANUMERIC.test(segment)) {
    return false;
  }
  const hasDigit = /\d/.test(segment);
  const hasLetter = /[A-Za-z]/.test(segment);
  if (hasDigit && hasLetter) {
    return !NUMBER_THEN_UNIT.test(segment) && !WORD_THEN_NUMBER.test(segment);
  }
  if (hasDigit || segment.length > MAX_CASE_HASH_LENGTH) {
    return false;
  }
  return /[a-z]/.test(segment) && /[A-Z]/.test(segment) && !isCamelCaseWords(segment);
}

export function hasHashedSegment(token: string): boolean {
  return token.split(SEGMENT_SEPARATOR).some(isHashedSegment);
}

export function isStableClassName(name: string): boolean {
  if (name === "" || GENERATED_PREFIX.test(name)) {
    return false;
  }
  if (!PLAIN_TOKEN.test(name)) {
    return true;
  }
  return !hasHashedSegment(name);
}
