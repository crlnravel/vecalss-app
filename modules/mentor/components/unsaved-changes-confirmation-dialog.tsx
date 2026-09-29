import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UnsavedChangesConfirmationDialogProps = {
  description: string;
  onDiscard: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function UnsavedChangesConfirmationDialog({
  description,
  onDiscard,
  onOpenChange,
  open,
}: UnsavedChangesConfirmationDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent size="sm" variant="danger">
        <AlertDialogHeader>
          <AlertDialogTitle>Keluar tanpa menyimpan?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onOpenChange(false)}>
            Lanjut mengedit
          </AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>
            Keluar tanpa menyimpan
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { UnsavedChangesConfirmationDialog };
