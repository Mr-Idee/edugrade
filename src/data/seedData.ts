/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  AcademicSession,
  Term,
  ClassLevel,
  ClassSection,
  User,
  Student,
  Subject,
  AssessmentComponent,
  ScoreAuditLog,
  CommentBankItem,
  OldSheetData
} from "../types/index";

export const initialSessions: AcademicSession[] = [
  { id: 1, name: "2026/27", isCurrent: true, createdAt: "2026-09-01T00:00:00Z" }
];

export const initialTerms: Term[] = [
  { id: 1, sessionId: 1, name: "FIRST", isActive: true, startDate: "2026-09-08", endDate: "2026-12-18" },
  { id: 2, sessionId: 1, name: "SECOND", isActive: false, startDate: "2027-01-11", endDate: "2027-04-09" },
  { id: 3, sessionId: 1, name: "THIRD", isActive: false, startDate: "2027-04-26", endDate: "2027-07-23" }
];

export const initialClassLevels: ClassLevel[] = [
  { id: 1, name: "Year 7", levelType: "JUNIOR", maxCaTotal: 40.0 },
  { id: 2, name: "Year 8", levelType: "JUNIOR", maxCaTotal: 40.0 },
  { id: 3, name: "Year 9", levelType: "JUNIOR", maxCaTotal: 40.0 },
  { id: 4, name: "Year 10", levelType: "SENIOR", maxCaTotal: 30.0 },
  { id: 5, name: "Year 11", levelType: "SENIOR", maxCaTotal: 30.0 },
  { id: 6, name: "Year 12", levelType: "SENIOR", maxCaTotal: 30.0 }
];

export const initialAssessmentComponents: AssessmentComponent[] = [
  // Senior Secondary -> Total CA: 30.0
  { id: 1, termId: 1, levelType: "SENIOR", name: "Quiz", shortCode: "QZ", maxScore: 3.0, weightOrder: 1 },
  { id: 2, termId: 1, levelType: "SENIOR", name: "Classwork", shortCode: "CW", maxScore: 2.0, weightOrder: 2 },
  { id: 3, termId: 1, levelType: "SENIOR", name: "Assignment", shortCode: "ASS", maxScore: 5.0, weightOrder: 3 },
  { id: 4, termId: 1, levelType: "SENIOR", name: "Test", shortCode: "TEST", maxScore: 20.0, weightOrder: 4 },

  // Junior Secondary (Matches PDF exactly: QZ 5, CW 5, ASS 5, PJ 5, TEST 20 = 40.0)
  { id: 5, termId: 1, levelType: "JUNIOR", name: "Quiz", shortCode: "QZ", maxScore: 5.0, weightOrder: 1 },
  { id: 6, termId: 1, levelType: "JUNIOR", name: "Classwork", shortCode: "CW", maxScore: 5.0, weightOrder: 2 },
  { id: 7, termId: 1, levelType: "JUNIOR", name: "Assignment", shortCode: "ASS", maxScore: 5.0, weightOrder: 3 },
  { id: 8, termId: 1, levelType: "JUNIOR", name: "Project", shortCode: "PJ", maxScore: 5.0, weightOrder: 4 },
  { id: 9, termId: 1, levelType: "JUNIOR", name: "Test", shortCode: "TEST", maxScore: 20.0, weightOrder: 5 }
];

export const initialUsers: User[] = [
  { id: 1, fullName: "Administrator", username: "superadmin", email: "admin@example.invalid", role: "SUPER_ADMIN", isActive: true, mustSetPassword: true, hasPasswordSet: false },
  { id: 2, fullName: "Principal", username: "principal", email: "principal@example.invalid", role: "PRINCIPAL", isActive: true, hasPasswordSet: false, mustSetPassword: true },
  { id: 3, fullName: "Vice Principal", username: "vice.principal", email: "viceprincipal@example.invalid", role: "VICE_PRINCIPAL", isActive: true, hasPasswordSet: false, mustSetPassword: true },
  { id: 4, fullName: "Class Teacher 1", username: "class.teacher.1", email: "teacher1@example.invalid", role: "CLASS_TEACHER", isActive: true, assignedSectionId: 7, hasPasswordSet: false, mustSetPassword: true },
  { id: 5, fullName: "Class Teacher 2", username: "class.teacher.2", email: "teacher2@example.invalid", role: "CLASS_TEACHER", isActive: true, assignedSectionId: 1, hasPasswordSet: false, mustSetPassword: true },
  { id: 6, fullName: "Class Teacher 3", username: "class.teacher.3", email: "teacher3@example.invalid", role: "CLASS_TEACHER", isActive: true, assignedSectionId: 10, hasPasswordSet: false, mustSetPassword: true },
  { id: 7, fullName: "Class Teacher 4", username: "class.teacher.4", email: "teacher4@example.invalid", role: "CLASS_TEACHER", isActive: true, assignedSectionId: 11, hasPasswordSet: false, mustSetPassword: true },
  { id: 8, fullName: "Subject Teacher 1", username: "subject.teacher.1", email: "subject1@example.invalid", role: "SUBJECT_TEACHER", isActive: true, assignedSubjectIds: [2, 7], hasPasswordSet: false, mustSetPassword: true },
  { id: 10, fullName: "Head of Schools", username: "head.of.schools", email: "head@example.invalid", role: "HEAD_OF_SCHOOLS", isActive: true, hasPasswordSet: false, mustSetPassword: true },
  { id: 9, fullName: "Subject Teacher 2", username: "subject.teacher.2", email: "subject2@example.invalid", role: "SUBJECT_TEACHER", isActive: true, assignedSubjectIds: [1, 19], hasPasswordSet: false, mustSetPassword: true }
];

export const initialCommentBank: CommentBankItem[] = [
  // PRINCIPAL REMARKS
  { id: 1, grade: "A", remarkType: "PRINCIPAL", commentText: "Exceptional academic performance! Demonstrated intellectual rigor and mastery across curriculum subjects." },
  { id: 2, grade: "A", remarkType: "PRINCIPAL", commentText: "Outstanding achievement of the highest distinction. Keep sustaining this brilliant standard." },
  { id: 3, grade: "B1", remarkType: "PRINCIPAL", commentText: "Very commendable performance! Consistently produces high-quality academic output with admirable poise." },
  { id: 4, grade: "B2", remarkType: "PRINCIPAL", commentText: "Strong academic showing. Minor attention to detail will elevate this performance to distinction grade." },
  { id: 5, grade: "B", remarkType: "PRINCIPAL", commentText: "Very good result. Shows admirable determination and mastery of subject competencies." },
  { id: 6, grade: "C4", remarkType: "PRINCIPAL", commentText: "Good and steady progress shown. With targeted revision in analytical topics, excellence is assured." },
  { id: 7, grade: "C5", remarkType: "PRINCIPAL", commentText: "Capable student showing steady progress. Extra revision in key areas is recommended." },
  { id: 8, grade: "C6", remarkType: "PRINCIPAL", commentText: "Satisfactory work. With more focus and diligence, higher grades are easily within reach." },
  { id: 9, grade: "C", remarkType: "PRINCIPAL", commentText: "Satisfactory work. With more focus, higher grades are within reach." },
  { id: 10, grade: "D", remarkType: "PRINCIPAL", commentText: "Fair effort shown, but greater dedication is needed to improve." },
  { id: 11, grade: "E", remarkType: "PRINCIPAL", commentText: "Fair effort shown, but greater dedication is needed to improve." },
  { id: 12, grade: "F", remarkType: "PRINCIPAL", commentText: "A Poor performance, you need to put in more effort." },
  { id: 13, grade: "F", remarkType: "PRINCIPAL", commentText: "Failed! A Poor performance, you need to put in more effort." },

  // CLASS TEACHER REMARKS
  { id: 14, grade: "A", remarkType: "TEACHER", commentText: "An exemplary student with remarkable work ethic and natural curiosity. A true pleasure to teach." },
  { id: 15, grade: "B1", remarkType: "TEACHER", commentText: "Consistently submits diligent classwork and actively contributes during discussions. Very commendable." },
  { id: 16, grade: "B2", remarkType: "TEACHER", commentText: "Very good academic engagement. Regular practice in problem-solving will guarantee top honors." },
  { id: 17, grade: "B", remarkType: "TEACHER", commentText: "A hard-working student with great potential. Keep up the enthusiasm in class." },
  { id: 18, grade: "C4", remarkType: "TEACHER", commentText: "Good understanding of core subject concepts. Needs to cultivate tighter time management during tests." },
  { id: 19, grade: "C5", remarkType: "TEACHER", commentText: "Steady effort shown. Needs to participate more actively and consult teacher for clarification." },
  { id: 20, grade: "C6", remarkType: "TEACHER", commentText: "Demonstrates adequate capability but is occasionally distracted. More homework diligence required." },
  { id: 21, grade: "C", remarkType: "TEACHER", commentText: "Solid effort throughout the term. Reviewing past questions will yield higher scores." },
  { id: 22, grade: "D", remarkType: "TEACHER", commentText: "Passable effort, but attendance to remedial tutorials and homework completion must improve." },
  { id: 23, grade: "E", remarkType: "TEACHER", commentText: "Struggling in fundamental topics. Daily structured study and parental supervision strongly recommended." },
  { id: 24, grade: "F", remarkType: "TEACHER", commentText: "Unsatisfactory term results. Urgent intervention and parent-teacher conference required." }
];

export const initialSubjects: Subject[] = [
  { "id": 1, "name": "ENGLISH LANGUAGE", "code": "ENGL", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 2, "name": "MATHEMATICS", "code": "MATH", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 3, "name": "ECONOMICS", "code": "ECON", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 4, "name": "BIOLOGY", "code": "BIOL", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 5, "name": "DIGITAL TECHNOLOGY", "code": "DIGI", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 6, "name": "CITIZENSHIP AND HERITAGE STUDIES", "code": "CITI", "category": "CORE", "applicableLevel": "SENIOR" },
  { "id": 7, "name": "CATERING CRAFT", "code": "CATE", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 8, "name": "FURTHER MATHEMATICS", "code": "FURT", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 9, "name": "VISUAL ART", "code": "VISU", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 10, "name": "CHEMISTRY", "code": "CHEM", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 11, "name": "ACCOUNTING", "code": "ACCO", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 12, "name": "LITERATURE", "code": "LITE", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 13, "name": "PHYSICS", "code": "PHYS", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 14, "name": "GOVERNMENT", "code": "GOVE", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 15, "name": "GEOGRAPHY", "code": "GEOG", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 16, "name": "C.R.S", "code": "CR", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 17, "name": "I.R.S", "code": "IR", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 18, "name": "FOOD & NUTRITION", "code": "FOOD", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 19, "name": "TECHNICAL DRAWING", "code": "TECH", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 20, "name": "COMMERCE", "code": "COMM", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 21, "name": "HISTORY", "code": "HIST", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 22, "name": "FDGM", "code": "FDGM", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 23, "name": "HORTICULTURE", "code": "HORT", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 24, "name": "COMP & GSM REPAIRS", "code": "COMP", "category": "OPTIONAL", "applicableLevel": "SENIOR" },
  { "id": 25, "name": "ENGLISH", "code": "ENGL", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 26, "name": "INTERMEDIATE SCIENCE", "code": "INTE", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 27, "name": "SOCIAL AND CITIZENSHIP STUDIES", "code": "SOCI", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 28, "name": "B/STUDIES", "code": "BST", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 29, "name": "B/TECH", "code": "BTE", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 30, "name": "FRENCH", "code": "FREN", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 31, "name": "DIGITAL TECHNOLOGIES", "code": "DIGI", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 32, "name": "NIGERIAN HISTORY", "code": "NIGE", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 33, "name": "PHE", "code": "PHE", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 34, "name": "CULTURAL AND CREATIVE ARTS", "code": "CULT", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 35, "name": "CRS/IRS", "code": "CRS", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 36, "name": "FASHION DESIGN AND GARMENT MAKING", "code": "FASH", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 37, "name": "HAUSA", "code": "HAUS", "category": "CORE", "applicableLevel": "JUNIOR" },
  { "id": 38, "name": "MUSIC", "code": "MUSI", "category": "CORE", "applicableLevel": "JUNIOR" }
];

export const initialClassSections: ClassSection[] = [
  { "id": 1, "classLevelId": 1, "name": "YEAR 7 DILIGENCE", "levelType": "JUNIOR", "classTeacherName": "Class Teacher 1" },
  { "id": 2, "classLevelId": 1, "name": "YEAR 7 EXCELLENCE", "levelType": "JUNIOR", "classTeacherName": "Class Teacher 2" },
  { "id": 3, "classLevelId": 1, "name": "YEAR 7 RESILIENCE", "levelType": "JUNIOR", "classTeacherName": "Class Teacher 3" },
  { "id": 4, "classLevelId": 2, "name": "YEAR 8 EXCELLENCE", "levelType": "JUNIOR", "classTeacherName": "Class Teacher 4" },
  { "id": 5, "classLevelId": 2, "name": "YEAR 8 RESILIENCE", "levelType": "JUNIOR", "classTeacherName": "Principal" },
  { "id": 6, "classLevelId": 3, "name": "YEAR 9", "levelType": "JUNIOR", "classTeacherName": "Vice Principal" },
  { "id": 7, "classLevelId": 4, "name": "YEAR 10 DILIGENCE", "levelType": "SENIOR", "classTeacherName": "Class Teacher 5" },
  { "id": 8, "classLevelId": 4, "name": "YEAR 10 EXCELLENCE", "levelType": "SENIOR", "classTeacherName": "Class Teacher 6" },
  { "id": 9, "classLevelId": 5, "name": "YEAR 11 DILIGENCE", "levelType": "SENIOR", "classTeacherName": "Class Teacher 7" },
  { "id": 10, "classLevelId": 5, "name": "YEAR 11 EXCELLENCE", "levelType": "SENIOR", "classTeacherName": "Class Teacher 8" },
  { "id": 11, "classLevelId": 6, "name": "YEAR 12", "levelType": "SENIOR", "classTeacherName": "Class Teacher 9" }
];

export const initialStudents: Student[] = [];

export const initialOldSheets: OldSheetData[] = [
  {
    "fileName": "YEAR_7_DILIGENCE_-_Mid_Term_Report__69ca19c4",
    "section": "YEAR 7 DILIGENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_7_EXCELLENCE_-_Mid_Term_Report__1c0479ca",
    "section": "YEAR 7 EXCELLENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_7_RESILIENCE_-_Mid_Term_Report__1a7ab93d",
    "section": "YEAR 7 RESILIENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_8_EXCELLENCE_-_Mid_Term_Report__4a26ec83",
    "section": "YEAR 8 EXCELLENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_8_RESILIENCE_-_Mid_Term_Report__8f13d49b",
    "section": "YEAR 8 RESILIENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_9_-_Mid_Term_Report__9c41e27a",
    "section": "YEAR 9",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "JUNIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_10_DILIGENCE_-_Mid_Term_Report__1a9a585f",
    "section": "YEAR 10 DILIGENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "SENIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_10_EXCELLENCE_-_Mid_Term_Report__2b8c691a",
    "section": "YEAR 10 EXCELLENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "SENIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_11_DILIGENCE_-_Mid_Term_Report__3c7d812b",
    "section": "YEAR 11 DILIGENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "SENIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_11_EXCELLENCE_-_Mid_Term_Report__1a9a585f",
    "section": "YEAR 11 EXCELLENCE",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "SENIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  },
  {
    "fileName": "YEAR_12_-_Mid_Term_Report__1a9a585f",
    "section": "YEAR 12",
    "term": "FIRST",
    "session": "2026/27",
    "levelType": "SENIOR",
    "activeStudent": "",
    "studentsCount": 0,
    "students": [],
    "coreSubjects": [],
    "optionalSubjects": [],
    "scores": [],
    "classAverageTotal": 0,
    "classAverageCum": 0,
    "principalRemark": ""
  }
];

export const initialScoreAuditLogs: ScoreAuditLog[] = [];
