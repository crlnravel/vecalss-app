import { STUDENT_BANNER_KEYS } from "./banner-content";

function validateStudentBannerFields(fields: Record<string, string>) {
  const fieldErrors: Record<string, string> = {};

  for (const key of STUDENT_BANNER_KEYS) {
    const titleField = `${key}.title`;
    const descriptionField = `${key}.description`;
    const title = fields[titleField] ?? "";
    const description = fields[descriptionField] ?? "";

    if (!title) {
      fieldErrors[titleField] = "Heading is required.";
    } else if (title.length > 180) {
      fieldErrors[titleField] = "Heading must be 180 characters or fewer.";
    }

    if (!description) {
      fieldErrors[descriptionField] = "Supporting text is required.";
    } else if (description.length > 1000) {
      fieldErrors[descriptionField] = "Supporting text must be 1,000 characters or fewer.";
    }

    if (key !== "beranda") {
      if (/\{(?:firstName|target)\}/.test(title)) {
        fieldErrors[titleField] = "Only the Beranda banner supports {firstName} and {target}.";
      }

      if (/\{(?:firstName|target)\}/.test(description)) {
        fieldErrors[descriptionField] = "Remove {firstName} or {target} from this banner.";
      }
    }
  }

  return fieldErrors;
}

export { validateStudentBannerFields };
