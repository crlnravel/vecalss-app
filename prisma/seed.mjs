import "dotenv/config";

import bcrypt from "bcryptjs";
import pg from "pg";
import { seedMateriCatalogue } from "./materi-seed.mjs";
import { seedAssessmentDemo } from "./seed-assessment.mjs";

const { Client } = pg;

const DEFAULT_ADMIN = {
  email: process.env.SEED_ADMIN_EMAIL?.trim() || "admin@vecalss.local",
  fullName: "Vecalss Admin",
  password: process.env.SEED_ADMIN_PASSWORD?.trim() || "Admin12345!",
};

const DEFAULT_STUDENT = {
  email: process.env.SEED_STUDENT_EMAIL?.trim() || "student@vecalss.local",
  fullName: "Alya Ramadhani",
  password: process.env.SEED_STUDENT_PASSWORD?.trim() || "Student12345!",
};

const DEFAULT_TEMP_STUDENT = {
  email: process.env.SEED_TEMP_STUDENT_EMAIL?.trim() || "newstudent@vecalss.local",
  fullName: "Raka Pratama",
  password: process.env.SEED_TEMP_STUDENT_PASSWORD?.trim() || "TempStudent123!",
};

const DEFAULT_TUTOR = {
  email: process.env.SEED_TUTOR_EMAIL?.trim() || "tutor@vecalss.local",
  fullName: "Nadia Prameswari",
  password: process.env.SEED_TUTOR_PASSWORD?.trim() || "Tutor12345!",
};

const DEMO_STUDENTS = [
  { email: "dimas@vecalss.local", fullName: "Dimas Saputra", key: "completed" },
  { email: "leila@vecalss.local", fullName: "Leila Maheswari", key: "secondCompleted" },
  { email: "nabila@vecalss.local", fullName: "Nabila Putri", key: "pending" },
  { email: "fajar@vecalss.local", fullName: "Fajar Nugroho", key: "rejected" },
  { email: "salma@vecalss.local", fullName: "Salma Maharani", key: "revoked" },
];

function requireDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before running the seed script.");
  }

  return databaseUrl;
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function upsertExamProgram(client, { code, description, name }) {
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

async function upsertExamEvent(client, { examDate, examProgramId, name, registrationUrl }) {
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

async function upsertUniversity(client, { city, name, officialUrl, province, shortName, type }) {
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

async function upsertMajor(client, { degreeLevel, faculty, name, universityId }) {
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

async function upsertUser(client, { email, fullName, mustChangePassword, passwordHash, passwordUpdatedAt }) {
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

async function ensureRoleAssignment(client, { assignedByUserId = null, role, userId }) {
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

async function upsertStudentProfile(
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

async function upsertTutorProfile(client, { bio, headline, userId }) {
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

async function upsertCohort(
  client,
  {
    endDate,
    examEventId,
    name,
    startDate,
  },
) {
  const existing = await client.query(
    `
      SELECT id
      FROM cohorts
      WHERE exam_event_id = $1
        AND name = $2
      LIMIT 1
    `,
    [examEventId, name],
  );

  if (existing.rowCount) {
    await client.query(
      `
        UPDATE cohorts
        SET end_date = $2,
            is_active = TRUE,
            start_date = $3,
            updated_at = NOW()
        WHERE id = $1
      `,
      [existing.rows[0].id, endDate, startDate],
    );

    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO cohorts (
        exam_event_id,
        name,
        start_date,
        end_date,
        is_active
      )
      VALUES ($1, $2, $3, $4, TRUE)
      RETURNING id
    `,
    [examEventId, name, startDate, endDate],
  );

  return created.rows[0].id;
}

async function ensureCohortStudent(client, { cohortId, studentId }) {
  const existing = await client.query(
    `
      SELECT id
      FROM cohort_students
      WHERE cohort_id = $1
        AND student_id = $2
      LIMIT 1
    `,
    [cohortId, studentId],
  );

  if (existing.rowCount) {
    await client.query(
      `
        UPDATE cohort_students
        SET left_at = NULL
        WHERE id = $1
      `,
      [existing.rows[0].id],
    );

    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO cohort_students (
        cohort_id,
        student_id
      )
      VALUES ($1, $2)
      RETURNING id
    `,
    [cohortId, studentId],
  );

  return created.rows[0].id;
}

async function ensureTutorCohortAssignment(client, { assignedByUserId = null, cohortId, tutorId }) {
  const existing = await client.query(
    `
      SELECT id
      FROM tutor_cohort_assignments
      WHERE cohort_id = $1
        AND tutor_id = $2
        AND revoked_at IS NULL
      LIMIT 1
    `,
    [cohortId, tutorId],
  );

  if (existing.rowCount) {
    return existing.rows[0].id;
  }

  const created = await client.query(
    `
      INSERT INTO tutor_cohort_assignments (
        tutor_id,
        cohort_id,
        assigned_by_user_id
      )
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [tutorId, cohortId, assignedByUserId],
  );

  return created.rows[0].id;
}

async function ensureNotificationPreference(client, userId) {
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

async function seedLearningProgress(client, { completedStudentId, primaryStudentId }) {
  await client.query(
    `UPDATE student_profiles
        SET current_streak = 6, longest_streak = 11, last_streak_date = CURRENT_DATE, updated_at = NOW()
      WHERE user_id = $1`,
    [primaryStudentId],
  );
  await client.query(
    `UPDATE student_profiles
        SET current_streak = 3, longest_streak = 8, last_streak_date = CURRENT_DATE - 1, updated_at = NOW()
      WHERE user_id = $1`,
    [completedStudentId],
  );
  const modules = await client.query(
    `SELECT modules.id
      FROM modules
      JOIN topics ON topics.id = modules.topic_id
      JOIN subtests ON subtests.id = topics.subtest_id
      WHERE modules.status = 'published'
        AND topics.code NOT LIKE 'materi:%'
      ORDER BY subtests.sort_order, modules.sequence_no
      LIMIT 12`,
  );
  for (const [index, module] of modules.rows.entries()) {
    const status = index < 5 ? "completed" : index < 8 ? "in_progress" : index === 8 ? "not_started" : "locked";
    const percent = status === "completed" ? 100 : status === "in_progress" ? 45 + (index % 3) * 15 : 0;
    await client.query(
      `INSERT INTO module_progress (
         student_id, module_id, status, percent_complete, video_position_seconds,
         unlocked_at, completed_at, last_opened_at
       ) VALUES (
         $1, $2, $3::progress_status, $4, $5,
         CASE WHEN $3 <> 'locked' THEN NOW() - INTERVAL '14 days' ELSE NULL END,
         CASE WHEN $3 = 'completed' THEN NOW() - (($6::int + 2) * INTERVAL '1 day') ELSE NULL END,
         CASE WHEN $3 IN ('completed', 'in_progress') THEN NOW() - ($6::int * INTERVAL '1 day') ELSE NULL END
       )
       ON CONFLICT (student_id, module_id) DO UPDATE
         SET status = EXCLUDED.status,
             percent_complete = EXCLUDED.percent_complete,
             video_position_seconds = EXCLUDED.video_position_seconds,
             unlocked_at = EXCLUDED.unlocked_at,
             completed_at = EXCLUDED.completed_at,
             last_opened_at = EXCLUDED.last_opened_at,
             updated_at = NOW()`,
      // The current Materi experience is document-first. Keep the legacy
      // progress column at zero for compatibility; video playback is never a
      // prerequisite for completion of the demo readings.
      [primaryStudentId, module.id, status, percent, 0, index],
    );
  }
}

async function seedOperationalContext(client, { adminUserId, cohortId, completedStudentId, primaryStudentId, tryoutId, tutorUserId }) {
  for (const studentId of [primaryStudentId, completedStudentId]) {
    await client.query(
      `INSERT INTO billing_accounts (
         student_id, status, plan_code, access_starts_at, access_expires_at, extended_by_user_id
       ) VALUES ($1, 'active', 'SNBT-INTENSIF-2027', NOW() - INTERVAL '45 days', NOW() + INTERVAL '240 days', $2)
       ON CONFLICT (student_id) DO UPDATE
         SET status = 'active',
             plan_code = EXCLUDED.plan_code,
             access_starts_at = EXCLUDED.access_starts_at,
             access_expires_at = EXCLUDED.access_expires_at,
             extended_by_user_id = EXCLUDED.extended_by_user_id,
             updated_at = NOW()`,
      [studentId, adminUserId],
    );
  }

  const moduleResult = await client.query(
    `SELECT modules.id
      FROM modules
      JOIN topics ON topics.id = modules.topic_id
      JOIN subtests ON subtests.id = topics.subtest_id
      WHERE subtests.code = 'PK'
        AND modules.status = 'published'
        AND topics.code NOT LIKE 'materi:%'
      ORDER BY modules.sequence_no
      LIMIT 1`,
  );
  const flagResult = await client.query(
    `SELECT id FROM risk_flags
      WHERE student_id = $1 AND cohort_id = $2 AND flag_type = 'practice_consistency'
      LIMIT 1`,
    [completedStudentId, cohortId],
  );
  let riskFlagId = flagResult.rows[0]?.id;
  if (!riskFlagId) {
    const createdFlag = await client.query(
      `INSERT INTO risk_flags (student_id, cohort_id, flag_type, severity, reason, status)
       VALUES ($1, $2, 'practice_consistency', 2, $3, 'acknowledged')
       RETURNING id`,
      [completedStudentId, cohortId, "Frekuensi latihan kuantitatif menurun selama dua pekan terakhir."],
    );
    riskFlagId = createdFlag.rows[0].id;
  }
  const intervention = await client.query(
    "SELECT id FROM interventions WHERE tutor_id = $1 AND student_id = $2 AND risk_flag_id = $3 LIMIT 1",
    [tutorUserId, completedStudentId, riskFlagId],
  );
  if (!intervention.rowCount) {
    await client.query(
      `INSERT INTO interventions (
         tutor_id, student_id, cohort_id, risk_flag_id, recommended_module_id,
         message, status, sent_at, read_at
       ) VALUES ($1, $2, $3, $4, $5, $6, 'read', NOW() - INTERVAL '3 days', NOW() - INTERVAL '2 days')`,
      [tutorUserId, completedStudentId, cohortId, riskFlagId, moduleResult.rows[0]?.id ?? null, "Dimas, hasil evaluasimu sudah menunjukkan kemajuan. Pekan ini, luangkan dua sesi untuk meninjau kembali rasio dan persentase sebelum latihan berikutnya."],
    );
  }

  const notificationRows = [
    {
      body: "Sesi Reguler Pekan Ini sudah tersedia. Pastikan perangkat dan koneksi siap sebelum memulai.",
      deepLink: "/tryout",
      eventType: "announcement",
      readAt: null,
      title: "Sesi simulasi sudah dibuka",
    },
    {
      body: "Hasil Sesi Evaluasi Sebelumnya telah diterbitkan dan dapat ditinjau bersama pembahasan setiap subtes.",
      deepLink: "/tryout",
      eventType: "tryout_graded",
      readAt: new Date(),
      title: "Hasil evaluasi telah tersedia",
    },
  ];
  for (const notification of notificationRows) {
    const existing = await client.query(
      "SELECT id FROM notifications WHERE recipient_user_id = $1 AND title = $2 LIMIT 1",
      [primaryStudentId, notification.title],
    );
    if (existing.rowCount) {
      await client.query(
        `UPDATE notifications
            SET body = $2, deep_link = $3, read_at = $4, source_entity_id = $5, created_at = NOW()
          WHERE id = $1`,
        [existing.rows[0].id, notification.body, notification.deepLink, notification.readAt, tryoutId],
      );
      continue;
    }
    const created = await client.query(
      `INSERT INTO notifications (
         recipient_user_id, event_type, title, body, deep_link, priority,
         source_entity_type, source_entity_id, read_at
       ) VALUES ($1, $2::notification_event_type, $3, $4, $5, 1, 'tryout', $6, $7)
       RETURNING id`,
      [primaryStudentId, notification.eventType, notification.title, notification.body, notification.deepLink, tryoutId, notification.readAt],
    );
    await client.query(
      `INSERT INTO notification_deliveries (notification_id, channel, status, delivered_at)
       VALUES ($1, 'in_app', 'delivered', NOW())`,
      [created.rows[0].id],
    );
  }

  await client.query(
    `INSERT INTO system_configs (config_key, config_value, updated_by_user_id)
     VALUES ('demo.usability_context', $1::jsonb, $2)
     ON CONFLICT (config_key) DO UPDATE
       SET config_value = EXCLUDED.config_value,
           updated_by_user_id = EXCLUDED.updated_by_user_id,
           updated_at = NOW()`,
    [JSON.stringify({ cohort: "Kelas Persiapan SNBT 2027", purpose: "Demonstrasi produk dan pengujian kegunaan", seededAt: new Date().toISOString() }), adminUserId],
  );
}

async function main() {
  const client = new Client({
    connectionString: requireDatabaseUrl(),
  });

  await client.connect();

  try {
    await client.query("BEGIN");

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

    await upsertExamEvent(client, {
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

    await upsertMajor(client, {
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

    await seedMateriCatalogue(client, { authorUserId: tutorUserId });

    const demoPasswordHash = await hashPassword("Student12345!");
    const demoStudentIds = {};
    for (const demoStudent of DEMO_STUDENTS) {
      const demoStudentId = await upsertUser(client, {
        email: demoStudent.email,
        fullName: demoStudent.fullName,
        mustChangePassword: false,
        passwordHash: demoPasswordHash,
        passwordUpdatedAt: new Date(),
      });
      demoStudentIds[demoStudent.key] = demoStudentId;
      await ensureRoleAssignment(client, {
        assignedByUserId: adminUserId,
        role: "student",
        userId: demoStudentId,
      });
      await ensureNotificationPreference(client, demoStudentId);
      await upsertStudentProfile(client, {
        displayName: demoStudent.fullName,
        enrolledByUserId: adminUserId,
        onboardingStatus: "completed",
        targetExamEventId: upcomingExamEventId,
        targetMajorId: uiInformaticsId,
        targetUniversityId: uiId,
        userId: demoStudentId,
      });
    }

    const cohortId = await upsertCohort(client, {
      endDate: new Date("2027-04-30"),
      examEventId: upcomingExamEventId,
      name: "Kelas Persiapan SNBT 2027",
      startDate: new Date("2027-01-15"),
    });

    await ensureCohortStudent(client, {
      cohortId,
      studentId: studentUserId,
    });
    await ensureCohortStudent(client, {
      cohortId,
      studentId: tempStudentUserId,
    });
    for (const demoStudentId of Object.values(demoStudentIds)) {
      await ensureCohortStudent(client, {
        cohortId,
        studentId: demoStudentId,
      });
    }
    await ensureTutorCohortAssignment(client, {
      assignedByUserId: adminUserId,
      cohortId,
      tutorId: tutorUserId,
    });

    await seedLearningProgress(client, {
      completedStudentId: demoStudentIds.completed,
      primaryStudentId: studentUserId,
    });
    const assessmentSummary = await seedAssessmentDemo(client, {
      examEventId: upcomingExamEventId,
      studentIds: {
        ...demoStudentIds,
        primary: studentUserId,
      },
      tutorId: tutorUserId,
    });
    await seedOperationalContext(client, {
      adminUserId,
      cohortId,
      completedStudentId: demoStudentIds.completed,
      primaryStudentId: studentUserId,
      tryoutId: assessmentSummary.tryoutId,
      tutorUserId,
    });

    await client.query("COMMIT");

    console.log("Vecalss seed completed.\n");
    console.log(`Demonstration content: ${assessmentSummary.questionCount} questions, ${assessmentSummary.quizCount} quizzes, ${assessmentSummary.versionCount} reusable packages, 2 delivery sessions, and 6 participant states.\n`);
    console.table([
      {
        email: DEFAULT_ADMIN.email,
        loginPath: "/admin/login",
        password: DEFAULT_ADMIN.password,
        role: "admin",
      },
      {
        email: DEFAULT_STUDENT.email,
        loginPath: "/login",
        password: DEFAULT_STUDENT.password,
        role: "student",
      },
      {
        email: DEFAULT_TEMP_STUDENT.email,
        loginPath: "/login",
        password: DEFAULT_TEMP_STUDENT.password,
        role: "student-temporary",
      },
      {
        email: DEFAULT_TUTOR.email,
        loginPath: "/mentor/dashboard",
        password: DEFAULT_TUTOR.password,
        role: "tutor",
      },
    ]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("Failed to seed Vecalss demo data.");
  console.error(error);
  process.exitCode = 1;
});
