import type { SessionContext } from "@/lib/auth/types";

type StudentActor = {
  kind: "student";
  session: SessionContext;
};

type AdminActor = {
  kind: "admin";
  session: SessionContext;
};

type StudentSubject = {
  kind: "student";
  id: string;
  displayName: string;
};

type PreviewStudentSubject = {
  kind: "admin-preview";
  id: string;
  displayName: string;
  previewPurpose: string;
};

type StudentSurfaceContext =
  | {
      mode: "student";
      actor: StudentActor;
      student: StudentSubject;
      basePath: "";
    }
  | {
      mode: "admin-preview";
      actor: AdminActor;
      student: PreviewStudentSubject;
      basePath: "/admin/student-preview";
    };

function createStudentSurfaceContext({
  session,
  student,
}: {
  session: SessionContext;
  student: Omit<StudentSubject, "kind">;
}): Extract<StudentSurfaceContext, { mode: "student" }> {
  return {
    actor: { kind: "student", session },
    basePath: "",
    mode: "student",
    student: { ...student, kind: "student" },
  };
}

function createAdminStudentPreviewSurfaceContext({
  previewPurpose,
  session,
  student,
}: {
  previewPurpose: string;
  session: SessionContext;
  student: Omit<PreviewStudentSubject, "kind" | "previewPurpose">;
}): Extract<StudentSurfaceContext, { mode: "admin-preview" }> {
  return {
    actor: { kind: "admin", session },
    basePath: "/admin/student-preview",
    mode: "admin-preview",
    student: {
      ...student,
      kind: "admin-preview",
      previewPurpose,
    },
  };
}

export {
  createAdminStudentPreviewSurfaceContext,
  createStudentSurfaceContext,
};

export type {
  AdminActor,
  PreviewStudentSubject,
  StudentActor,
  StudentSubject,
  StudentSurfaceContext,
};
