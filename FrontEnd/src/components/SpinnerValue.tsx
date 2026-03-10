import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface SpinnerValueProps {
  loading: boolean;
  value?: ReactNode;
  placeholder?: ReactNode;
  className?: string;
  spinnerClassName?: string;
}

export function SpinnerValue({
  loading,
  value,
  placeholder = "--",
  className,
  spinnerClassName,
}: SpinnerValueProps) {
  if (loading) {
    return <Loader2 className={cn("h-4 w-4 animate-spin text-muted-foreground", spinnerClassName)} />;
  }

  return <span className={className}>{value ?? placeholder}</span>;
}
