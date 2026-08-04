export class SelectionTooLongError extends Error {
  constructor(length, limit) {
    super(`Selection contains ${length} characters; limit is ${limit}`);
    this.name = "SelectionTooLongError";
    this.length = length;
    this.limit = limit;
  }
}

export function resolveContext(input = {}, options = {}) {
  const selectionLimit = options.selectionLimit ?? 8000;
  const budgetChars = options.budgetChars ?? 16000;
  const selection = String(input.selection ?? "");
  if (selection.length > selectionLimit) {
    throw new SelectionTooLongError(selection.length, selectionLimit);
  }

  const context = {
    selection,
    currentParagraph: String(input.currentParagraph ?? ""),
    nearParagraphs: [...(input.nearParagraphs ?? [])].map(String),
    distantChunks: [...(input.distantChunks ?? [])].map(String),
    metadata: {
      title: String(input.metadata?.title ?? ""),
      abstract: String(input.metadata?.abstract ?? ""),
    },
    sectionPath: [...(input.sectionPath ?? [])].map(String),
    confirmedTerms: [...(input.confirmedTerms ?? [])],
    paperProfile: input.paperProfile ?? null,
  };

  while (measure(context) > budgetChars && context.distantChunks.length) {
    context.distantChunks.pop();
  }
  if (measure(context) > budgetChars) context.paperProfile = null;
  if (measure(context) > budgetChars) context.metadata.abstract = "";
  while (measure(context) > budgetChars && context.nearParagraphs.length) {
    context.nearParagraphs.pop();
  }
  if (measure(context) > budgetChars) {
    const excess = measure(context) - budgetChars;
    context.currentParagraph = context.currentParagraph.slice(
      0,
      Math.max(0, context.currentParagraph.length - excess),
    );
  }
  if (measure(context) > budgetChars) context.sectionPath = [];
  if (measure(context) > budgetChars) context.metadata.title = "";
  if (measure(context) > budgetChars) context.confirmedTerms = [];

  context.totalChars = measure(context);
  return context;
}

function measure(context) {
  return (
    context.selection.length +
    context.currentParagraph.length +
    context.nearParagraphs.reduce((sum, value) => sum + value.length, 0) +
    context.distantChunks.reduce((sum, value) => sum + value.length, 0) +
    context.metadata.title.length +
    context.metadata.abstract.length +
    context.sectionPath.reduce((sum, value) => sum + value.length, 0) +
    JSON.stringify(context.confirmedTerms).length +
    (context.paperProfile ? JSON.stringify(context.paperProfile).length : 0)
  );
}
