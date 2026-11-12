/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StudentSubjectEnrollment,
  AssessmentScore,
  StudentTermSummary,
  TermSubjectRecord
} from '../types/index';
import {
  initialStudents,
  initialClassSections,
  initialSubjects,
  initialOldSheets
} from './seedData';

const sheetBySection = new Map<string, (typeof initialOldSheets)[0]>();
initialOldSheets.forEach(s => sheetBySection.set(s.section, s));

let enrollmentIdCounter = 1;
const generatedEnrollments: StudentSubjectEnrollment[] = [];

// Generate subject enrollments for all registered students across all 11 class sections.
// All student scores across all terms start empty (brand-new clean database ready for publishing & Bulk CSV upload).
initialClassSections.forEach(section => {
  const isSenior = section.levelType === 'SENIOR';
  const sheet = sheetBySection.get(section.name);
  const sectionStudents = initialStudents.filter(st => st.currentSectionId === section.id);

  const sectionSubjects = initialSubjects.filter(sub => {
    if (isSenior) {
      return sub.applicableLevel === 'SENIOR' || sub.applicableLevel === 'BOTH';
    } else {
      return sub.applicableLevel === 'JUNIOR' || sub.applicableLevel === 'BOTH';
    }
  });

  sectionStudents.forEach((student, studentIndex) => {
    const isActiveStudent = sheet !== undefined && sheet.activeStudent === student.fullName;

    sectionSubjects.forEach(subject => {
      let isIncluded = true;

      if (isSenior) {
        if (subject.category === 'CORE') {
          isIncluded = true;
        } else {
          if (isActiveStudent && sheet) {
            const sheetScore = sheet.scores.find(
              sc => sc.subject.toLowerCase() === subject.name.toLowerCase()
            );
            isIncluded = sheetScore ? sheetScore.included : false;
          } else {
            const studentElectives = [
              (studentIndex % 8) + 7,
              ((studentIndex + 2) % 8) + 7,
              ((studentIndex + 4) % 8) + 7,
              ((studentIndex + 6) % 8) + 7
            ];
            isIncluded = studentElectives.includes(subject.id);
          }
        }
      } else {
        // For Junior students, ALL subjects are Core subjects
        isIncluded = true;
      }

      generatedEnrollments.push({
        id: enrollmentIdCounter++,
        studentId: student.id,
        sectionId: section.id,
        subjectId: subject.id,
        termId: 1,
        isIncluded
      });
    });
  });
});

export const initialEnrollments: StudentSubjectEnrollment[] = generatedEnrollments;

// Brand-new clean state: no pre-entered student scores in any term
export const initialAssessmentScores: AssessmentScore[] = [];
export const initialTermSummaries: StudentTermSummary[] = [];
export const initialTermSubjectRecords: TermSubjectRecord[] = [];
