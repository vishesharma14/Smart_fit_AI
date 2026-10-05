import { create } from 'zustand';
import type { ValidationScanAttempt, ValidationSubject } from '../types/validation';

/*
 * Real-person validation records (Step 9E-3A, `?poseDebug` only). Kept in memory only — deliberately not part of
 * the persisted app store, never written to storage and never uploaded; reloading the page clears them.
 */

type SubjectInput = Pick<ValidationSubject, 'subjectId' | 'heightCm' | 'groundTruth' | 'sides'>;

interface ValidationState {
  subjects: ValidationSubject[];
  activeSubjectId: string | null;
  /**
   * Adds a subject, or replaces the height / ground truth of an existing one that has no recorded scans yet.
   * Once a scan is recorded the ground truth is fixed (repeated scans must share it): returns false then.
   */
  saveSubject: (subject: SubjectInput) => boolean;
  selectSubject: (subjectId: string | null) => void;
  /** Adds an attempt to a subject; the attempt number must be new for that subject. Attempts are never overwritten. */
  addAttempt: (subjectId: string, attempt: ValidationScanAttempt) => boolean;
  clearAll: () => void;
}

export const useValidationStore = create<ValidationState>()((set, get) => ({
  subjects: [],
  activeSubjectId: null,
  saveSubject: ({ subjectId, heightCm, groundTruth, sides }) => {
    const existing = get().subjects.find((s) => s.subjectId === subjectId);
    if (existing && existing.attempts.length > 0) return false;
    set((state) => ({
      subjects: existing
        ? state.subjects.map((s) => (s.subjectId === subjectId ? { ...s, heightCm, groundTruth, sides } : s))
        : [...state.subjects, { subjectId, heightCm, groundTruth, sides, attempts: [], synthetic: false }],
      activeSubjectId: subjectId,
    }));
    return true;
  },
  selectSubject: (subjectId) => set({ activeSubjectId: subjectId }),
  addAttempt: (subjectId, attempt) => {
    const subject = get().subjects.find((s) => s.subjectId === subjectId);
    if (!subject || subject.attempts.some((a) => a.attempt === attempt.attempt)) return false;
    set((state) => ({
      subjects: state.subjects.map((s) => (s.subjectId === subjectId ? { ...s, attempts: [...s.attempts, attempt] } : s)),
    }));
    return true;
  },
  clearAll: () => set({ subjects: [], activeSubjectId: null }),
}));

/** Next attempt number for a subject (1 for the first scan). */
export const nextAttemptNumber = (subject: ValidationSubject | undefined): number =>
  subject ? Math.max(0, ...subject.attempts.map((a) => a.attempt)) + 1 : 1;
