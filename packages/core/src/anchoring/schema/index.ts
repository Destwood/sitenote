import * as z from "zod/mini";

const unitInterval = z.number().check(z.gte(0), z.lte(1));
const nonNegativeNumber = z.number().check(z.gte(0));
const nonNegativeInteger = z.int().check(z.gte(0));
const nonEmptyString = z.string().check(z.minLength(1));

export const fingerprintSchema = z.object({
  tag: nonEmptyString,
  text: z.string(),
  classes: z.array(z.string()),
  width: nonNegativeNumber,
  height: nonNegativeNumber,
});

export const elementAnchorSchema = z.object({
  kind: z.literal("element"),
  selectors: z.object({
    id: z.optional(nonEmptyString),
    testId: z.optional(nonEmptyString),
    css: nonEmptyString,
    nthPath: nonEmptyString,
  }),
  fingerprint: fingerprintSchema,
  offset: z.object({ x: unitInterval, y: unitInterval }),
});

export const textAnchorSchema = z.object({
  kind: z.literal("text"),
  quote: z.object({
    exact: nonEmptyString,
    prefix: z.string(),
    suffix: z.string(),
  }),
  position: z
    .object({ start: nonNegativeInteger, end: nonNegativeInteger })
    .check(z.refine((position) => position.end > position.start)),
  container: nonEmptyString,
});

export const anchorSchema = z.discriminatedUnion("kind", [elementAnchorSchema, textAnchorSchema]);

export type Fingerprint = z.infer<typeof fingerprintSchema>;
export type ElementAnchor = z.infer<typeof elementAnchorSchema>;
export type TextAnchor = z.infer<typeof textAnchorSchema>;
export type Anchor = z.infer<typeof anchorSchema>;
