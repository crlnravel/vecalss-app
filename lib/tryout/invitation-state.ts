import type { InvitationPickerStudent } from "./invitation-picker";

export function invitationIntent(student: InvitationPickerStudent | null, sessionId: string) {
  if (!student || !sessionId) return "unavailable";
  if (student.admission?.status === "pending") return "review";
  const assignment = student.admission?.assignment;
  const target = assignment?.deliverySessionId === sessionId ? assignment : null;
  if (student.admission?.status === "rejected" || student.admission?.status === "revoked" || target?.status === "revoked") return "restore";
  if (student.admission?.status === "active" && target?.status === "active") return "active";
  return "invite";
}

export type InvitationSearchState = {
  query: string;
  generation: number;
  students: InvitationPickerStudent[];
  selected: InvitationPickerStudent | null;
  activeIndex: number;
  loading: boolean;
  error: string | null;
};
export const initialInvitationSearch: InvitationSearchState = { query: "", generation: 0, students: [], selected: null, activeIndex: -1, loading: false, error: null };
type SearchAction =
  | { type: "query"; query: string; generation: number }
  | { type: "start"; generation: number }
  | { type: "result"; generation: number; students: InvitationPickerStudent[] }
  | { type: "error"; generation: number; message: string }
  | { type: "choose"; id: string; generation: number }
  | { type: "index"; index: number }
  | { type: "clear"; generation: number };

export function invitationSearchReducer(state: InvitationSearchState, action: SearchAction): InvitationSearchState {
  if (action.type === "query") return { ...initialInvitationSearch, query: action.query, generation: action.generation };
  if (action.type === "clear") return { ...initialInvitationSearch, generation: action.generation };
  if (action.type === "choose") return { ...state, generation: action.generation, selected: state.students.find((student) => student.id === action.id) ?? null, activeIndex: -1, students: [], loading: false };
  if (action.type === "index") return { ...state, activeIndex: action.index };
  if (action.generation !== state.generation) return state;
  if (action.type === "start") return { ...state, loading: true, students: [], activeIndex: -1, error: null };
  if (action.type === "error") return { ...state, loading: false, error: action.message, students: [], activeIndex: -1 };
  return { ...state, loading: false, error: null, students: action.students, activeIndex: action.students.length ? 0 : -1 };
}
