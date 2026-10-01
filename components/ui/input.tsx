import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"
import { fieldControlClassName } from "./field-constants"

function Input({
  className,
  type,
  ...props
}: React.ComponentProps<typeof InputPrimitive>) {
  const baseClassName = `${fieldControlClassName} file:mr-3 file:inline-flex file:h-7 file:rounded-control file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-primary-800`;
  const composedClassName =
    typeof className === "function"
      ? (state: InputPrimitive.State) => cn(baseClassName, className(state))
      : cn(baseClassName, className);

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={composedClassName}
      {...props}
    />
  )
}

export { Input }
