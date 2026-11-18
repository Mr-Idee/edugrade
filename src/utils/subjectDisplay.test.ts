import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getStudentReligiousStudiesChoice,
  getSubjectDisplayName,
  isReligiousStudiesSubject,
  withStudentReligiousStudiesChoice
} from './subjectDisplay';

test('subject display names use only the override for the selected class section', () => {
  const subject = {
    name: 'FASHION DESIGN AND GARMENT MAKING',
    sectionNameOverrides: { '6': 'HOME ECONOMICS' }
  };

  assert.equal(getSubjectDisplayName(subject, 6), 'HOME ECONOMICS');
  assert.equal(getSubjectDisplayName(subject, 3), 'FASHION DESIGN AND GARMENT MAKING');
  assert.equal(getSubjectDisplayName(subject), 'FASHION DESIGN AND GARMENT MAKING');
});

test('subject display names fall back to the original name when no subject is found', () => {
  assert.equal(getSubjectDisplayName(undefined, 6), '');
});

test('stores CRS and IRS choices independently by academic session', () => {
  const student = {
    religiousStudiesChoiceBySession: { '3': 'CRS' as const }
  };
  assert.equal(getStudentReligiousStudiesChoice(student, 3), 'CRS');
  assert.equal(getStudentReligiousStudiesChoice(student, 4), undefined);
  assert.deepEqual(withStudentReligiousStudiesChoice(student, 4, 'IRS'), {
    '3': 'CRS',
    '4': 'IRS'
  });
  assert.deepEqual(withStudentReligiousStudiesChoice(student, 3, undefined), {});
});

test('uses the selected religious studies label while retaining the shared subject identity', () => {
  const subject = { id: 35, name: 'CRS/IRS', sectionNameOverrides: {} };
  assert.equal(isReligiousStudiesSubject(subject), true);
  assert.equal(getSubjectDisplayName(subject, 6, 'CRS'), 'CHRISTIAN RELIGIOUS STUDIES');
  assert.equal(getSubjectDisplayName(subject, 6, 'IRS'), 'ISLAMIC RELIGIOUS STUDIES');
  assert.equal(getSubjectDisplayName(subject, 6), 'RELIGIOUS STUDIES (CRS / IRS)');
});
