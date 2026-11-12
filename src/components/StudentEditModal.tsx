/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Student, ClassSection } from '../types/index';
import { useApp } from '../context/AppContext';
import { X, User, Check, Trash2 } from 'lucide-react';

interface StudentEditModalProps {
  student: Student;
  onClose: () => void;
}

export const StudentEditModal: React.FC<StudentEditModalProps> = ({ student, onClose }) => {
  const { updateStudent, deleteStudent, classSections } = useApp();
  const [fullName, setFullName] = useState(student.fullName);
  const [admissionNumber, setAdmissionNumber] = useState(student.admissionNumber);
  const [gender, setGender] = useState(student.gender);
  const [sectionId, setSectionId] = useState(student.currentSectionId);
  const [attendanceDays, setAttendanceDays] = useState(student.attendanceDays || 62);
  const [isSaved, setIsSaved] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    updateStudent(student.id, {
      fullName: fullName.trim(),
      admissionNumber: admissionNumber.trim(),
      gender,
      currentSectionId: sectionId,
      attendanceDays: Number(attendanceDays)
    });

    setIsSaved(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  const handleDelete = () => {
    deleteStudent(student.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Edit Student Record</h3>
              <p className="text-[11px] text-slate-500 font-mono">{student.admissionNumber}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
              Student Full Name
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Admission Number
              </label>
              <input
                type="text"
                required
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Gender
              </label>
              <select
                aria-label="Gender Selector"
                value={gender}
                onChange={(e) => setGender(e.target.value as any)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
              >
                <option value="MALE">MALE</option>
                <option value="FEMALE">FEMALE</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Class Section
              </label>
              <select
                aria-label="Class Section Selector"
                value={sectionId}
                onChange={(e) => setSectionId(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-semibold text-slate-900"
              >
                {classSections.map(sec => (
                  <option key={sec.id} value={sec.id}>{sec.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">
                Term Attendance Days
              </label>
              <input
                type="number"
                min="0"
                max="65"
                value={attendanceDays}
                onChange={(e) => setAttendanceDays(Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isSaved && (
            <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs font-semibold flex items-center space-x-1.5">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Student record auto-saved successfully!</span>
            </div>
          )}

          {showConfirmDelete ? (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-2">
              <div className="text-xs font-bold text-rose-800">
                Are you sure you want to delete this student and their scores?
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold"
                >
                  Yes, Delete
                </button>
                <button
                  type="button"
                  onClick={() => setShowConfirmDelete(false)}
                  className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowConfirmDelete(true)}
                className="text-rose-600 hover:text-rose-800 flex items-center space-x-1 text-xs font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Student</span>
              </button>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-xs cursor-pointer"
                >
                  Save Record
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
