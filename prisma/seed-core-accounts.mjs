import bcrypt from "bcryptjs";

export function normalizeSeedReferralCode(value) {
  const normalized = value?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(normalized)) {
    throw new Error("SEED_AFFILIATOR_CODE must be 3-40 characters using A-Z, 0-9, or hyphens.");
  }

  return normalized;
}

export const DEFAULT_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL?.trim() || "admin@vecalss.local",
  fullName: "Vecalss Admin",
  password: process.env.SEED_ADMIN_PASSWORD?.trim() || "Admin12345!",
};

export const DEFAULT_DEVELOPER = {
  email: process.env.SEED_DEVELOPER_EMAIL?.trim() || "developer@vecalss.local",
  fullName: "Vecalss Developer",
  password: process.env.SEED_DEVELOPER_PASSWORD?.trim() || "Developer12345!",
};

export const DEFAULT_STUDENT = {
  email: process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local",
  fullName: "Alya Ramadhani",
  password: process.env.SEED_STUDENT_PASSWORD?.trim() || "Student12345!",
};

export const DEFAULT_TEMP_STUDENT = {
  email: process.env.SEED_TEMP_STUDENT_EMAIL?.trim() || "newstudent@vecalss.local",
  fullName: "Raka Pratama",
  password: process.env.SEED_TEMP_STUDENT_PASSWORD?.trim() || "TempStudent123!",
};

export const DEFAULT_TUTOR = {
  email: process.env.SEED_TUTOR_EMAIL?.trim() || "tutor@vecalss.local",
  fullName: "Nadia Prameswari",
  password: process.env.SEED_TUTOR_PASSWORD?.trim() || "Tutor12345!",
};

export const DEFAULT_AFFILIATOR = {
  email: process.env.SEED_AFFILIATOR_EMAIL?.trim() || "affiliator@vecalss.local",
  fullName: "Salsa Rahma",
  password: process.env.SEED_AFFILIATOR_PASSWORD?.trim() || "Affiliator12345!",
  referralCode: normalizeSeedReferralCode(process.env.SEED_AFFILIATOR_CODE || "SALSA2027"),
};

// This is a managed system subject, not a loginable student. Keep the UUID
// stable so an approved repair can restore the original identity in place.
export const ADMIN_STUDENT_PREVIEW_FIXTURE = {
  email: "admin-student-preview@vecalss.local",
  fullName: "Alya Preview",
  id: "00000000-0000-4000-8000-000000000001",
  previewPurpose: "admin.student-preview",
};

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function upsertExamProgram(client, { code, description, name }) {
  const result = await client.query(
    `
      INSERT INTO exam_programs (code, description, name, is_active)
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (code)
      DO UPDATE
        SET description = EXCLUDED.description,
            is_active = TRUE,
            name = EXCLUDED.name,
            updated_at = NOW()
      RETURNING id
    `,
    [code, description, name],
  );

  return result.rows[0].id;
}

export async function upsertExamEvent(client, { examDate, examProgramId, name, registrationUrl }) {
  const existing = await client.query(
    `
      SELECT id
      FROM exam_events
      WHERE exam_program_id = $1
        AND name = $2
      LIMIT 1
    `,
    [examProgramId, name],
  );

  if (existing.rowCount) {
    await client.query(
      `
        UPDATE exam_events
        SET exam_date = $2,
            is_active = TRUE,
            name = $3,
            registration_url = $4,
            updated_at = NOW()
        WHERE id = $1
      `,
      [existing.rows[0].id, examDate, name, registrationUrl],
    );

    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO exam_events (exam_program_id, name, exam_date, registration_url, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id
    `,
    [examProgramId, name, examDate, registrationUrl],
  );

  return created.rows[0].id;
}

export async function upsertUniversity(client, { city, name, officialUrl, province, shortName, type }) {
  const existing = await client.query(
    `
      SELECT id
      FROM universities
      WHERE name = $1
      LIMIT 1
    `,
    [name],
  );

  if (existing.rowCount) {
    await client.query(
      `
        UPDATE universities
        SET city = $2,
            official_url = $3,
            province = $4,
            short_name = $5,
            type = $6,
            updated_at = NOW()
        WHERE id = $1
      `,
      [existing.rows[0].id, city, officialUrl, province, shortName, type],
    );

    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO universities (name, short_name, type, city, province, official_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `,
    [name, shortName, type, city, province, officialUrl],
  );

  return created.rows[0].id;
}

export async function upsertMajor(client, { degreeLevel, faculty, name, universityId }) {
  const result = await client.query(
    `
      INSERT INTO majors (university_id, name, faculty, degree_level, is_active)
      VALUES ($1, $2, $3, $4, TRUE)
      ON CONFLICT (university_id, name)
      DO UPDATE
        SET degree_level = EXCLUDED.degree_level,
            faculty = EXCLUDED.faculty,
            is_active = TRUE,
            updated_at = NOW()
      RETURNING id
    `,
    [universityId, name, faculty, degreeLevel],
  );

  return result.rows[0].id;
}

export async function upsertUser(client, { email, fullName, mustChangePassword, passwordHash, passwordUpdatedAt }) {
  const result = await client.query(
    `
      INSERT INTO users (
        email,
        full_name,
        password_hash,
        password_updated_at,
        must_change_password,
        status
      )
      VALUES ($1, $2, $3, $4, $5, 'active')
      ON CONFLICT (email)
      DO UPDATE
        SET full_name = EXCLUDED.full_name,
            failed_login_count = 0,
            locked_until = NULL,
            must_change_password = EXCLUDED.must_change_password,
            password_hash = EXCLUDED.password_hash,
            password_updated_at = EXCLUDED.password_updated_at,
            soft_deleted_at = NULL,
            status = 'active',
            updated_at = NOW()
      RETURNING id
    `,
    [email.toLowerCase(), fullName, passwordHash, passwordUpdatedAt, mustChangePassword],
  );

  return result.rows[0].id;
}

export async function ensureRoleAssignment(client, { assignedByUserId = null, role, userId }) {
  const existing = await client.query(
    `
      SELECT id
      FROM role_assignments
      WHERE user_id = $1
        AND role = $2
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [userId, role],
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO role_assignments (user_id, role, assigned_by_user_id)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [userId, role, assignedByUserId],
  );

  return created.rows[0].id;
}

export async function ensureNotificationPreference(client, userId) {
  await client.query(
    `
      INSERT INTO notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO NOTHING
    `,
    [userId],
  );
}

export async function upsertStudentProfile(
  client,
  {
    displayName,
    enrolledByUserId,
    onboardingStatus,
    targetExamEventId,
    targetMajorId,
    targetUniversityId,
    userId,
  },
) {
  await client.query(
    `
      INSERT INTO student_profiles (
        user_id,
        display_name,
        onboarding_status,
        target_exam_event_id,
        target_university_id,
        target_major_id,
        timezone,
        enrolled_by_user_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'Asia/Jakarta', $7)
      ON CONFLICT (user_id)
      DO UPDATE
        SET display_name = EXCLUDED.display_name,
            enrolled_by_user_id = EXCLUDED.enrolled_by_user_id,
            onboarding_status = EXCLUDED.onboarding_status,
            target_exam_event_id = EXCLUDED.target_exam_event_id,
            target_major_id = EXCLUDED.target_major_id,
            target_university_id = EXCLUDED.target_university_id,
            timezone = 'Asia/Jakarta',
            updated_at = NOW()
    `,
    [
      userId,
      displayName,
      onboardingStatus,
      targetExamEventId,
      targetUniversityId,
      targetMajorId,
      enrolledByUserId,
    ],
  );
}

export async function upsertTutorProfile(client, { bio, headline, userId }) {
  await client.query(
    `
      INSERT INTO tutor_profiles (
        user_id,
        headline,
        bio,
        is_active
      )
      VALUES ($1, $2, $3, TRUE)
      ON CONFLICT (user_id)
      DO UPDATE
        SET bio = EXCLUDED.bio,
            headline = EXCLUDED.headline,
            is_active = TRUE,
            updated_at = NOW()
    `,
    [userId, headline, bio],
  );
}

export async function upsertAffiliatorProfile(client, { referralCode, userId }) {
  const normalizedReferralCode = normalizeSeedReferralCode(referralCode);
  const result = await client.query(
    `
      INSERT INTO affiliator_profiles (user_id, referral_code, is_active)
      VALUES ($1, $2, TRUE)
      ON CONFLICT (user_id)
      DO UPDATE
        SET is_active = TRUE,
            referral_code = EXCLUDED.referral_code,
            updated_at = NOW()
      RETURNING id
    `,
    [userId, normalizedReferralCode],
  );

  return result.rows[0].id;
}

export async function ensureAdminStudentPreviewFixture(client, { adminUserId }) {
  const byPurpose = await client.query(
    `
      SELECT id
      FROM users
      WHERE preview_purpose = $1
    `,
    [ADMIN_STUDENT_PREVIEW_FIXTURE.previewPurpose],
  );

  if (byPurpose.rowCount > 1) {
    throw new Error("The admin student preview fixture is ambiguous; repair the original rows before seeding.");
  }

  if (byPurpose.rowCount && byPurpose.rows[0].id !== ADMIN_STUDENT_PREVIEW_FIXTURE.id) {
    throw new Error("The admin student preview purpose belongs to a different user identity; restore the original UUID before seeding.");
  }

  const byId = await client.query(
    `
      SELECT id, preview_purpose
      FROM users
      WHERE id = $1::uuid
      FOR UPDATE
    `,
    [ADMIN_STUDENT_PREVIEW_FIXTURE.id],
  );

  if (byId.rowCount && byId.rows[0].preview_purpose !== ADMIN_STUDENT_PREVIEW_FIXTURE.previewPurpose) {
    throw new Error("The reserved admin student preview fixture UUID is claimed by another account.");
  }

  // Only this explicit, stable-UUID seed/repair path may update managed
  // fixture lifecycle fields. It never creates a replacement UUID.
  await client.query("SELECT set_config('app.admin_student_preview_repair', 'on', true)");
  const passwordHash = await hashPassword(`managed-preview-disabled:${ADMIN_STUDENT_PREVIEW_FIXTURE.id}`);

  if (byId.rowCount) {
    await client.query(
      `
        UPDATE users
        SET email = $2,
            full_name = $3,
            password_hash = $4,
            password_updated_at = NULL,
            must_change_password = TRUE,
            preview_purpose = $5,
            soft_deleted_at = NULL,
            status = 'active',
            failed_login_count = 0,
            locked_until = NULL,
            updated_at = NOW()
        WHERE id = $1::uuid
      `,
      [
        ADMIN_STUDENT_PREVIEW_FIXTURE.id,
        ADMIN_STUDENT_PREVIEW_FIXTURE.email,
        ADMIN_STUDENT_PREVIEW_FIXTURE.fullName,
        passwordHash,
        ADMIN_STUDENT_PREVIEW_FIXTURE.previewPurpose,
      ],
    );
  } else {
    await client.query(
      `
        INSERT INTO users (
          id,
          email,
          full_name,
          password_hash,
          password_updated_at,
          must_change_password,
          preview_purpose,
          status
        )
        VALUES ($1::uuid, $2, $3, $4, NULL, TRUE, $5, 'active')
      `,
      [
        ADMIN_STUDENT_PREVIEW_FIXTURE.id,
        ADMIN_STUDENT_PREVIEW_FIXTURE.email,
        ADMIN_STUDENT_PREVIEW_FIXTURE.fullName,
        passwordHash,
        ADMIN_STUDENT_PREVIEW_FIXTURE.previewPurpose,
      ],
    );
  }

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "student",
    userId: ADMIN_STUDENT_PREVIEW_FIXTURE.id,
  });
  await client.query(
    `
      UPDATE role_assignments
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE user_id = $1::uuid
        AND role <> 'student'::role_name
        AND revoked_at IS NULL
    `,
    [ADMIN_STUDENT_PREVIEW_FIXTURE.id],
  );
  await upsertStudentProfile(client, {
    displayName: ADMIN_STUDENT_PREVIEW_FIXTURE.fullName,
    enrolledByUserId: null,
    onboardingStatus: "completed",
    targetExamEventId: null,
    targetMajorId: null,
    targetUniversityId: null,
    userId: ADMIN_STUDENT_PREVIEW_FIXTURE.id,
  });

  return ADMIN_STUDENT_PREVIEW_FIXTURE.id;
}

export async function seedCoreAccounts(client) {
  const examProgramId = await upsertExamProgram(client, {
    code: "UTBK-SNBT",
    description: "Program persiapan UTBK SNBT untuk pembelajaran, latihan, dan evaluasi kemajuan siswa.",
    name: "UTBK SNBT",
  });

  const upcomingExamEventId = await upsertExamEvent(client, {
    examDate: new Date("2027-04-22"),
    examProgramId,
    name: "UTBK SNBT 2027 - Gelombang Utama",
    registrationUrl: "https://snpmb.bppp.kemdikbud.go.id/",
  });

  const makeupExamEventId = await upsertExamEvent(client, {
    examDate: new Date("2027-05-06"),
    examProgramId,
    name: "UTBK SNBT 2027 - Gelombang Susulan",
    registrationUrl: "https://snpmb.bppp.kemdikbud.go.id/",
  });

  const uiId = await upsertUniversity(client, {
    city: "Depok",
    name: "Universitas Indonesia",
    officialUrl: "https://www.ui.ac.id/",
    province: "Jawa Barat",
    shortName: "UI",
    type: "ptn",
  });

  const itbId = await upsertUniversity(client, {
    city: "Bandung",
    name: "Institut Teknologi Bandung",
    officialUrl: "https://www.itb.ac.id/",
    province: "Jawa Barat",
    shortName: "ITB",
    type: "ptn",
  });

  const uiInformaticsId = await upsertMajor(client, {
    degreeLevel: "S1",
    faculty: "Faculty of Computer Science",
    name: "Informatics",
    universityId: uiId,
  });

  const itbInformaticsId = await upsertMajor(client, {
    degreeLevel: "S1",
    faculty: "School of Electrical Engineering and Informatics",
    name: "Informatics Engineering",
    universityId: itbId,
  });

  const adminUserId = await upsertUser(client, {
    email: DEFAULT_ADMIN.email,
    fullName: DEFAULT_ADMIN.fullName,
    mustChangePassword: false,
    passwordHash: await hashPassword(DEFAULT_ADMIN.password),
    passwordUpdatedAt: new Date(),
  });

  await ensureRoleAssignment(client, {
    role: "admin",
    userId: adminUserId,
  });
  await ensureNotificationPreference(client, adminUserId);

  const developerUserId = await upsertUser(client, {
    email: DEFAULT_DEVELOPER.email,
    fullName: DEFAULT_DEVELOPER.fullName,
    mustChangePassword: false,
    passwordHash: await hashPassword(DEFAULT_DEVELOPER.password),
    passwordUpdatedAt: new Date(),
  });

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "developer",
    userId: developerUserId,
  });
  await ensureNotificationPreference(client, developerUserId);

  const previewUserId = await ensureAdminStudentPreviewFixture(client, { adminUserId });

  const studentUserId = await upsertUser(client, {
    email: DEFAULT_STUDENT.email,
    fullName: DEFAULT_STUDENT.fullName,
    mustChangePassword: false,
    passwordHash: await hashPassword(DEFAULT_STUDENT.password),
    passwordUpdatedAt: new Date(),
  });

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "student",
    userId: studentUserId,
  });
  await ensureNotificationPreference(client, studentUserId);
  await upsertStudentProfile(client, {
    displayName: DEFAULT_STUDENT.fullName,
    enrolledByUserId: adminUserId,
    onboardingStatus: "completed",
    targetExamEventId: upcomingExamEventId,
    targetMajorId: uiInformaticsId,
    targetUniversityId: uiId,
    userId: studentUserId,
  });

  const tempStudentUserId = await upsertUser(client, {
    email: DEFAULT_TEMP_STUDENT.email,
    fullName: DEFAULT_TEMP_STUDENT.fullName,
    mustChangePassword: true,
    passwordHash: await hashPassword(DEFAULT_TEMP_STUDENT.password),
    passwordUpdatedAt: null,
  });

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "student",
    userId: tempStudentUserId,
  });
  await ensureNotificationPreference(client, tempStudentUserId);
  await upsertStudentProfile(client, {
    displayName: DEFAULT_TEMP_STUDENT.fullName,
    enrolledByUserId: adminUserId,
    onboardingStatus: "not_started",
    targetExamEventId: upcomingExamEventId,
    targetMajorId: null,
    targetUniversityId: null,
    userId: tempStudentUserId,
  });

  const tutorUserId = await upsertUser(client, {
    email: DEFAULT_TUTOR.email,
    fullName: DEFAULT_TUTOR.fullName,
    mustChangePassword: false,
    passwordHash: await hashPassword(DEFAULT_TUTOR.password),
    passwordUpdatedAt: new Date(),
  });

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "tutor",
    userId: tutorUserId,
  });
  await ensureNotificationPreference(client, tutorUserId);
  await upsertTutorProfile(client, {
    bio: "Pendamping kelas persiapan SNBT dengan fokus pada penalaran, literasi, dan evaluasi kemajuan belajar.",
    headline: "Tutor SNBT · Pendamping kelas intensif",
    userId: tutorUserId,
  });

  const affiliatorUserId = await upsertUser(client, {
    email: DEFAULT_AFFILIATOR.email,
    fullName: DEFAULT_AFFILIATOR.fullName,
    mustChangePassword: false,
    passwordHash: await hashPassword(DEFAULT_AFFILIATOR.password),
    passwordUpdatedAt: new Date(),
  });

  await ensureRoleAssignment(client, {
    assignedByUserId: adminUserId,
    role: "affiliator",
    userId: affiliatorUserId,
  });
  await ensureNotificationPreference(client, affiliatorUserId);
  const affiliatorProfileId = await upsertAffiliatorProfile(client, {
    referralCode: DEFAULT_AFFILIATOR.referralCode,
    userId: affiliatorUserId,
  });

  const seededAccounts = [
    {
      fullName: DEFAULT_ADMIN.fullName,
      email: DEFAULT_ADMIN.email,
      role: "admin",
      password: DEFAULT_ADMIN.password,
      mustChangePassword: false,
      loginPath: "/login",
    },
    {
      fullName: DEFAULT_DEVELOPER.fullName,
      email: DEFAULT_DEVELOPER.email,
      role: "developer",
      password: DEFAULT_DEVELOPER.password,
      mustChangePassword: false,
      loginPath: "/login",
    },
    {
      fullName: DEFAULT_TUTOR.fullName,
      email: DEFAULT_TUTOR.email,
      role: "tutor",
      password: DEFAULT_TUTOR.password,
      mustChangePassword: false,
      loginPath: "/login",
    },
    {
      fullName: DEFAULT_STUDENT.fullName,
      email: DEFAULT_STUDENT.email,
      role: "student",
      password: DEFAULT_STUDENT.password,
      mustChangePassword: false,
      loginPath: "/login",
    },
    {
      fullName: DEFAULT_TEMP_STUDENT.fullName,
      email: DEFAULT_TEMP_STUDENT.email,
      role: "student (first login)",
      password: DEFAULT_TEMP_STUDENT.password,
      mustChangePassword: true,
      loginPath: "/login",
    },
    {
      fullName: DEFAULT_AFFILIATOR.fullName,
      email: DEFAULT_AFFILIATOR.email,
      role: "affiliator",
      password: DEFAULT_AFFILIATOR.password,
      mustChangePassword: false,
      loginPath: "/login",
    },
    {
      fullName: ADMIN_STUDENT_PREVIEW_FIXTURE.fullName,
      email: ADMIN_STUDENT_PREVIEW_FIXTURE.email,
      role: "managed preview",
      password: "(managed preview fixture - login disabled)",
      mustChangePassword: true,
      loginPath: "N/A",
    },
  ];

  return {
    adminUserId,
    developerUserId,
    previewUserId,
    studentUserId,
    tempStudentUserId,
    tutorUserId,
    affiliatorUserId,
    affiliatorProfileId,
    examProgramId,
    upcomingExamEventId,
    makeupExamEventId,
    uiId,
    itbId,
    uiInformaticsId,
    itbInformaticsId,
    seededAccounts,
  };
}
