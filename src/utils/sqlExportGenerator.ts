/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  SchoolProfile,
  AcademicSession,
  Term,
  ClassSection,
  Teacher,
  Subject,
  Student,
  AssessmentComponent,
  StudentSubjectEnrollment,
  AssessmentScore,
  TermSubjectRecord,
  StudentTermSummary,
  ScoreAuditLog,
  CommentBankItem,
  CustomReportTemplate,
  AcademicSessionArchive,
  StudentPromotionRecord,
  OfficeMessage,
  RequiredDocumentSlot,
  TeacherDocumentUpload,
  StudentTestimonial,
  AcademicDepartment,
  GradingScalePreset,
  ReportCardSubjectOrder
} from '../types/index';

export interface FullDatabaseSnapshot {
  schoolProfile: SchoolProfile;
  sessions: AcademicSession[];
  terms: Term[];
  classSections: ClassSection[];
  teachers: Teacher[];
  subjects: Subject[];
  students: Student[];
  assessmentComponents: AssessmentComponent[];
  enrollments: StudentSubjectEnrollment[];
  scores: AssessmentScore[];
  termSubjectRecords: TermSubjectRecord[];
  termSummaries: StudentTermSummary[];
  auditLogs: ScoreAuditLog[];
  commentBank: CommentBankItem[];
  customReportTemplates?: CustomReportTemplate[];
  sessionArchives?: AcademicSessionArchive[];
  promotionLogs?: StudentPromotionRecord[];
  officeMessages?: OfficeMessage[];
  requiredDocumentSlots?: RequiredDocumentSlot[];
  teacherDocumentUploads?: TeacherDocumentUpload[];
  studentTestimonials?: StudentTestimonial[];
  academicDepartments?: AcademicDepartment[];
  gradingScalePresets?: GradingScalePreset[];
  reportCardSubjectOrder?: ReportCardSubjectOrder;
}

export function normalizeEnrollmentIds(snapshot: FullDatabaseSnapshot): FullDatabaseSnapshot {
  const usedIds = new Set<number>();
  let nextId =
    Math.max(0, ...snapshot.enrollments.map(enrollment => enrollment.id)) + 1;
  const enrollmentIdsByStudentSubjectTerm = new Map<string, number>();

  const enrollments = snapshot.enrollments.map(enrollment => {
    let id = enrollment.id;
    if (!Number.isSafeInteger(id) || id <= 0 || usedIds.has(id)) {
      while (usedIds.has(nextId)) nextId += 1;
      id = nextId;
      nextId += 1;
    }

    usedIds.add(id);
    enrollmentIdsByStudentSubjectTerm.set(
      `${enrollment.studentId}:${enrollment.subjectId}:${enrollment.termId}`,
      id
    );
    return id === enrollment.id ? enrollment : { ...enrollment, id };
  });

  const termIdByComponentId = new Map(
    snapshot.assessmentComponents.map(component => [component.id, component.termId])
  );
  const scores = snapshot.scores.map(score => {
    const termId = termIdByComponentId.get(score.componentId);
    const enrollmentId =
      termId === undefined
        ? undefined
        : enrollmentIdsByStudentSubjectTerm.get(
            `${score.studentId}:${score.subjectId}:${termId}`
          );
    const fallbackEnrollmentId = enrollments.find(
      enrollment =>
        enrollment.studentId === score.studentId &&
        enrollment.subjectId === score.subjectId
    )?.id;
    const resolvedEnrollmentId = enrollmentId ?? fallbackEnrollmentId;
    return resolvedEnrollmentId === undefined || resolvedEnrollmentId === score.enrollmentId
      ? score
      : { ...score, enrollmentId: resolvedEnrollmentId };
  });

  return { ...snapshot, enrollments, scores };
}

/**
 * Escapes a string or value for safe MySQL SQL literal insertion in phpMyAdmin dumps.
 */
export function escapeSqlValue(val: unknown): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }
  if (typeof val === 'number') {
    return Number.isFinite(val) ? String(val) : 'NULL';
  }
  if (typeof val === 'boolean') {
    return val ? '1' : '0';
  }
  const str = String(val)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
  return `'${str}'`;
}

/**
 * Returns the array of MySQL CREATE TABLE DDL statements for all relational tables
 * compatible with MySQL 5.7+ / 8.0+ and MariaDB 10.4+ in phpMyAdmin (XAMPP/WAMP/cPanel).
 */
export function getMySqlSchemaDDL(): Array<{ tableName: string; ddl: string }> {
  return [
    {
      tableName: 'school_profile',
      ddl: `CREATE TABLE IF NOT EXISTS \`school_profile\` (
  \`id\` INT NOT NULL DEFAULT 1,
  \`name\` VARCHAR(255) NOT NULL,
  \`motto\` VARCHAR(255) DEFAULT NULL,
  \`address\` VARCHAR(500) DEFAULT NULL,
  \`phone\` VARCHAR(100) DEFAULT NULL,
  \`email\` VARCHAR(150) DEFAULT NULL,
  \`logo_url\` TEXT DEFAULT NULL,
  \`principal_name\` VARCHAR(200) DEFAULT NULL,
  \`form_teacher_name\` VARCHAR(200) DEFAULT NULL,
  \`report_date\` VARCHAR(50) DEFAULT NULL,
  \`current_session\` VARCHAR(50) DEFAULT NULL,
  \`current_term\` VARCHAR(30) DEFAULT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'academic_sessions',
      ddl: `CREATE TABLE IF NOT EXISTS \`academic_sessions\` (
  \`id\` INT NOT NULL,
  \`name\` VARCHAR(50) NOT NULL,
  \`is_current\` TINYINT(1) NOT NULL DEFAULT 0,
  \`institution_name\` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'terms',
      ddl: `CREATE TABLE IF NOT EXISTS \`terms\` (
  \`id\` INT NOT NULL,
  \`session_id\` INT NOT NULL,
  \`name\` VARCHAR(30) NOT NULL,
  \`is_current\` TINYINT(1) NOT NULL DEFAULT 0,
  \`next_term_begins\` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'class_sections',
      ddl: `CREATE TABLE IF NOT EXISTS \`class_sections\` (
  \`id\` BIGINT NOT NULL,
  \`class_level_id\` INT NOT NULL DEFAULT 1,
  \`name\` VARCHAR(120) NOT NULL,
  \`code\` VARCHAR(50) DEFAULT NULL,
  \`level_type\` ENUM('JUNIOR','SENIOR') NOT NULL DEFAULT 'JUNIOR',
  \`class_teacher_name\` VARCHAR(200) DEFAULT NULL,
  \`capacity\` INT NOT NULL DEFAULT 35,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'teachers',
      ddl: `CREATE TABLE IF NOT EXISTS \`teachers\` (
  \`id\` BIGINT NOT NULL,
  \`staff_id\` VARCHAR(60) DEFAULT NULL,
  \`full_name\` VARCHAR(200) NOT NULL,
  \`username\` VARCHAR(100) DEFAULT NULL,
  \`initial_pin\` VARCHAR(10) DEFAULT NULL,
  \`email\` VARCHAR(150) DEFAULT NULL,
  \`phone\` VARCHAR(60) DEFAULT NULL,
  \`assigned_section_id\` BIGINT DEFAULT NULL,
  \`assigned_subjects_json\` TEXT DEFAULT NULL,
  \`role\` ENUM('FORM_TUTOR','SUBJECT_TEACHER','BOTH') NOT NULL DEFAULT 'FORM_TUTOR',
  \`system_role\` VARCHAR(40) DEFAULT 'CLASS_TEACHER',
  \`must_set_password\` TINYINT(1) NOT NULL DEFAULT 1,
  \`has_password_set\` TINYINT(1) NOT NULL DEFAULT 0,
  \`password_reset_requested\` TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (\`id\`),
  KEY \`idx_teachers_username\` (\`username\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'teacher_subject_assignments',
      ddl: `CREATE TABLE IF NOT EXISTS \`teacher_subject_assignments\` (
  \`id\` BIGINT NOT NULL AUTO_INCREMENT,
  \`teacher_id\` BIGINT NOT NULL,
  \`section_id\` BIGINT NOT NULL,
  \`subject_id\` BIGINT NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_teacher_sec_subj\` (\`section_id\`, \`subject_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'subjects',
      ddl: `CREATE TABLE IF NOT EXISTS \`subjects\` (
  \`id\` BIGINT NOT NULL,
  \`name\` VARCHAR(150) NOT NULL,
  \`code\` VARCHAR(40) NOT NULL,
  \`applicable_level\` ENUM('JUNIOR','SENIOR','BOTH') NOT NULL DEFAULT 'BOTH',
  \`category\` ENUM('CORE','OPTIONAL','ELECTIVE') NOT NULL DEFAULT 'CORE',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'students',
      ddl: `CREATE TABLE IF NOT EXISTS \`students\` (
  \`id\` BIGINT NOT NULL,
  \`admission_number\` VARCHAR(80) NOT NULL,
  \`full_name\` VARCHAR(200) NOT NULL,
  \`gender\` ENUM('MALE','FEMALE') NOT NULL DEFAULT 'MALE',
  \`current_section_id\` BIGINT NOT NULL,
  \`attendance_days\` INT DEFAULT 60,
  \`promotion_status\` VARCHAR(40) DEFAULT 'ENROLLED',
  \`is_record_sealed\` TINYINT(1) NOT NULL DEFAULT 0,
  \`record_signature\` VARCHAR(40) DEFAULT NULL,
  \`graduated_session_name\` VARCHAR(50) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_students_section\` (\`current_section_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'assessment_components',
      ddl: `CREATE TABLE IF NOT EXISTS \`assessment_components\` (
  \`id\` BIGINT NOT NULL,
  \`term_id\` INT NOT NULL DEFAULT 1,
  \`name\` VARCHAR(100) NOT NULL,
  \`short_code\` VARCHAR(30) NOT NULL,
  \`max_score\` DECIMAL(6,2) NOT NULL DEFAULT 10.00,
  \`weight_order\` INT NOT NULL DEFAULT 1,
  \`level_type\` ENUM('JUNIOR','SENIOR') NOT NULL DEFAULT 'JUNIOR',
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'student_subject_enrollments',
      ddl: `CREATE TABLE IF NOT EXISTS \`student_subject_enrollments\` (
  \`id\` BIGINT NOT NULL,
  \`student_id\` BIGINT NOT NULL,
  \`section_id\` BIGINT NOT NULL,
  \`subject_id\` BIGINT NOT NULL,
  \`term_id\` INT NOT NULL DEFAULT 1,
  \`is_included\` TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_enrollment_student_subj_term\` (\`student_id\`, \`subject_id\`, \`term_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'assessment_scores',
      ddl: `CREATE TABLE IF NOT EXISTS \`assessment_scores\` (
  \`id\` BIGINT NOT NULL,
  \`enrollment_id\` BIGINT NOT NULL DEFAULT 0,
  \`student_id\` BIGINT NOT NULL,
  \`subject_id\` BIGINT NOT NULL,
  \`component_id\` BIGINT NOT NULL,
  \`score\` DECIMAL(6,2) DEFAULT NULL,
  \`updated_by\` INT NOT NULL DEFAULT 1,
  \`updated_at\` VARCHAR(60) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_score_student_subj_comp\` (\`student_id\`, \`subject_id\`, \`component_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'term_subject_records',
      ddl: `CREATE TABLE IF NOT EXISTS \`term_subject_records\` (
  \`id\` BIGINT NOT NULL,
  \`student_id\` BIGINT NOT NULL,
  \`subject_id\` BIGINT NOT NULL,
  \`term_id\` INT NOT NULL,
  \`ca1_score\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`ca2_score\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`ca1_raw_score\` DECIMAL(6,2) DEFAULT NULL,
  \`ca2_raw_score\` DECIMAL(6,2) DEFAULT NULL,
  \`exam_score\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`total_score\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`grade\` VARCHAR(10) NOT NULL DEFAULT 'F',
  \`ca1_details_json\` TEXT DEFAULT NULL,
  \`ca2_details_json\` TEXT DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_term_subj_rec\` (\`student_id\`, \`subject_id\`, \`term_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'student_term_summaries',
      ddl: `CREATE TABLE IF NOT EXISTS \`student_term_summaries\` (
  \`id\` BIGINT NOT NULL,
  \`student_id\` BIGINT NOT NULL,
  \`section_id\` BIGINT NOT NULL,
  \`term_id\` INT NOT NULL,
  \`total_score_obtained\` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  \`total_possible_score\` DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  \`cumulative_percentage\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`cumulative_grade\` VARCHAR(10) NOT NULL DEFAULT 'F',
  \`class_rank\` INT NOT NULL DEFAULT 1,
  \`total_students_in_section\` INT NOT NULL DEFAULT 1,
  \`principal_remark\` TEXT DEFAULT NULL,
  \`teacher_remark\` TEXT DEFAULT NULL,
  \`is_published\` TINYINT(1) NOT NULL DEFAULT 1,
  \`updated_at\` VARCHAR(60) DEFAULT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_student_term_summary\` (\`student_id\`, \`section_id\`, \`term_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'custom_report_templates',
      ddl: `CREATE TABLE IF NOT EXISTS \`custom_report_templates\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`section_id\` BIGINT NOT NULL,
  \`section_ids_json\` TEXT DEFAULT NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`subtitle\` VARCHAR(255) DEFAULT NULL,
  \`report_mode\` VARCHAR(50) NOT NULL DEFAULT 'INDIVIDUAL_STUDENT',
  \`enabled_in_report_tab\` TINYINT(1) NOT NULL DEFAULT 0,
  \`color_bar_theme\` VARCHAR(40) DEFAULT 'emerald',
  \`columns_json\` TEXT NOT NULL,
  \`selected_subject_ids_json\` TEXT NOT NULL,
  \`custom_subject_scores_json\` TEXT DEFAULT NULL,
  \`student_custom_scores_json\` LONGTEXT DEFAULT NULL,
  \`updated_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'score_audit_logs',
      ddl: `CREATE TABLE IF NOT EXISTS \`score_audit_logs\` (
  \`id\` BIGINT NOT NULL,
  \`student_name\` VARCHAR(200) NOT NULL,
  \`subject_name\` VARCHAR(150) NOT NULL,
  \`component_name\` VARCHAR(100) NOT NULL,
  \`previous_score\` DECIMAL(6,2) DEFAULT NULL,
  \`new_score\` DECIMAL(6,2) DEFAULT NULL,
  \`changed_by\` VARCHAR(150) NOT NULL,
  \`changed_by_role\` VARCHAR(50) NOT NULL,
  \`change_reason\` TEXT DEFAULT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'comment_bank',
      ddl: `CREATE TABLE IF NOT EXISTS \`comment_bank\` (
  \`id\` BIGINT NOT NULL,
  \`grade\` VARCHAR(10) NOT NULL,
  \`remark_type\` ENUM('PRINCIPAL','TEACHER') NOT NULL,
  \`comment_text\` TEXT NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'academic_session_archives',
      ddl: `CREATE TABLE IF NOT EXISTS \`academic_session_archives\` (
  \`session_id\` INT NOT NULL,
  \`session_name\` VARCHAR(50) NOT NULL,
  \`institution_name\` VARCHAR(255) NOT NULL,
  \`school_motto\` VARCHAR(255) DEFAULT NULL,
  \`principal_name\` VARCHAR(200) DEFAULT NULL,
  \`archive_json\` LONGTEXT NOT NULL,
  \`updated_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`session_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'student_promotions_log',
      ddl: `CREATE TABLE IF NOT EXISTS \`student_promotions_log\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`student_id\` BIGINT NOT NULL,
  \`student_name\` VARCHAR(200) NOT NULL,
  \`admission_number\` VARCHAR(80) NOT NULL,
  \`from_session_id\` INT NOT NULL,
  \`from_session_name\` VARCHAR(50) NOT NULL,
  \`to_session_id\` INT NOT NULL,
  \`to_session_name\` VARCHAR(50) NOT NULL,
  \`from_section_id\` BIGINT NOT NULL,
  \`from_section_name\` VARCHAR(120) NOT NULL,
  \`to_section_id\` BIGINT NOT NULL,
  \`to_section_name\` VARCHAR(120) NOT NULL,
  \`to_form_tutor_name\` VARCHAR(200) DEFAULT NULL,
  \`first_term_pct\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`second_term_pct\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`third_term_pct\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`cumulative_avg_pct\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`final_grade\` VARCHAR(10) NOT NULL DEFAULT 'F',
  \`decision\` VARCHAR(40) NOT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'office_messages',
      ddl: `CREATE TABLE IF NOT EXISTS \`office_messages\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`sender_name\` VARCHAR(200) NOT NULL,
  \`sender_role\` VARCHAR(40) NOT NULL,
  \`recipient_teacher_id\` VARCHAR(50) NOT NULL DEFAULT 'ALL',
  \`recipient_teacher_name\` VARCHAR(200) DEFAULT NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`body\` TEXT NOT NULL,
  \`read_by_teacher_ids_json\` TEXT DEFAULT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'required_document_slots',
      ddl: `CREATE TABLE IF NOT EXISTS \`required_document_slots\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`category\` VARCHAR(50) NOT NULL DEFAULT 'LESSON_PLAN',
  \`description\` TEXT DEFAULT NULL,
  \`created_by_role\` VARCHAR(40) NOT NULL,
  \`created_by_name\` VARCHAR(200) NOT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'teacher_document_uploads',
      ddl: `CREATE TABLE IF NOT EXISTS \`teacher_document_uploads\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`teacher_id\` BIGINT NOT NULL,
  \`teacher_name\` VARCHAR(200) NOT NULL,
  \`section_id\` BIGINT NOT NULL,
  \`section_name\` VARCHAR(120) NOT NULL,
  \`subject_id\` BIGINT NOT NULL,
  \`subject_name\` VARCHAR(150) NOT NULL,
  \`department_id\` VARCHAR(100) DEFAULT NULL,
  \`department_name\` VARCHAR(200) DEFAULT NULL,
  \`term_id\` INT NOT NULL DEFAULT 1,
  \`term_name\` VARCHAR(30) NOT NULL DEFAULT 'FIRST',
  \`week_number\` INT NOT NULL DEFAULT 1,
  \`document_slot_id\` VARCHAR(100) NOT NULL,
  \`document_title\` VARCHAR(255) NOT NULL,
  \`document_category\` VARCHAR(50) NOT NULL,
  \`file_name\` VARCHAR(255) NOT NULL,
  \`file_type\` VARCHAR(20) NOT NULL DEFAULT 'PDF',
  \`file_size_kb\` INT NOT NULL DEFAULT 0,
  \`file_storage_path\` VARCHAR(500) DEFAULT NULL,
  \`status\` VARCHAR(40) NOT NULL DEFAULT 'PENDING_REVIEW',
  \`hod_review_status\` VARCHAR(40) DEFAULT 'PENDING_HOD',
  \`hod_reviewed_by\` VARCHAR(200) DEFAULT NULL,
  \`hod_reviewed_at\` VARCHAR(60) DEFAULT NULL,
  \`executive_remarks_json\` LONGTEXT DEFAULT NULL,
  \`uploaded_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_doc_teacher_week\` (\`teacher_id\`, \`week_number\`),
  KEY \`idx_doc_subject_section\` (\`subject_id\`, \`section_id\`),
  KEY \`idx_doc_department\` (\`department_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'academic_departments',
      ddl: `CREATE TABLE IF NOT EXISTS \`academic_departments\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`code\` VARCHAR(50) NOT NULL,
  \`hod_teacher_id\` BIGINT NOT NULL,
  \`hod_teacher_name\` VARCHAR(200) NOT NULL,
  \`hod_username\` VARCHAR(120) DEFAULT NULL,
  \`subject_ids_json\` TEXT NOT NULL,
  \`description\` TEXT DEFAULT NULL,
  \`created_by_role\` VARCHAR(40) NOT NULL,
  \`created_by_name\` VARCHAR(200) NOT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_dept_hod\` (\`hod_teacher_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'grading_scale_presets',
      ddl: `CREATE TABLE IF NOT EXISTS \`grading_scale_presets\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`name\` VARCHAR(255) NOT NULL,
  \`target_scope\` VARCHAR(40) NOT NULL DEFAULT 'JUNIOR',
  \`custom_template_id\` VARCHAR(100) DEFAULT 'ALL',
  \`is_default\` TINYINT(1) NOT NULL DEFAULT 0,
  \`is_enabled_for_reports\` TINYINT(1) NOT NULL DEFAULT 1,
  \`bands_json\` LONGTEXT NOT NULL,
  \`updated_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`),
  KEY \`idx_scale_scope_enabled\` (\`target_scope\`, \`is_enabled_for_reports\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'document_cache_entries',
      ddl: `CREATE TABLE IF NOT EXISTS \`document_cache_entries\` (
  \`cache_key\` VARCHAR(191) NOT NULL,
  \`etag\` VARCHAR(80) NOT NULL,
  \`byte_size\` INT NOT NULL DEFAULT 0,
  \`hit_count\` INT NOT NULL DEFAULT 0,
  \`expires_at_ms\` BIGINT NOT NULL,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`cache_key\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'student_testimonials',
      ddl: `CREATE TABLE IF NOT EXISTS \`student_testimonials\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`student_id\` BIGINT NOT NULL,
  \`student_name\` VARCHAR(200) NOT NULL,
  \`exam_or_admission_no\` VARCHAR(80) NOT NULL,
  \`school_name\` VARCHAR(255) NOT NULL,
  \`school_address\` VARCHAR(500) DEFAULT NULL,
  \`entry_year\` VARCHAR(20) NOT NULL,
  \`graduation_year\` VARCHAR(20) NOT NULL,
  \`entered_in_class\` VARCHAR(100) NOT NULL,
  \`left_in_class\` VARCHAR(100) NOT NULL,
  \`subjects_studied_json\` TEXT NOT NULL,
  \`academic_ability\` VARCHAR(100) NOT NULL,
  \`co_curricular_activities\` VARCHAR(100) NOT NULL,
  \`post_of_responsibility_held\` VARCHAR(150) NOT NULL,
  \`remarks_on_attitude\` VARCHAR(150) NOT NULL,
  \`general_remarks\` VARCHAR(255) NOT NULL,
  \`principal_name\` VARCHAR(200) NOT NULL,
  \`issue_date\` VARCHAR(50) NOT NULL,
  \`session_name\` VARCHAR(50) NOT NULL,
  \`cumulative_avg_pct\` DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  \`final_grade\` VARCHAR(10) NOT NULL DEFAULT 'C',
  \`record_signature\` VARCHAR(40) NOT NULL DEFAULT 'GRADUATED',
  \`is_sealed\` TINYINT(1) NOT NULL DEFAULT 1,
  \`created_at\` VARCHAR(60) NOT NULL,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_student_testimonial\` (\`student_id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'system_updates_log',
      ddl: `CREATE TABLE IF NOT EXISTS \`system_updates_log\` (
  \`id\` VARCHAR(100) NOT NULL,
  \`package_id\` VARCHAR(120) NOT NULL,
  \`version\` VARCHAR(40) NOT NULL,
  \`previous_version\` VARCHAR(40) NOT NULL,
  \`title\` VARCHAR(255) NOT NULL,
  \`status\` VARCHAR(40) NOT NULL DEFAULT 'INSTALLED',
  \`migrations_applied\` INT NOT NULL DEFAULT 0,
  \`installed_by\` VARCHAR(150) NOT NULL,
  \`installed_at\` VARCHAR(60) NOT NULL,
  \`notes\` TEXT DEFAULT NULL,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'app_state_store',
      ddl: `CREATE TABLE IF NOT EXISTS \`app_state_store\` (
  \`id\` INT NOT NULL DEFAULT 1,
  \`state_json\` LONGTEXT NOT NULL,
  \`updated_at\` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    },
    {
      tableName: 'offline_commit_archive',
      ddl: `CREATE TABLE IF NOT EXISTS \`offline_commit_archive\` (
  \`commit_id\` VARCHAR(128) NOT NULL,
  \`client_id\` VARCHAR(128) NOT NULL,
  \`client_ip\` VARCHAR(45) NOT NULL,
  \`actor_username\` VARCHAR(150) DEFAULT NULL,
  \`base_revision\` VARCHAR(80) DEFAULT NULL,
  \`committed_at\` VARCHAR(60) NOT NULL,
  \`changed_at_json\` LONGTEXT NOT NULL,
  PRIMARY KEY (\`commit_id\`),
  KEY \`idx_offline_commit_client\` (\`client_id\`),
  KEY \`idx_offline_commit_ip\` (\`client_ip\`),
  KEY \`idx_offline_commit_time\` (\`committed_at\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
    }
  ];
}

/**
 * Generates a complete, phpMyAdmin-ready `.sql` script with database creation,
 * all relational tables, and INSERT / REPLACE statements for all live platform data.
 */
export function generatePhpMyAdminSqlDump(
  snapshot: FullDatabaseSnapshot,
  dbName = 'edugrade_db'
): string {
  snapshot = normalizeEnrollmentIds(snapshot);
  const safeDbName = dbName.replace(/[^a-zA-Z0-9_]/g, '') || 'edugrade_db';
  const lines: string[] = [];

  lines.push('-- ============================================================================');
  lines.push(`-- ${snapshot.schoolProfile.name} - Continuous Assessment & Report Card Platform`);
  lines.push('-- MySQL / MariaDB Database Dump for phpMyAdmin (XAMPP / WAMP / MAMP / cPanel)');
  lines.push(`-- Target Database: \`${safeDbName}\``);
  lines.push(`-- Generated At: ${new Date().toISOString()}`);
  lines.push('-- ============================================================================');
  lines.push('');
  lines.push('SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";');
  lines.push('START TRANSACTION;');
  lines.push('SET time_zone = "+00:00";');
  lines.push('/*!40101 SET NAMES utf8mb4 */;');
  lines.push('');
  lines.push(`CREATE DATABASE IF NOT EXISTS \`${safeDbName}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
  lines.push(`USE \`${safeDbName}\`;`);
  lines.push('');

  // 1. Create Tables
  const schemaDDL = getMySqlSchemaDDL();
  for (const item of schemaDDL) {
    lines.push(`-- --------------------------------------------------------`);
    lines.push(`-- Table structure for table \`${item.tableName}\``);
    lines.push(`-- --------------------------------------------------------`);
    lines.push(item.ddl);
    lines.push('');
  }

  // 2. Insert School Profile
  const sp = snapshot.schoolProfile;
  lines.push('-- Dumping data for table `school_profile`');
  lines.push(
    `REPLACE INTO \`school_profile\` (\`id\`, \`name\`, \`motto\`, \`address\`, \`phone\`, \`email\`, \`logo_url\`, \`principal_name\`, \`form_teacher_name\`, \`report_date\`, \`current_session\`, \`current_term\`) VALUES (1, ${escapeSqlValue(sp.name)}, ${escapeSqlValue(sp.motto)}, ${escapeSqlValue(sp.address)}, ${escapeSqlValue(sp.phone || '')}, ${escapeSqlValue(sp.email || '')}, ${escapeSqlValue(sp.logoUrl || '')}, ${escapeSqlValue(sp.principalName)}, ${escapeSqlValue(sp.formTeacherName)}, ${escapeSqlValue(sp.reportDate)}, ${escapeSqlValue(sp.currentSession)}, ${escapeSqlValue(sp.currentTerm)});`
  );
  lines.push('');

  // 3. Insert Sessions
  if (snapshot.sessions.length > 0) {
    lines.push('-- Dumping data for table `academic_sessions`');
    const values = snapshot.sessions.map(
      s => `(${escapeSqlValue(s.id)}, ${escapeSqlValue(s.name)}, ${escapeSqlValue(s.isCurrent)}, ${escapeSqlValue(s.institutionName || snapshot.schoolProfile.name)})`
    );
    lines.push(`REPLACE INTO \`academic_sessions\` (\`id\`, \`name\`, \`is_current\`, \`institution_name\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 4. Insert Terms
  if (snapshot.terms.length > 0) {
    lines.push('-- Dumping data for table `terms`');
    const values = snapshot.terms.map(
      t => `(${escapeSqlValue(t.id)}, ${escapeSqlValue(t.sessionId)}, ${escapeSqlValue(t.name)}, ${escapeSqlValue(t.isActive)}, ${escapeSqlValue(t.startDate || null)})`
    );
    lines.push(`REPLACE INTO \`terms\` (\`id\`, \`session_id\`, \`name\`, \`is_current\`, \`next_term_begins\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 5. Insert Class Sections
  if (snapshot.classSections.length > 0) {
    lines.push('-- Dumping data for table `class_sections`');
    const values = snapshot.classSections.map(
      c => `(${escapeSqlValue(c.id)}, ${escapeSqlValue(c.classLevelId)}, ${escapeSqlValue(c.name)}, ${escapeSqlValue(c.code)}, ${escapeSqlValue(c.levelType)}, ${escapeSqlValue(c.classTeacherName)}, ${escapeSqlValue(c.capacity ?? 35)})`
    );
    lines.push(`REPLACE INTO \`class_sections\` (\`id\`, \`class_level_id\`, \`name\`, \`code\`, \`level_type\`, \`class_teacher_name\`, \`capacity\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 6. Insert Teachers & Teacher Subject Assignments
  if (snapshot.teachers.length > 0) {
    lines.push('-- Dumping data for table `teachers`');
    const values = snapshot.teachers.map(
      t =>
        `(${escapeSqlValue(t.id)}, ${escapeSqlValue(t.staffId)}, ${escapeSqlValue(t.fullName)}, ${escapeSqlValue(t.username || null)}, ${escapeSqlValue(t.initialPin || null)}, ${escapeSqlValue(t.email)}, ${escapeSqlValue(t.phone)}, ${escapeSqlValue(t.assignedSectionId ?? null)}, ${escapeSqlValue(t.assignedSubjects ? JSON.stringify(t.assignedSubjects) : null)}, ${escapeSqlValue(t.role)}, ${escapeSqlValue(t.systemRole || 'CLASS_TEACHER')}, ${escapeSqlValue(Boolean(t.mustSetPassword))}, ${escapeSqlValue(Boolean(t.hasPasswordSet))}, ${escapeSqlValue(Boolean(t.passwordResetRequested))})`
    );
    lines.push(
      `REPLACE INTO \`teachers\` (\`id\`, \`staff_id\`, \`full_name\`, \`username\`, \`initial_pin\`, \`email\`, \`phone\`, \`assigned_section_id\`, \`assigned_subjects_json\`, \`role\`, \`system_role\`, \`must_set_password\`, \`has_password_set\`, \`password_reset_requested\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');

    const assignmentRows: string[] = [];
    snapshot.teachers.forEach(t => {
      (t.assignedSubjects || []).forEach(a => {
        assignmentRows.push(`(${escapeSqlValue(t.id)}, ${escapeSqlValue(a.sectionId)}, ${escapeSqlValue(a.subjectId)})`);
      });
    });
    if (assignmentRows.length > 0) {
      lines.push('-- Dumping data for table `teacher_subject_assignments`');
      lines.push(
        `REPLACE INTO \`teacher_subject_assignments\` (\`teacher_id\`, \`section_id\`, \`subject_id\`) VALUES\n${assignmentRows.join(',\n')};`
      );
      lines.push('');
    }
  }

  // 7. Insert Subjects
  if (snapshot.subjects.length > 0) {
    lines.push('-- Dumping data for table `subjects`');
    const values = snapshot.subjects.map(
      s => `(${escapeSqlValue(s.id)}, ${escapeSqlValue(s.name)}, ${escapeSqlValue(s.code)}, ${escapeSqlValue(s.applicableLevel || 'BOTH')}, ${escapeSqlValue(s.category)})`
    );
    lines.push(`REPLACE INTO \`subjects\` (\`id\`, \`name\`, \`code\`, \`applicable_level\`, \`category\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 8. Insert Students
  if (snapshot.students.length > 0) {
    lines.push('-- Dumping data for table `students`');
    const values = snapshot.students.map(
      st =>
        `(${escapeSqlValue(st.id)}, ${escapeSqlValue(st.admissionNumber)}, ${escapeSqlValue(st.fullName)}, ${escapeSqlValue(st.gender)}, ${escapeSqlValue(st.currentSectionId)}, ${escapeSqlValue(st.attendanceDays ?? 60)}, ${escapeSqlValue(st.promotionStatus || 'ENROLLED')}, ${escapeSqlValue(Boolean(st.isRecordSealed))}, ${escapeSqlValue(st.recordSignature || null)}, ${escapeSqlValue(st.graduatedSessionName || null)})`
    );
    lines.push(
      `REPLACE INTO \`students\` (\`id\`, \`admission_number\`, \`full_name\`, \`gender\`, \`current_section_id\`, \`attendance_days\`, \`promotion_status\`, \`is_record_sealed\`, \`record_signature\`, \`graduated_session_name\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 9. Insert Assessment Components
  if (snapshot.assessmentComponents.length > 0) {
    lines.push('-- Dumping data for table `assessment_components`');
    const values = snapshot.assessmentComponents.map(
      c => `(${escapeSqlValue(c.id)}, ${escapeSqlValue(c.termId)}, ${escapeSqlValue(c.name)}, ${escapeSqlValue(c.shortCode)}, ${escapeSqlValue(c.maxScore)}, ${escapeSqlValue(c.weightOrder)}, ${escapeSqlValue(c.levelType)})`
    );
    lines.push(`REPLACE INTO \`assessment_components\` (\`id\`, \`term_id\`, \`name\`, \`short_code\`, \`max_score\`, \`weight_order\`, \`level_type\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 10. Insert Student Subject Enrollments (batched in chunks of 250 for phpMyAdmin import speed)
  if (snapshot.enrollments.length > 0) {
    lines.push('-- Dumping data for table `student_subject_enrollments`');
    const chunkSize = 250;
    for (let i = 0; i < snapshot.enrollments.length; i += chunkSize) {
      const chunk = snapshot.enrollments.slice(i, i + chunkSize);
      const values = chunk.map(
        e => `(${escapeSqlValue(e.id)}, ${escapeSqlValue(e.studentId)}, ${escapeSqlValue(e.sectionId)}, ${escapeSqlValue(e.subjectId)}, ${escapeSqlValue(e.termId)}, ${escapeSqlValue(e.isIncluded)})`
      );
      lines.push(`REPLACE INTO \`student_subject_enrollments\` (\`id\`, \`student_id\`, \`section_id\`, \`subject_id\`, \`term_id\`, \`is_included\`) VALUES\n${values.join(',\n')};`);
    }
    lines.push('');
  }

  // 11. Insert Assessment Scores (batched in chunks of 250)
  if (snapshot.scores.length > 0) {
    lines.push('-- Dumping data for table `assessment_scores`');
    const chunkSize = 250;
    for (let i = 0; i < snapshot.scores.length; i += chunkSize) {
      const chunk = snapshot.scores.slice(i, i + chunkSize);
      const values = chunk.map(
        s => `(${escapeSqlValue(s.id)}, ${escapeSqlValue(s.enrollmentId)}, ${escapeSqlValue(s.studentId)}, ${escapeSqlValue(s.subjectId)}, ${escapeSqlValue(s.componentId)}, ${escapeSqlValue(s.score)}, ${escapeSqlValue(s.updatedBy)}, ${escapeSqlValue(s.updatedAt)})`
      );
      lines.push(`REPLACE INTO \`assessment_scores\` (\`id\`, \`enrollment_id\`, \`student_id\`, \`subject_id\`, \`component_id\`, \`score\`, \`updated_by\`, \`updated_at\`) VALUES\n${values.join(',\n')};`);
    }
    lines.push('');
  }

  // 12. Insert Term Subject Records (batched in chunks of 250)
  if (snapshot.termSubjectRecords.length > 0) {
    lines.push('-- Dumping data for table `term_subject_records`');
    const chunkSize = 250;
    for (let i = 0; i < snapshot.termSubjectRecords.length; i += chunkSize) {
      const chunk = snapshot.termSubjectRecords.slice(i, i + chunkSize);
      const values = chunk.map(
        r => `(${escapeSqlValue(r.id)}, ${escapeSqlValue(r.studentId)}, ${escapeSqlValue(r.subjectId)}, ${escapeSqlValue(r.termId)}, ${escapeSqlValue(r.ca1Score)}, ${escapeSqlValue(r.ca2Score)}, ${escapeSqlValue(r.ca1RawScore ?? null)}, ${escapeSqlValue(r.ca2RawScore ?? null)}, ${escapeSqlValue(r.examScore)}, ${escapeSqlValue(r.totalScore)}, ${escapeSqlValue(r.grade)}, ${escapeSqlValue(r.ca1Details ? JSON.stringify(r.ca1Details) : null)}, ${escapeSqlValue(r.ca2Details ? JSON.stringify(r.ca2Details) : null)})`
      );
      lines.push(`REPLACE INTO \`term_subject_records\` (\`id\`, \`student_id\`, \`subject_id\`, \`term_id\`, \`ca1_score\`, \`ca2_score\`, \`ca1_raw_score\`, \`ca2_raw_score\`, \`exam_score\`, \`total_score\`, \`grade\`, \`ca1_details_json\`, \`ca2_details_json\`) VALUES\n${values.join(',\n')};`);
    }
    lines.push('');
  }

  // 13. Insert Student Term Summaries
  if (snapshot.termSummaries.length > 0) {
    lines.push('-- Dumping data for table `student_term_summaries`');
    const values = snapshot.termSummaries.map(
      s => `(${escapeSqlValue(s.id)}, ${escapeSqlValue(s.studentId)}, ${escapeSqlValue(s.sectionId)}, ${escapeSqlValue(s.termId)}, ${escapeSqlValue(s.totalScoreObtained)}, ${escapeSqlValue(s.totalPossibleScore)}, ${escapeSqlValue(s.cumulativePercentage)}, ${escapeSqlValue(s.cumulativeGrade)}, ${escapeSqlValue(s.classRank)}, ${escapeSqlValue(s.totalStudentsInSection)}, ${escapeSqlValue(s.principalRemark)}, ${escapeSqlValue(s.teacherRemark)}, ${escapeSqlValue(s.isPublished)}, ${escapeSqlValue(s.updatedAt)})`
    );
    lines.push(`REPLACE INTO \`student_term_summaries\` (\`id\`, \`student_id\`, \`section_id\`, \`term_id\`, \`total_score_obtained\`, \`total_possible_score\`, \`cumulative_percentage\`, \`cumulative_grade\`, \`class_rank\`, \`total_students_in_section\`, \`principal_remark\`, \`teacher_remark\`, \`is_published\`, \`updated_at\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 14. Insert Custom Report Templates
  if (snapshot.customReportTemplates && snapshot.customReportTemplates.length > 0) {
    lines.push('-- Dumping data for table `custom_report_templates`');
    const values = snapshot.customReportTemplates.map(
      tpl =>
        `(${escapeSqlValue(tpl.id)}, ${escapeSqlValue(tpl.sectionId)}, ${escapeSqlValue(JSON.stringify(tpl.sectionIds || [tpl.sectionId]))}, ${escapeSqlValue(tpl.title)}, ${escapeSqlValue(tpl.subtitle)}, ${escapeSqlValue(tpl.reportMode)}, ${escapeSqlValue(Boolean(tpl.enabledInReportTab))}, ${escapeSqlValue(tpl.colorBarTheme || 'emerald')}, ${escapeSqlValue(JSON.stringify(tpl.columns))}, ${escapeSqlValue(JSON.stringify(tpl.selectedSubjectIds))}, ${escapeSqlValue(tpl.customSubjectScores ? JSON.stringify(tpl.customSubjectScores) : null)}, ${escapeSqlValue(tpl.studentCustomScores ? JSON.stringify(tpl.studentCustomScores) : null)}, ${escapeSqlValue(tpl.updatedAt)})`
    );
    lines.push(
      `REPLACE INTO \`custom_report_templates\` (\`id\`, \`section_id\`, \`section_ids_json\`, \`title\`, \`subtitle\`, \`report_mode\`, \`enabled_in_report_tab\`, \`color_bar_theme\`, \`columns_json\`, \`selected_subject_ids_json\`, \`custom_subject_scores_json\`, \`student_custom_scores_json\`, \`updated_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 15. Insert Comment Bank
  if (snapshot.commentBank.length > 0) {
    lines.push('-- Dumping data for table `comment_bank`');
    const values = snapshot.commentBank.map(
      c => `(${escapeSqlValue(c.id)}, ${escapeSqlValue(c.grade)}, ${escapeSqlValue(c.remarkType)}, ${escapeSqlValue(c.commentText)})`
    );
    lines.push(`REPLACE INTO \`comment_bank\` (\`id\`, \`grade\`, \`remark_type\`, \`comment_text\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 16. Insert Audit Logs
  if (snapshot.auditLogs.length > 0) {
    lines.push('-- Dumping data for table `score_audit_logs`');
    const values = snapshot.auditLogs.map(
      a => `(${escapeSqlValue(a.id)}, ${escapeSqlValue(a.studentName)}, ${escapeSqlValue(a.subjectName)}, ${escapeSqlValue(a.componentName)}, ${escapeSqlValue(a.previousScore)}, ${escapeSqlValue(a.newScore)}, ${escapeSqlValue(a.changedBy)}, ${escapeSqlValue(a.changedByRole)}, ${escapeSqlValue(a.changeReason)}, ${escapeSqlValue(a.createdAt)})`
    );
    lines.push(`REPLACE INTO \`score_audit_logs\` (\`id\`, \`student_name\`, \`subject_name\`, \`component_name\`, \`previous_score\`, \`new_score\`, \`changed_by\`, \`changed_by_role\`, \`change_reason\`, \`created_at\`) VALUES\n${values.join(',\n')};`);
    lines.push('');
  }

  // 17. Insert Academic Session Archives
  if (snapshot.sessionArchives && snapshot.sessionArchives.length > 0) {
    lines.push('-- Dumping data for table `academic_session_archives`');
    const values = snapshot.sessionArchives.map(
      arc =>
        `(${escapeSqlValue(arc.sessionId)}, ${escapeSqlValue(arc.sessionName)}, ${escapeSqlValue(arc.institutionName)}, ${escapeSqlValue(arc.schoolMotto || null)}, ${escapeSqlValue(arc.principalName || null)}, ${escapeSqlValue(JSON.stringify(arc))}, ${escapeSqlValue(arc.updatedAt)})`
    );
    lines.push(
      `REPLACE INTO \`academic_session_archives\` (\`session_id\`, \`session_name\`, \`institution_name\`, \`school_motto\`, \`principal_name\`, \`archive_json\`, \`updated_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 18. Insert Student Promotions & Transfers Log
  if (snapshot.promotionLogs && snapshot.promotionLogs.length > 0) {
    lines.push('-- Dumping data for table `student_promotions_log`');
    const values = snapshot.promotionLogs.map(
      p =>
        `(${escapeSqlValue(p.id)}, ${escapeSqlValue(p.studentId)}, ${escapeSqlValue(p.studentName)}, ${escapeSqlValue(p.admissionNumber)}, ${escapeSqlValue(p.fromSessionId)}, ${escapeSqlValue(p.fromSessionName)}, ${escapeSqlValue(p.toSessionId)}, ${escapeSqlValue(p.toSessionName)}, ${escapeSqlValue(p.fromSectionId)}, ${escapeSqlValue(p.fromSectionName)}, ${escapeSqlValue(p.toSectionId)}, ${escapeSqlValue(p.toSectionName)}, ${escapeSqlValue(p.toFormTutorName)}, ${escapeSqlValue(p.firstTermPct)}, ${escapeSqlValue(p.secondTermPct)}, ${escapeSqlValue(p.thirdTermPct)}, ${escapeSqlValue(p.cumulativeAvgPct)}, ${escapeSqlValue(p.finalGrade)}, ${escapeSqlValue(p.decision)}, ${escapeSqlValue(p.createdAt)})`
    );
    lines.push(
      `REPLACE INTO \`student_promotions_log\` (\`id\`, \`student_id\`, \`student_name\`, \`admission_number\`, \`from_session_id\`, \`from_session_name\`, \`to_session_id\`, \`to_session_name\`, \`from_section_id\`, \`from_section_name\`, \`to_section_id\`, \`to_section_name\`, \`to_form_tutor_name\`, \`first_term_pct\`, \`second_term_pct\`, \`third_term_pct\`, \`cumulative_avg_pct\`, \`final_grade\`, \`decision\`, \`created_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 19. Insert Office Messages
  if (snapshot.officeMessages && snapshot.officeMessages.length > 0) {
    lines.push('-- Dumping data for table `office_messages`');
    const values = snapshot.officeMessages.map(
      m =>
        `(${escapeSqlValue(m.id)}, ${escapeSqlValue(m.senderName)}, ${escapeSqlValue(m.senderRole)}, ${escapeSqlValue(String(m.recipientTeacherId))}, ${escapeSqlValue(m.recipientTeacherName || null)}, ${escapeSqlValue(m.title || m.subject || '')}, ${escapeSqlValue(m.body)}, ${escapeSqlValue(JSON.stringify(m.readByTeacherIds || []))}, ${escapeSqlValue(m.createdAt)})`
    );
    lines.push(
      `REPLACE INTO \`office_messages\` (\`id\`, \`sender_name\`, \`sender_role\`, \`recipient_teacher_id\`, \`recipient_teacher_name\`, \`title\`, \`body\`, \`read_by_teacher_ids_json\`, \`created_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 20. Insert Required Document Slots
  if (snapshot.requiredDocumentSlots && snapshot.requiredDocumentSlots.length > 0) {
    lines.push('-- Dumping data for table `required_document_slots`');
    const values = snapshot.requiredDocumentSlots.map(
      slot =>
        `(${escapeSqlValue(slot.id)}, ${escapeSqlValue(slot.name)}, ${escapeSqlValue(slot.category)}, ${escapeSqlValue(slot.description || null)}, ${escapeSqlValue(slot.createdByRole)}, ${escapeSqlValue(slot.createdByName || slot.createdBy || 'System')}, ${escapeSqlValue(slot.createdAt)})`
    );
    lines.push(
      `REPLACE INTO \`required_document_slots\` (\`id\`, \`name\`, \`category\`, \`description\`, \`created_by_role\`, \`created_by_name\`, \`created_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 21. Insert Teacher Document Uploads (14-Week Timeline + HOD Review Metadata)
  if (snapshot.teacherDocumentUploads && snapshot.teacherDocumentUploads.length > 0) {
    lines.push('-- Dumping data for table `teacher_document_uploads`');
    const values = snapshot.teacherDocumentUploads.map(
      doc =>
        `(${escapeSqlValue(doc.id)}, ${escapeSqlValue(doc.teacherId)}, ${escapeSqlValue(doc.teacherName)}, ${escapeSqlValue(doc.sectionId)}, ${escapeSqlValue(doc.sectionName)}, ${escapeSqlValue(doc.subjectId)}, ${escapeSqlValue(doc.subjectName)}, ${escapeSqlValue(doc.departmentId || null)}, ${escapeSqlValue(doc.departmentName || null)}, ${escapeSqlValue(doc.termId || 1)}, ${escapeSqlValue(doc.termName)}, ${escapeSqlValue(doc.weekNumber)}, ${escapeSqlValue(doc.documentSlotId || doc.slotId || 'slot-general')}, ${escapeSqlValue(doc.documentTitle)}, ${escapeSqlValue(doc.documentCategory || doc.category)}, ${escapeSqlValue(doc.fileName)}, ${escapeSqlValue(doc.fileType || doc.fileExtension)}, ${escapeSqlValue(doc.fileSizeKb)}, ${escapeSqlValue(doc.fileStoragePath || null)}, ${escapeSqlValue(doc.status)}, ${escapeSqlValue(doc.hodReviewStatus || 'PENDING_HOD')}, ${escapeSqlValue(doc.hodReviewedBy || null)}, ${escapeSqlValue(doc.hodReviewedAt || null)}, ${escapeSqlValue(JSON.stringify(doc.executiveRemarks || []))}, ${escapeSqlValue(doc.uploadedAt)})`
    );
    lines.push(
      `REPLACE INTO \`teacher_document_uploads\` (\`id\`, \`teacher_id\`, \`teacher_name\`, \`section_id\`, \`section_name\`, \`subject_id\`, \`subject_name\`, \`department_id\`, \`department_name\`, \`term_id\`, \`term_name\`, \`week_number\`, \`document_slot_id\`, \`document_title\`, \`document_category\`, \`file_name\`, \`file_type\`, \`file_size_kb\`, \`file_storage_path\`, \`status\`, \`hod_review_status\`, \`hod_reviewed_by\`, \`hod_reviewed_at\`, \`executive_remarks_json\`, \`uploaded_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 22. Insert Academic Departments & Heads of Department (HODs)
  if (snapshot.academicDepartments && snapshot.academicDepartments.length > 0) {
    lines.push('-- Dumping data for table `academic_departments`');
    const values = snapshot.academicDepartments.map(
      d =>
        `(${escapeSqlValue(d.id)}, ${escapeSqlValue(d.name)}, ${escapeSqlValue(d.code)}, ${escapeSqlValue(d.hodTeacherId)}, ${escapeSqlValue(d.hodTeacherName)}, ${escapeSqlValue(d.hodUsername || null)}, ${escapeSqlValue(JSON.stringify(d.subjectIds || []))}, ${escapeSqlValue(d.description || null)}, ${escapeSqlValue(d.createdByRole)}, ${escapeSqlValue(d.createdByName)}, ${escapeSqlValue(d.createdAt)})`
    );
    lines.push(
      `REPLACE INTO \`academic_departments\` (\`id\`, \`name\`, \`code\`, \`hod_teacher_id\`, \`hod_teacher_name\`, \`hod_username\`, \`subject_ids_json\`, \`description\`, \`created_by_role\`, \`created_by_name\`, \`created_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 23. Insert Grading Scale Presets (Junior, Senior & Custom Report Templates)
  if (snapshot.gradingScalePresets && snapshot.gradingScalePresets.length > 0) {
    lines.push('-- Dumping data for table `grading_scale_presets`');
    const values = snapshot.gradingScalePresets.map(
      p =>
        `(${escapeSqlValue(p.id)}, ${escapeSqlValue(p.name)}, ${escapeSqlValue(p.targetScope)}, ${escapeSqlValue(p.customTemplateId || 'ALL')}, ${escapeSqlValue(Boolean(p.isDefault))}, ${escapeSqlValue(Boolean(p.isEnabledForReports))}, ${escapeSqlValue(JSON.stringify(p.bands || []))}, ${escapeSqlValue(p.updatedAt)})`
    );
    lines.push(
      `REPLACE INTO \`grading_scale_presets\` (\`id\`, \`name\`, \`target_scope\`, \`custom_template_id\`, \`is_default\`, \`is_enabled_for_reports\`, \`bands_json\`, \`updated_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  // 24. Insert Student Testimonials (Graduated Year 12 Sealed Records)
  if (snapshot.studentTestimonials && snapshot.studentTestimonials.length > 0) {
    lines.push('-- Dumping data for table `student_testimonials`');
    const values = snapshot.studentTestimonials.map(
      t =>
        `(${escapeSqlValue(t.id)}, ${escapeSqlValue(t.studentId)}, ${escapeSqlValue(t.studentName)}, ${escapeSqlValue(t.examOrAdmissionNo || t.examNumber)}, ${escapeSqlValue(t.schoolName)}, ${escapeSqlValue(t.schoolAddress)}, ${escapeSqlValue(t.entryYear || t.fromYear)}, ${escapeSqlValue(t.graduationYear || t.toYear)}, ${escapeSqlValue(t.enteredInClass || t.enteredClass)}, ${escapeSqlValue(t.leftInClass || t.leftClass)}, ${escapeSqlValue(JSON.stringify(t.subjectsStudied || []))}, ${escapeSqlValue(t.academicAbility)}, ${escapeSqlValue(t.coCurricularActivities)}, ${escapeSqlValue(t.postOfResponsibilityHeld || t.postOfResponsibility)}, ${escapeSqlValue(t.remarksOnAttitude)}, ${escapeSqlValue(t.generalRemarks)}, ${escapeSqlValue(t.principalName)}, ${escapeSqlValue(t.issueDate)}, ${escapeSqlValue(t.sessionName || t.graduatedSessionName)}, ${escapeSqlValue(t.cumulativeAvgPct || 0)}, ${escapeSqlValue(t.finalGrade || 'C')}, ${escapeSqlValue(t.recordSignature)}, ${escapeSqlValue(t.isSealed ?? true)}, ${escapeSqlValue(t.createdAt || new Date().toISOString())})`
    );
    lines.push(
      `REPLACE INTO \`student_testimonials\` (\`id\`, \`student_id\`, \`student_name\`, \`exam_or_admission_no\`, \`school_name\`, \`school_address\`, \`entry_year\`, \`graduation_year\`, \`entered_in_class\`, \`left_in_class\`, \`subjects_studied_json\`, \`academic_ability\`, \`co_curricular_activities\`, \`post_of_responsibility_held\`, \`remarks_on_attitude\`, \`general_remarks\`, \`principal_name\`, \`issue_date\`, \`session_name\`, \`cumulative_avg_pct\`, \`final_grade\`, \`record_signature\`, \`is_sealed\`, \`created_at\`) VALUES\n${values.join(',\n')};`
    );
    lines.push('');
  }

  lines.push('COMMIT;');
  return lines.join('\n');
}
