/**
 * Custom Schema Builder
 * For creating dynamic extraction schemas from user input
 */

import { z } from "zod";

/**
 * Build a Zod schema from a JSON schema-like definition
 * @param {Object} definition - Schema definition object
 * @returns {import('zod').ZodSchema}
 */
export function buildSchemaFromDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    // Default to extracting any JSON
    return z.record(z.any());
  }

  const shape = {};

  for (const [key, config] of Object.entries(definition)) {
    let field;

    if (typeof config === "string") {
      // Simple type string
      field = getZodType(config);
    } else if (typeof config === "object") {
      const { type, description, optional, items } = config;

      if (type === "array" && items) {
        const itemSchema = typeof items === "object"
          ? buildSchemaFromDefinition(items)
          : getZodType(items);
        field = z.array(itemSchema);
      } else if (type === "object" && config.properties) {
        field = buildSchemaFromDefinition(config.properties);
      } else {
        field = getZodType(type || "string");
      }

      if (description) {
        field = field.describe(description);
      }

      if (optional !== false) {
        field = field.optional();
      }
    } else {
      field = z.string().optional();
    }

    shape[key] = field;
  }

  return z.object(shape);
}

/**
 * Get Zod type from string type name
 * @param {string} typeName
 * @returns {import('zod').ZodTypeAny}
 */
function getZodType(typeName) {
  switch (typeName?.toLowerCase()) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "boolean":
    case "bool":
      return z.boolean();
    case "array":
      return z.array(z.any());
    case "object":
      return z.record(z.any());
    default:
      return z.string();
  }
}

/**
 * Build a schema from an example JSON object
 * Infers types from the example values
 * @param {Object} example - Example JSON object showing desired output structure
 * @returns {import('zod').ZodSchema}
 */
export function buildSchemaFromExample(example) {
  if (!example || typeof example !== "object") {
    return z.record(z.any());
  }

  if (Array.isArray(example)) {
    if (example.length === 0) {
      return z.array(z.any());
    }
    const itemSchema = buildSchemaFromExample(example[0]);
    return z.array(itemSchema);
  }

  const shape = {};

  for (const [key, value] of Object.entries(example)) {
    let field;

    if (value === null || value === undefined) {
      field = z.any().optional();
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        field = z.array(z.any()).optional();
      } else {
        const itemSchema = buildSchemaFromExample(value[0]);
        field = z.array(itemSchema).optional();
      }
    } else if (typeof value === "object") {
      field = buildSchemaFromExample(value).optional();
    } else if (typeof value === "number") {
      field = z.number().optional();
    } else if (typeof value === "boolean") {
      field = z.boolean().optional();
    } else {
      // String or other - treat as string
      // Use the example value as a description hint
      field = z.string().optional().describe(`Example: ${value}`);
    }

    shape[key] = field;
  }

  return z.object(shape);
}

/**
 * Create a custom extraction config from user input
 * @param {Object} options
 * @param {string} options.prompt - Custom extraction prompt
 * @param {Object} options.outputFormat - Example output or schema definition
 * @param {string} options.name - Name for this extraction type
 * @returns {Object} Extraction config with schema and prompt
 */
export function createCustomExtraction(options) {
  const { prompt, outputFormat, name = "custom" } = options;

  let schema;

  if (outputFormat) {
    // Try to determine if it's a schema definition or example
    const firstValue = Object.values(outputFormat)[0];

    if (typeof firstValue === "string" && ["string", "number", "boolean", "array", "object"].includes(firstValue.toLowerCase())) {
      // Looks like a schema definition
      schema = buildSchemaFromDefinition(outputFormat);
    } else {
      // Treat as an example
      schema = buildSchemaFromExample(outputFormat);
    }
  } else {
    // Default: extract any structured data
    schema = z.record(z.any());
  }

  return {
    schema,
    prompt: prompt || "Extract all relevant structured data from this page.",
    name,
    description: "Custom user-defined extraction",
  };
}

export default {
  buildSchemaFromDefinition,
  buildSchemaFromExample,
  createCustomExtraction,
};
