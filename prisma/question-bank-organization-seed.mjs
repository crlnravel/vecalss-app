const DEFAULT_FOLDERS = [
  { key: "utbk", name: "UTBK" },
  { key: "latihan", name: "Latihan" },
  { key: "umum", name: "Bank Umum" },
];

const DEFAULT_CATEGORIES = [
  { name: "UTBK", keywords: ["utbk", "snbt", "tka"] },
  { name: "Evaluasi", keywords: ["evaluasi", "ujian", "simulasi"] },
  { name: "Latihan", keywords: ["latihan", "practice", "drill"] },
  { name: "Campuran", keywords: [] },
];

function normalizeClassificationText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("id-ID")
    .trim();
}

function classificationText(bank) {
  return normalizeClassificationText(`${bank.code ?? ""} ${bank.name ?? ""} ${bank.description ?? ""}`);
}

function folderKeyForQuestionBank(bank) {
  const text = classificationText(bank);
  if (/\b(utbk|snbt|tka)\b/.test(text) || text.includes("evaluasi")) return "utbk";
  if (/\b(latihan|practice|drill)\b/.test(text)) return "latihan";
  return "umum";
}

function categoryNamesForQuestionBank(bank) {
  const text = classificationText(bank);
  const matched = DEFAULT_CATEGORIES
    .filter((category) => category.keywords.some((keyword) => text.includes(keyword)))
    .map((category) => category.name);
  return matched.length ? matched : ["Campuran"];
}

async function ensureFolder(client, { name, parentId = null, tutorId }) {
  const existing = await client.query(
    `SELECT id
       FROM question_bank_folders
      WHERE LOWER(name) = LOWER($1)
        AND parent_id IS NOT DISTINCT FROM $2::uuid
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [name, parentId],
  );
  if (existing.rowCount) return { created: false, id: existing.rows[0].id };

  const inserted = await client.query(
    `INSERT INTO question_bank_folders (name, parent_id, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $3, $3)
     RETURNING id`,
    [name, parentId, tutorId],
  );
  return { created: true, id: inserted.rows[0].id };
}

async function ensureCategory(client, { name, tutorId }) {
  const existing = await client.query(
    `SELECT id
       FROM question_bank_categories
      WHERE LOWER(name) = LOWER($1)
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [name],
  );
  if (existing.rowCount) return { created: false, id: existing.rows[0].id };

  const inserted = await client.query(
    `INSERT INTO question_bank_categories (name, created_by_user_id, updated_by_user_id)
     VALUES ($1, $2, $2)
     RETURNING id`,
    [name, tutorId],
  );
  return { created: true, id: inserted.rows[0].id };
}

async function seedQuestionBankOrganization(client, { tutorId }) {
  const folders = new Map();
  let foldersCreated = 0;
  for (const folder of DEFAULT_FOLDERS) {
    const result = await ensureFolder(client, { ...folder, tutorId });
    folders.set(folder.key, result.id);
    if (result.created) foldersCreated += 1;
  }

  const categories = new Map();
  let categoriesCreated = 0;
  for (const category of DEFAULT_CATEGORIES) {
    const result = await ensureCategory(client, { ...category, tutorId });
    categories.set(category.name, result.id);
    if (result.created) categoriesCreated += 1;
  }

  const unfiled = await client.query(
    `SELECT id, code, name, description
       FROM question_banks
      WHERE folder_id IS NULL
      ORDER BY created_at ASC, id ASC
      FOR UPDATE`,
  );
  let banksMoved = 0;
  for (const bank of unfiled.rows) {
    await client.query(
      `UPDATE question_banks
          SET folder_id = $2,
              updated_by_user_id = $3,
              updated_at = NOW()
        WHERE id = $1
          AND folder_id IS NULL`,
      [bank.id, folders.get(folderKeyForQuestionBank(bank)), tutorId],
    );
    banksMoved += 1;
  }

  const banks = await client.query(
    `SELECT id, code, name, description
       FROM question_banks
      ORDER BY created_at ASC, id ASC`,
  );
  let assignmentsCreated = 0;
  for (const bank of banks.rows) {
    for (const categoryName of categoryNamesForQuestionBank(bank)) {
      const assignment = await client.query(
        `INSERT INTO question_bank_category_assignments (
           question_bank_id, category_id, assigned_by_user_id
         ) VALUES ($1, $2, $3)
         ON CONFLICT (question_bank_id, category_id) DO NOTHING`,
        [bank.id, categories.get(categoryName), tutorId],
      );
      assignmentsCreated += assignment.rowCount ?? 0;
    }
  }

  return { assignmentsCreated, banksMoved, categoriesCreated, foldersCreated };
}

export {
  DEFAULT_CATEGORIES,
  DEFAULT_FOLDERS,
  categoryNamesForQuestionBank,
  classificationText,
  folderKeyForQuestionBank,
  normalizeClassificationText,
  seedQuestionBankOrganization,
};
