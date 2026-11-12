export interface SubjectScorePdfRow {
  admissionNumber: string;
  fullName: string;
  componentScores: Array<number | null>;
  rawCaTotal: number | null;
  ca1Score: number | null;
  ca2Score: number | null;
  examScore: number | null;
  totalScore: number | null;
  grade: string;
}

export function buildSubjectScoresPdfTable(params: {
  components: string[];
  rows: SubjectScorePdfRow[];
}): { headers: string[]; rows: string[][] } {
  const headers = [
    'S/N',
    'Admission No.',
    'Student Name',
    ...params.components,
    'CA Total',
    'CA1',
    'CA2',
    'Exam',
    'Running Total',
    'Grade'
  ];

  return {
    headers,
    rows: params.rows.map((row, index) => [
      String(index + 1),
      row.admissionNumber,
      row.fullName,
      ...row.componentScores.map(score => score === null ? '' : String(score)),
      row.rawCaTotal === null ? '' : String(row.rawCaTotal),
      row.ca1Score === null ? '' : String(row.ca1Score),
      row.ca2Score === null ? '' : String(row.ca2Score),
      row.examScore === null ? '' : String(row.examScore),
      row.totalScore === null ? '' : String(row.totalScore),
      row.grade
    ])
  };
}
