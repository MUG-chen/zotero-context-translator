const MARKER_PATTERN = /<<<(TRANSLATION|EXPLANATION|TERMS_JSON|PAPER_PROFILE_JSON)>>>/g;

export function parseModelEnvelope(text) {
  const source = typeof text === "string" ? text : "";
  const matches = [...source.matchAll(MARKER_PATTERN)];
  const result = {
    translation: "",
    explanation: "",
    terms: [],
    paperProfile: null,
    warnings: [],
  };

  if (!matches.length) {
    result.translation = source.trim();
    result.warnings.push("Response did not contain envelope markers");
    return result;
  }

  const sections = new Map();
  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? source.length;
    sections.set(match[1], source.slice(start, end).trim());
  }

  result.translation = sections.get("TRANSLATION") ?? "";
  result.explanation = sections.get("EXPLANATION") ?? "";
  result.terms = parseTerms(sections.get("TERMS_JSON"), result.warnings);
  result.paperProfile = parsePaperProfile(
    sections.get("PAPER_PROFILE_JSON"),
    result.warnings,
  );
  return result;
}

function parseTerms(raw, warnings) {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new TypeError("terms must be an array");
    return value.filter(
      (term) =>
        term &&
        typeof term.source === "string" &&
        typeof term.translation === "string",
    );
  } catch (error) {
    warnings.push(`Could not parse TERMS_JSON: ${error.message}`);
    return [];
  }
}

function parsePaperProfile(raw, warnings) {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError("paper profile must be an object");
    }
    return value;
  } catch (error) {
    warnings.push(`Could not parse PAPER_PROFILE_JSON: ${error.message}`);
    return null;
  }
}
