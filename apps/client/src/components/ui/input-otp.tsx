"use client"

import { OTPInput as OTPInputPrimitive, OTPInputContext } from "input-otp"
import * as React from "react"

import { cn } from "@/lib/utils"

function InputOTP({ className, containerClassName, ...props }: React.ComponentProps<typeof OTPInputPrimitive>) {
  return (
    <OTPInputPrimitive
      data-slot="input-otp"
      containerClassName={cn("flex items-center gap-1.5", containerClassName)}
      className={cn("sr-only", className)}
      {...props}
    />
  )
}

function InputOTPGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-otp-group"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

function InputOTPSlot({ className, index, ...props }: React.ComponentProps<"div"> & {
  index: number
}) {
  const { slots } = React.useContext(OTPInputContext)
  const { char, isActive, hasFakeCaret } = slots[index] ?? {
    char: null,
    isActive: false,
    hasFakeCaret: false,
  }

  return (
    <div
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "relative flex size-10 items-center justify-center rounded-lg border border-brand-border bg-brand-surface-soft font-mono text-base font-bold text-text-primary transition-colors focus:border-brand-accent focus:outline-none data-[active=true]:border-brand-accent aria-invalid:border-status-error",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-0.5 animate-otp-blink bg-brand-accent" />
        </div>
      )}
      {isActive && !char && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-4 w-0.5 bg-brand-accent" />
        </div>
      )}
    </div>
  )
}

export { InputOTP, InputOTPGroup, InputOTPSlot }
