/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { jsPDF } from 'jspdf';
import { ClassSection, ScoreAuditLog } from '../types/index';
import { StudentCompletenessAuditRow, formatRankOrdinal } from './academicCalculations';
import { buildSubjectScoresPdfTable, SubjectScorePdfRow } from './subjectScoresPdf';

export interface MasterDirectoryClass {
  section: ClassSection;
  formTutor: string;
  students: Array<{ fullName: string; admissionNumber: string; gender: string }>;
  subjects: Array<{
    name: string;
    code: string;
    category: string;
    teachers: string[];
  }>;
}

export interface MasterDirectoryTeacher {
  fullName: string;
  staffId: string;
  subjects: string[];
}

export interface MasterDirectoriesPdfParams {
  schoolName: string;
  sessionName: string;
  classes: MasterDirectoryClass[];
  teachers: MasterDirectoryTeacher[];
}

/**
 * Draws the standard dashboard-styled header banner and KPI summary boxes on a jsPDF page
 */
function drawDashboardHeader(
  doc: jsPDF,
  params: {
    schoolName: string;
    title: string;
    subtitle: string;
    rightBadge: string;
    kpis: Array<{ label: string; value: string; subtext: string; accentRgb: [number, number, number] }>;
  }
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 12;

  // Top Navy/Indigo Header Banner (matching dashboard top bar)
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, 10, pageWidth - margin * 2, 24, 3, 3, 'F');

  // School Name
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(params.schoolName.toUpperCase(), margin + 5, 18);

  // Report Title
  doc.setTextColor(165, 180, 252); // indigo-300
  doc.setFontSize(9.5);
  doc.text(params.title, margin + 5, 24);

  // Subtitle
  doc.setTextColor(148, 163, 184); // slate-400
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text(params.subtitle, margin + 5, 29.5);

  // Right Badge
  doc.setFillColor(79, 70, 229); // indigo-600
  const badgeWidth = Math.max(38, doc.getTextWidth(params.rightBadge) + 8);
  doc.roundedRect(pageWidth - margin - badgeWidth - 4, 15, badgeWidth, 8, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text(params.rightBadge, pageWidth - margin - 4 - badgeWidth / 2, 20.2, { align: 'center' });

  // KPI Cards Row (4 cards matching dashboard KPI grid)
  let currentY = 38;
  if (params.kpis.length > 0) {
    const gap = 3;
    const totalW = pageWidth - margin * 2;
    const cardW = (totalW - gap * (params.kpis.length - 1)) / params.kpis.length;
    const cardH = 18;

    params.kpis.forEach((kpi, idx) => {
      const x = margin + idx * (cardW + gap);
      // Card background & border
      doc.setFillColor(248, 250, 252); // slate-50
      doc.setDrawColor(226, 232, 240); // slate-200
      doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'FD');

      // Left accent bar
      doc.setFillColor(kpi.accentRgb[0], kpi.accentRgb[1], kpi.accentRgb[2]);
      doc.rect(x, currentY + 2, 1.5, cardH - 4, 'F');

      // Label
      doc.setTextColor(100, 116, 139); // slate-500
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(kpi.label.toUpperCase(), x + 4, currentY + 5.5);

      // Value
      doc.setTextColor(15, 23, 42); // slate-900
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.text(kpi.value, x + 4, currentY + 11.8);

      // Subtext
      doc.setTextColor(100, 116, 139);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.text(kpi.subtext, x + 4, currentY + 15.8);
    });

    currentY += cardH + 6;
  }

  return currentY;
}

export function createSubjectScoresPdf(params: {
  schoolName: string;
  sectionName: string;
  sessionName: string;
  termName: string;
  subjectName: string;
  components: string[];
  rows: SubjectScorePdfRow[];
}): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const tableWidth = pageWidth - margin * 2;
  const table = buildSubjectScoresPdfTable(params);
  const columnWidths = [
    8,
    24,
    48,
    ...params.components.map(() => 0),
    16,
    13,
    13,
    14,
    19,
    12
  ];
  const remainingWidth = tableWidth - columnWidths.reduce((sum, width) => sum + width, 0);
  if (params.components.length > 0) {
    const componentWidth = remainingWidth / params.components.length;
    for (let index = 3; index < 3 + params.components.length; index += 1) {
      columnWidths[index] = componentWidth;
    }
  } else {
    columnWidths[2] += remainingWidth;
  }
  const tableHeaders = table.headers;
  const bottom = pageHeight - 10;
  let pageNumber = 0;

  const drawTableHeader = (y: number): number => {
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, tableWidth, 10, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(255, 255, 255);

    let x = margin;
    tableHeaders.forEach((header, index) => {
      const lines = doc.splitTextToSize(header, Math.max(5, columnWidths[index] - 3));
      doc.text(lines, x + columnWidths[index] / 2, y + (lines.length > 1 ? 3.8 : 6.2), {
        align: 'center'
      });
      x += columnWidths[index];
    });
    return y + 10;
  };

  const startPage = (): number => {
    if (pageNumber > 0) doc.addPage();
    pageNumber += 1;
    const headerY = drawDashboardHeader(doc, {
      schoolName: params.schoolName,
      title: `${params.sectionName} - ${params.subjectName} SCORES`,
      subtitle: `Session: ${params.sessionName} | Term: ${params.termName} TERM`,
      rightBadge: params.termName.toUpperCase(),
      kpis: [
        {
          label: 'Students in Class',
          value: String(params.rows.length),
          subtext: 'Full class roster',
          accentRgb: [16, 185, 129]
        },
        {
          label: 'CA Components',
          value: String(params.components.length),
          subtext: 'Individual assessment scores',
          accentRgb: [79, 70, 229]
        }
      ]
    });
    return drawTableHeader(headerY + 1);
  };

  let y = startPage();
  table.rows.forEach((row, rowIndex) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const cells = row.map((value, index) =>
      doc.splitTextToSize(value || '-', Math.max(5, columnWidths[index] - 3))
    );
    const rowHeight = Math.max(8, ...cells.map(lines => lines.length * 3.4 + 3));
    if (y + rowHeight > bottom) y = startPage();

    if (rowIndex % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y, tableWidth, rowHeight, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
    doc.setTextColor(51, 65, 85);

    let x = margin;
    cells.forEach((lines, index) => {
      const centered = index === 0 || (index >= 3 && index !== 2);
      doc.text(lines, centered ? x + columnWidths[index] / 2 : x + 1.5, y + 4.5, {
        align: centered ? 'center' : 'left'
      });
      x += columnWidths[index];
    });
    y += rowHeight;
  });

  doc.setProperties({
    title: `${params.sectionName} - ${params.subjectName} Scores`,
    subject: `${params.termName} Term ${params.sessionName}`
  });
  return doc;
}

export function downloadSubjectScoresPdf(params: Parameters<typeof createSubjectScoresPdf>[0]): void {
  const doc = createSubjectScoresPdf(params);
  const filename = `${params.sectionName}_${params.subjectName}_${params.termName}_${params.sessionName}`
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .trim()
    .replace(/\s+/g, '_');
  doc.save(`${filename}_Student_Scores.pdf`);
}

export function createMasterDirectoriesPdf(params: MasterDirectoriesPdfParams): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;
  const bottom = pageHeight - margin;
  let pageCount = 0;

  const startPage = (title: string, badge: string) => {
    if (pageCount > 0) doc.addPage();
    pageCount += 1;
    return drawDashboardHeader(doc, {
      schoolName: params.schoolName,
      title,
      subtitle: `Academic Session: ${params.sessionName} • Generated: ${new Date().toLocaleDateString()}`,
      rightBadge: badge,
      kpis: [
        {
          label: 'Classes',
          value: String(params.classes.length),
          subtext: 'Active class sections',
          accentRgb: [79, 70, 229]
        },
        {
          label: 'Students',
          value: String(params.classes.reduce((total, group) => total + group.students.length, 0)),
          subtext: 'Registered by class',
          accentRgb: [16, 185, 129]
        },
        {
          label: 'Subjects',
          value: String(params.classes.reduce((total, group) => total + group.subjects.length, 0)),
          subtext: 'Class subject entries',
          accentRgb: [245, 158, 11]
        },
        {
          label: 'Teachers',
          value: String(params.teachers.length),
          subtext: 'Staff directory',
          accentRgb: [59, 130, 246]
        }
      ]
    });
  };

  const drawGroupHeading = (title: string, y: number): number => {
    doc.setFillColor(238, 242, 255);
    doc.setDrawColor(199, 210, 254);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 8, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(title, margin + 3, y + 5.3);
    return y + 10;
  };

  const drawTableHeader = (headers: string[], weights: number[], y: number): number => {
    const tableWidth = pageWidth - margin * 2;
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, y, tableWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    let x = margin;
    headers.forEach((header, index) => {
      const width = tableWidth * weights[index] / totalWeight;
      doc.text(header.toUpperCase(), x + 2, y + 5.3);
      x += width;
    });
    return y + 8;
  };

  const drawRows = (
    rows: string[][],
    weights: number[],
    initialY: number,
    repeatHeader: (pageY: number) => number,
    pageTitle: string,
    badge: string
  ): number => {
    const tableWidth = pageWidth - margin * 2;
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let y = initialY;
    rows.forEach((row, rowIndex) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      const cellLines = row.map((text, columnIndex) => {
        const width = tableWidth * weights[columnIndex] / totalWeight - 4;
        return doc.splitTextToSize(text || '—', Math.max(10, width));
      });
      const rowHeight = Math.max(7, ...cellLines.map(lines => lines.length * 3.6 + 3));
      if (y + rowHeight > bottom) {
        y = repeatHeader(startPage(pageTitle, badge));
      }

      if (rowIndex % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, tableWidth, rowHeight, 'F');
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowHeight, pageWidth - margin, y + rowHeight);
      doc.setTextColor(51, 65, 85);
      let x = margin;
      cellLines.forEach((lines, columnIndex) => {
        const width = tableWidth * weights[columnIndex] / totalWeight;
        doc.text(lines, x + 2, y + 4.5);
        x += width;
      });
      y += rowHeight;
    });
    return y;
  };

  const drawSectionTitleAndHeader = (
    title: string,
    headers: string[],
    weights: number[],
    y: number
  ) => {
    const withTitle = drawGroupHeading(title, y);
    return drawTableHeader(headers, weights, withTitle);
  };

  let y = startPage('STUDENT CLASS DIRECTORY', 'STUDENTS');
  for (const group of params.classes) {
    const headers = ['S/N', 'STUDENT NAME', 'ADMISSION NO.', 'GENDER'];
    const weights = [8, 50, 25, 17];
    const title = `${group.section.name} • ${group.students.length} STUDENTS`;
    if (y + 20 > bottom) y = startPage('STUDENT CLASS DIRECTORY', 'STUDENTS');
    const repeatHeader = (pageY: number) =>
      drawSectionTitleAndHeader(title, headers, weights, pageY);
    y = drawSectionTitleAndHeader(title, headers, weights, y);
    const sortedStudents = [...group.students].sort(
      (a, b) =>
        a.fullName.localeCompare(b.fullName, undefined, { sensitivity: 'base' }) ||
        a.admissionNumber.localeCompare(b.admissionNumber, undefined, { sensitivity: 'base' })
    );
    const rows = sortedStudents.length > 0
      ? sortedStudents.map((student, index) => [
          String(index + 1),
          student.fullName,
          student.admissionNumber,
          student.gender
        ])
      : [['—', 'No students registered', '—', '—']];
    y = drawRows(rows, weights, y, repeatHeader, 'STUDENT CLASS DIRECTORY', 'STUDENTS') + 5;
  }

  y = startPage('SUBJECTS ASSIGNED BY CLASS', 'SUBJECTS');
  for (const group of params.classes) {
    const headers = ['SUBJECT', 'CODE', 'CATEGORY', 'ASSIGNED TEACHER(S)'];
    const weights = [36, 16, 18, 30];
    const title = `${group.section.name} • FORM TUTOR: ${group.formTutor}`;
    if (y + 20 > bottom) y = startPage('SUBJECTS ASSIGNED BY CLASS', 'SUBJECTS');
    const repeatHeader = (pageY: number) =>
      drawSectionTitleAndHeader(title, headers, weights, pageY);
    y = drawSectionTitleAndHeader(title, headers, weights, y);
    const rows = group.subjects.length > 0
      ? group.subjects.map(subject => [
          subject.name,
          subject.code,
          subject.category,
          subject.teachers.join(', ') || 'Unassigned'
        ])
      : [['No applicable subjects', '—', '—', '—']];
    y = drawRows(rows, weights, y, repeatHeader, 'SUBJECTS ASSIGNED BY CLASS', 'SUBJECTS') + 5;
  }

  const classHeaders = ['CLASS', 'LEVEL', 'FORM TUTOR'];
  const classWeights = [48, 20, 32];
  y = startPage('CLASS & FORM TUTOR DIRECTORY', 'FORM TUTORS');
  y = drawSectionTitleAndHeader('CLASS FORM TUTOR ASSIGNMENTS', classHeaders, classWeights, y);
  const classRows = params.classes.map(group => [
    group.section.name,
    `${group.section.levelType} SECONDARY`,
    group.formTutor
  ]);
  drawRows(classRows, classWeights, y, pageY =>
    drawSectionTitleAndHeader(
      'CLASS FORM TUTOR ASSIGNMENTS',
      classHeaders,
      classWeights,
      pageY
    ),
    'CLASS & FORM TUTOR DIRECTORY',
    'FORM TUTORS'
  );

  const teacherHeaders = ['TEACHER', 'SUBJECTS ASSIGNED (CLASS — SUBJECT)'];
  const teacherWeights = [30, 70];
  y = startPage('TEACHER SUBJECT ASSIGNMENT DIRECTORY', 'TEACHERS');
  y = drawSectionTitleAndHeader('TEACHER SUBJECT CLEARANCE', teacherHeaders, teacherWeights, y);
  const teacherRows = params.teachers.map(teacher => [
    `${teacher.fullName}${teacher.staffId ? ` (${teacher.staffId})` : ''}`,
    teacher.subjects.join('\n') || 'No subject assignments'
  ]);
  drawRows(teacherRows, teacherWeights, y, pageY =>
    drawSectionTitleAndHeader(
      'TEACHER SUBJECT CLEARANCE',
      teacherHeaders,
      teacherWeights,
      pageY
    ),
    'TEACHER SUBJECT ASSIGNMENT DIRECTORY',
    'TEACHERS'
  );

  return doc;
}

export function downloadMasterDirectoriesPdf(params: MasterDirectoriesPdfParams): void {
  const doc = createMasterDirectoriesPdf(params);
  doc.save(`${params.schoolName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim().replace(/\s+/g, '_')}_Master_Directories.pdf`);
}

/**
 * Downloads the Class Missing / Incomplete Results Completeness Audit in PDF format with dashboard formatting
 */
export function downloadClassCompletenessAuditPdf(params: {
  schoolName: string;
  sectionName: string;
  levelType: string;
  termName: string;
  sessionName: string;
  formTutorName: string;
  auditRows: StudentCompletenessAuditRow[];
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  const totalStudents = params.auditRows.length;
  const completeStudents = params.auditRows.filter(r => r.isComplete).length;
  const incompleteStudents = totalStudents - completeStudents;
  const totalMissingSubjectEntries = params.auditRows.reduce((acc, r) => acc + r.missingSubjectsCount, 0);

  let y = drawDashboardHeader(doc, {
    schoolName: params.schoolName,
    title: `${params.sectionName} — CLASS RESULT COMPLETENESS & MISSING GRADES AUDIT`,
    subtitle: `Session: ${params.sessionName} • Term: ${params.termName} TERM • Form Tutor: ${params.formTutorName} • Generated: ${new Date().toLocaleDateString()}`,
    rightBadge: `${params.levelType} SECONDARY`,
    kpis: [
      {
        label: 'Total Students Audited',
        value: `${totalStudents} Students`,
        subtext: `In ${params.sectionName}`,
        accentRgb: [59, 130, 246]
      },
      {
        label: 'Complete Student Records',
        value: `${completeStudents} (${totalStudents > 0 ? Math.round((completeStudents / totalStudents) * 100) : 0}%)`,
        subtext: 'All included subjects graded',
        accentRgb: [16, 185, 129]
      },
      {
        label: 'Students With Missing Results',
        value: `${incompleteStudents} Action Needed`,
        subtext: '1 or more missing subject grades',
        accentRgb: [244, 63, 94]
      },
      {
        label: 'Total Missing Subject Grades',
        value: `${totalMissingSubjectEntries} Subject Entries`,
        subtext: 'Across class curriculum',
        accentRgb: [245, 158, 11]
      }
    ]
  });

  // Table Header
  const colWidths = [10, 28, 52, 26, 26, 26, pageWidth - margin * 2 - 168];
  const headers = [
    'S/N',
    'ADM. NO',
    'STUDENT FULL NAME',
    'INCLUDED SUBJ.',
    'GRADED SUBJ.',
    'STATUS',
    'SUBJECTS WITH MISSING / INCOMPLETE GRADES'
  ];

  const drawTableHeader = (topY: number) => {
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(margin, topY, pageWidth - margin * 2, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    let colX = margin;
    headers.forEach((h, idx) => {
      doc.text(h, colX + 2, topY + 5.2);
      colX += colWidths[idx];
    });
    return topY + 8;
  };

  y = drawTableHeader(y);

  params.auditRows.forEach((row, index) => {
    const missingText = row.missingSubjects.length === 0
      ? 'All included subjects have complete continuous assessment scores entered.'
      : row.missingSubjects
          .map(m =>
            m.status === 'NO_GRADE'
              ? `${m.subjectName} (Not Entered / Empty)`
              : `${m.subjectName} (Empty Cell: ${m.missingComponents.join(', ')})`
          )
          .join('  •  ');

    const wrappedMissing = doc.splitTextToSize(missingText, colWidths[6] - 4);
    const rowHeight = Math.max(7.5, wrappedMissing.length * 3.8 + 2.5);

    if (y + rowHeight > pageHeight - 14) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(y);
    }

    // Alternating row fill (highlight incomplete rows in soft rose/amber)
    if (!row.isComplete) {
      doc.setFillColor(255, 241, 242); // rose-50
    } else if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252); // slate-50
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - margin * 2, rowHeight, 'FD');

    let colX = margin;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(String(index + 1), colX + 2, y + 4.8);
    colX += colWidths[0];

    // Adm No
    doc.setFont('courier', 'bold');
    doc.text(row.admissionNumber, colX + 2, y + 4.8);
    colX += colWidths[1];

    // Full Name
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(row.fullName.slice(0, 30), colX + 2, y + 4.8);
    colX += colWidths[2];

    // Included Subjects Count
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`${row.includedSubjectsCount} Subjects`, colX + 2, y + 4.8);
    colX += colWidths[3];

    // Graded Subjects Count
    doc.text(`${row.completedSubjectsCount} / ${row.includedSubjectsCount}`, colX + 2, y + 4.8);
    colX += colWidths[4];

    // Status Pill
    if (row.isComplete) {
      doc.setFillColor(209, 250, 229);
      doc.roundedRect(colX + 1.5, y + 1.5, 21, 4.6, 1, 1, 'F');
      doc.setTextColor(6, 95, 70);
      doc.setFontSize(6.5);
      doc.text('COMPLETE', colX + 12, y + 4.7, { align: 'center' });
    } else {
      doc.setFillColor(254, 205, 211);
      doc.roundedRect(colX + 1.5, y + 1.5, 23, 4.6, 1, 1, 'F');
      doc.setTextColor(159, 18, 57);
      doc.setFontSize(6.5);
      doc.text(`${row.missingSubjectsCount} MISSING`, colX + 13, y + 4.7, { align: 'center' });
    }
    colX += colWidths[5];

    // Missing subjects list
    doc.setFont('helvetica', row.isComplete ? 'normal' : 'bold');
    doc.setFontSize(7);
    doc.setTextColor(row.isComplete ? 22 : 180, row.isComplete ? 101 : 28, row.isComplete ? 52 : 28);
    doc.text(wrappedMissing, colX + 2, y + 4.5);

    y += rowHeight;
  });

  const cleanFileName = `${params.sectionName.replace(/\s+/g, '_')}_Missing_Results_Audit_${params.termName}.pdf`;
  doc.save(cleanFileName);
}

/**
 * Downloads the Score Modification Audit Trail Ledger in PDF format with dashboard formatting
 */
export function downloadAuditTrailPdf(params: {
  schoolName: string;
  sessionName: string;
  termName: string;
  logs: ScoreAuditLog[];
}): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  let y = drawDashboardHeader(doc, {
    schoolName: params.schoolName,
    title: 'CONTINUOUS ASSESSMENT SCORE MODIFICATION AUDIT TRAIL',
    subtitle: `Session: ${params.sessionName} • Active Term: ${params.termName} TERM • Total Logged Modifications: ${params.logs.length}`,
    rightBadge: 'IMMUTABLE LEDGER',
    kpis: [
      {
        label: 'Logged Score Edits',
        value: `${params.logs.length} Entries`,
        subtext: 'Verified audit records',
        accentRgb: [124, 58, 237]
      },
      {
        label: 'Academic Session',
        value: params.sessionName,
        subtext: `${params.termName} TERM`,
        accentRgb: [79, 70, 229]
      },
      {
        label: 'Unique Students Modified',
        value: `${new Set(params.logs.map(l => l.studentName)).size} Students`,
        subtext: 'Across subjects',
        accentRgb: [16, 185, 129]
      },
      {
        label: 'Export Timestamp',
        value: new Date().toLocaleDateString(),
        subtext: 'Official PDF Transcript',
        accentRgb: [245, 158, 11]
      }
    ]
  });

  const colWidths = [34, 52, 48, 34, 42, pageWidth - margin * 2 - 210];
  const headers = ['TIMESTAMP', 'STUDENT NAME', 'SUBJECT & COMPONENT', 'SCORE CHANGE', 'MODIFIED BY', 'REASON / AUDIT NOTE'];

  const drawTableHeader = (topY: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, topY, pageWidth - margin * 2, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    let colX = margin;
    headers.forEach((h, idx) => {
      doc.text(h, colX + 2, topY + 5.2);
      colX += colWidths[idx];
    });
    return topY + 8;
  };

  y = drawTableHeader(y);

  params.logs.forEach((log, idx) => {
    const rowH = 7.5;
    if (y + rowH > pageHeight - 14) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(y);
    }

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - margin * 2, rowH, 'FD');

    let colX = margin;
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(new Date(log.createdAt).toLocaleString(), colX + 2, y + 4.8);
    colX += colWidths[0];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(log.studentName.slice(0, 28), colX + 2, y + 4.8);
    colX += colWidths[1];

    doc.setFont('helvetica', 'normal');
    doc.text(`${log.subjectName} (${log.componentName})`.slice(0, 28), colX + 2, y + 4.8);
    colX += colWidths[2];

    const delta =
      log.previousScore !== null && log.newScore !== null
        ? Number((log.newScore - log.previousScore).toFixed(1))
        : null;
    const changeStr = `${log.previousScore ?? 'Empty'} -> ${log.newScore ?? 'Empty'}${delta !== null ? ` (${delta >= 0 ? '+' : ''}${delta})` : ''}`;
    doc.setFont('courier', 'bold');
    doc.setTextColor(79, 70, 229);
    doc.text(changeStr, colX + 2, y + 4.8);
    colX += colWidths[3];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(`${log.changedBy} (${log.changedByRole})`.slice(0, 24), colX + 2, y + 4.8);
    colX += colWidths[4];

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(log.changeReason.slice(0, 42), colX + 2, y + 4.8);

    y += rowH;
  });

  doc.save('EduGrade_Score_Audit_Trail.pdf');
}

/**
 * Downloads the Executive Dashboard Class Records in PDF format with dashboard formatting
 */
export function downloadExecutiveClassRecordsPdf(params: {
  schoolName: string;
  sectionName: string;
  levelType: string;
  formTutorName: string;
  termName: string;
  sessionName: string;
  totalStudents: number;
  averagePct: number;
  passRatePct: number;
  topStudentName: string;
  topStudentScore: string;
  subjectAverages: Array<{ name: string; category: string; avgPct: number }>;
  studentRows: Array<{
    rank: number;
    admissionNumber: string;
    fullName: string;
    gender: string;
    totalObtained: number;
    totalPossible: number;
    cumulativePercentage: number;
    cumulativeGrade: string;
  }>;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 12;

  let y = drawDashboardHeader(doc, {
    schoolName: params.schoolName,
    title: `${params.sectionName} — EXECUTIVE ACADEMIC PERFORMANCE DASHBOARD`,
    subtitle: `Session: ${params.sessionName} • Term: ${params.termName} TERM • Form Master: ${params.formTutorName}`,
    rightBadge: `${params.levelType} SECONDARY`,
    kpis: [
      {
        label: 'Registered Enrolled',
        value: `${params.totalStudents}`,
        subtext: `Active in ${params.termName} Term`,
        accentRgb: [59, 130, 246]
      },
      {
        label: 'Class Cumulative Avg',
        value: `${params.averagePct}%`,
        subtext: 'Across included subjects',
        accentRgb: [79, 70, 229]
      },
      {
        label: 'Pass Rate (>=50%)',
        value: `${params.passRatePct}%`,
        subtext: 'Institutional benchmark',
        accentRgb: [16, 185, 129]
      },
      {
        label: 'Class Valedictorian',
        value: params.topStudentName.slice(0, 14),
        subtext: params.topStudentScore,
        accentRgb: [245, 158, 11]
      }
    ]
  });

  // Top Subject Performance Summary Strip
  if (params.subjectAverages.length > 0) {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 13, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('SUBJECT PERFORMANCE AVERAGES:', margin + 3, y + 4.8);

    const subjSummary = params.subjectAverages
      .slice(0, 8)
      .map(s => `${s.name}: ${s.avgPct}%`)
      .join('   •   ');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(subjSummary.slice(0, 118), margin + 3, y + 9.8);

    y += 17;
  }

  // Class Leaderboard Table
  const colWidths = [16, 30, 62, 18, 26, 20, pageWidth - margin * 2 - 172];
  const headers = ['RANK', 'ADM. NO', 'STUDENT FULL NAME', 'GENDER', 'TOTAL MARKS', 'CUM. %', 'GRADE'];

  const drawTableHeader = (topY: number) => {
    doc.setFillColor(30, 41, 59);
    doc.rect(margin, topY, pageWidth - margin * 2, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    let colX = margin;
    headers.forEach((h, idx) => {
      doc.text(h, colX + 2, topY + 5.2);
      colX += colWidths[idx];
    });
    return topY + 8;
  };

  y = drawTableHeader(y);

  params.studentRows.forEach((row, index) => {
    const rowH = 7;
    if (y + rowH > pageHeight - 14) {
      doc.addPage();
      y = 14;
      y = drawTableHeader(y);
    }

    if (index % 2 === 1) {
      doc.setFillColor(248, 250, 252);
    } else {
      doc.setFillColor(255, 255, 255);
    }
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - margin * 2, rowH, 'FD');

    let colX = margin;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(row.rank <= 3 ? 180 : 71, row.rank <= 3 ? 83 : 85, row.rank <= 3 ? 9 : 105);
    doc.text(formatRankOrdinal(row.rank), colX + 3, y + 4.8);
    colX += colWidths[0];

    doc.setFont('courier', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(row.admissionNumber, colX + 2, y + 4.8);
    colX += colWidths[1];

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(row.fullName.slice(0, 32), colX + 2, y + 4.8);
    colX += colWidths[2];

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(row.gender, colX + 2, y + 4.8);
    colX += colWidths[3];

    doc.setFont('courier', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`${row.totalObtained.toFixed(1)} / ${row.totalPossible}`, colX + 2, y + 4.8);
    colX += colWidths[4];

    doc.setFont('courier', 'bold');
    doc.setTextColor(49, 46, 129);
    doc.text(`${row.cumulativePercentage.toFixed(1)}%`, colX + 2, y + 4.8);
    colX += colWidths[5];

    doc.setFont('helvetica', 'bold');
    const isFail = row.cumulativeGrade === 'F';
    doc.setTextColor(isFail ? 225 : 5, isFail ? 29 : 150, isFail ? 72 : 105);
    doc.text(row.cumulativeGrade, colX + 4, y + 4.8);

    y += rowH;
  });

  const cleanFileName = `${params.sectionName.replace(/\s+/g, '_')}_Executive_Dashboard_${params.termName}.pdf`;
  doc.save(cleanFileName);
}
