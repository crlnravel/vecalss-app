/** One numbered article ("Pasal") of a legal page. */
type LegalSection = {
  heading: string;
  /** Text before the list, one paragraph per entry. */
  paragraphs: readonly string[];
  /** A bulleted list under the paragraphs. */
  items?: readonly string[];
  /** Text after the list. */
  after?: readonly string[];
};

type LegalStatus = "approved" | "draft";

type LegalDocument = {
  /** The day this text was written, shown to readers. */
  draftedOn: string;
  /** Opening paragraphs before the first article. */
  intro: readonly string[];
  sections: readonly LegalSection[];
  /** "draft" until the owner approves the text; signup stays closed while it is. */
  status: LegalStatus;
  title: string;
  /** Stored with every consent. Never shown to readers. Change it with the text once anyone has agreed to it. */
  version: string;
};

export type { LegalDocument, LegalSection, LegalStatus };
