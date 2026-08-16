type ModalVariant = "default" | "info" | "warning" | "danger" | "success";

const modalVariantClasses: Record<ModalVariant, string> = {
  default: "border-primary-100",
  info: "border-student-status-info-border",
  warning: "border-student-status-attention-border",
  danger: "border-student-status-danger-border",
  success: "border-student-status-success-border",
};

const modalMediaVariantClasses: Record<ModalVariant, string> = {
  default: "bg-primary-50 text-primary-700",
  info: "bg-student-status-info-bg text-student-status-info-fg",
  warning: "bg-student-status-attention-bg text-student-status-attention-fg",
  danger: "bg-student-status-danger-bg text-student-status-danger-fg",
  success: "bg-student-status-success-bg text-student-status-success-fg",
};

export {
  modalMediaVariantClasses,
  modalVariantClasses,
  type ModalVariant,
};
