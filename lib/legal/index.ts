import { containsPlaceholder } from "./owner-inputs";
import { PRIVACY_POLICY_VERSIONS } from "./privacy-policy";
import { TERMS_OF_SERVICE_VERSIONS } from "./terms-of-service";
import type { LegalDocument } from "./types";

/**
 * The privacy policy and the terms of service, versioned. A reader and a
 * signup always see the last entry of each list. An account stores the version
 * strings its owner agreed to (registration_consents), so an older version is
 * never edited once anyone has agreed to it: a change is a new entry.
 */

/** Every string a document shows, joined, for checks over its whole text. */
function documentText(document: LegalDocument) {
  return [
    document.title,
    ...document.intro,
    ...document.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
      ...(section.items ?? []),
      ...(section.after ?? []),
    ]),
  ].join("\n");
}

/** Whether the document still has an owner placeholder in its text. */
function hasPlaceholder(document: LegalDocument) {
  return containsPlaceholder(documentText(document));
}

/**
 * The reasons a document cannot be "approved" yet. A document marked approved
 * with any of these is a mistake, and it keeps signup closed (see isLegalApproved).
 */
function approvalProblems(document: LegalDocument) {
  const problems: string[] = [];
  if (hasPlaceholder(document)) problems.push("still has an owner placeholder in its text");
  if (document.version.trim() === "") problems.push("has no version");
  return problems;
}

/** Approved in code and clean: the only state that lets signup open. */
function isLegalApproved(document: LegalDocument) {
  return document.status === "approved" && approvalProblems(document).length === 0;
}

function currentVersion(versions: readonly LegalDocument[]) {
  return versions[versions.length - 1];
}

function getPrivacyPolicy() {
  return currentVersion(PRIVACY_POLICY_VERSIONS);
}

function getTermsOfService() {
  return currentVersion(TERMS_OF_SERVICE_VERSIONS);
}

export {
  PRIVACY_POLICY_VERSIONS,
  TERMS_OF_SERVICE_VERSIONS,
  approvalProblems,
  documentText,
  getPrivacyPolicy,
  getTermsOfService,
  hasPlaceholder,
  isLegalApproved,
};
