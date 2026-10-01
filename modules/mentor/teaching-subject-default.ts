/** An explicit URL filter always takes precedence, including all/empty/invalid values. */
function applyTeachingSubjectDefault(
  params: Record<string, string | string[] | undefined>,
  subjectCode: string | null,
): Record<string, string | string[] | undefined> {
  return params.subject === undefined && subjectCode
    ? { ...params, subject: subjectCode }
    : params;
}

export { applyTeachingSubjectDefault };
