export {
  ACCEPT_THRESHOLD,
  FINGERPRINT_MARGIN,
  FINGERPRINT_THRESHOLD,
  MAX_FINGERPRINT_CANDIDATES,
  MIN_TEXT_SIMILARITY,
  NTH_PATH_THRESHOLD,
  createElementAnchor,
  pinPosition,
  resolveElementAnchor,
  type ElementResolution,
  type ElementResolutionMethod,
} from "./element";
export {
  FINGERPRINT_TEXT_LIMIT,
  FINGERPRINT_WEIGHTS,
  createFingerprint,
  fingerprintSimilarity,
} from "./fingerprint";
export {
  anchorSchema,
  elementAnchorSchema,
  fingerprintSchema,
  textAnchorSchema,
  type Anchor,
  type ElementAnchor,
  type Fingerprint,
  type TextAnchor,
} from "./schema";
export { buildCssSelector, buildNthPath, isStableId } from "./selector";
export { isStableClassName } from "./stable-class";
export {
  CONTAINER_MIN_CONTEXT_SCORE,
  CONTEXT_LENGTH,
  TIE_CONFIDENCE_FACTOR,
  createTextAnchor,
  resolveTextAnchor,
  type TextResolution,
  type TextResolutionMethod,
} from "./text";
export { buildTextModel, offsetsToRange, rangeToOffsets, type TextModel } from "./text-model";
