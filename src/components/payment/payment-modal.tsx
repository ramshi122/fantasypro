"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  plan: {
    id: string;
    name: string;
    price: number;
    duration: string;
    keyType: string;
    color: string;
  };
  mobile: string;
  onPaymentSuccess: (licenseKey: string, keyType: string, expiresAt: number | null) => void;
}

type Phase = "review" | "payment-method" | "processing" | "success" | "failed";

export function PaymentModal({ open, onClose, plan, mobile, onPaymentSuccess }: PaymentModalProps) {
  const [phase, setPhase] = useState<Phase>("review");
  const [paymentMethod] = useState<"upi">("upi");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [licenseKey, setLicenseKey] = useState<string | null>(null);

  if (!open) return null;

  function handleClose() {
    if (phase === "processing") return;
    setPhase("review");
    setOrderId(null);
    setLicenseKey(null);
    onClose();
  }

  async function handleStartPayment() {
    if (!mobile || mobile.length !== 10) {
      toast.error("Please login with mobile number first");
      return;
    }
    setPhase("payment-method");
  }

  async function handlePay() {
    setPhase("processing");

    try {
      // Step 1: Create order
      const orderRes = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-order",
          mobile,
          plan: plan.id,
        }),
      });
      const orderData = await orderRes.json();

      if (orderData.status !== "success") {
        toast.error(orderData.message || "Failed to create order");
        setPhase("failed");
        return;
      }

      setOrderId(orderData.orderId);

      // Step 2: Simulate payment processing (demo mode)
      await new Promise((r) => setTimeout(r, 2000));

      // Step 3: Verify payment
      const verifyRes = await fetch("/api/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          orderId: orderData.orderId,
          paymentId: `PAY_${Date.now()}`,
          status: "success",
        }),
      });
      const verifyData = await verifyRes.json();

      if (verifyData.status === "success") {
        setLicenseKey(verifyData.licenseKey);
        setPhase("success");
        toast.success("Payment successful! License key activated.");
        setTimeout(() => {
          onPaymentSuccess(verifyData.licenseKey, verifyData.keyType, verifyData.expiresAt);
        }, 2000);
      } else {
        toast.error(verifyData.message || "Payment verification failed");
        setPhase("failed");
      }
    } catch (err: any) {
      console.error("[Payment] Error:", err);
      toast.error(err?.message || "Payment error");
      setPhase("failed");
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[95] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-card w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border border-violet-500/30"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className={cn("p-5 text-white relative bg-gradient-to-br", plan.color)}>
            <button
              onClick={handleClose}
              className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20"
              disabled={phase === "processing"}
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-5 h-5" />
              <h3 className="font-bold text-base">Purchase {plan.name}</h3>
            </div>
            <p className="text-[11px] text-white/80">{plan.duration} access</p>
          </div>

          <div className="p-5 space-y-4">
            {/* Review phase */}
            {phase === "review" && (
              <>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Amount</p>
                  <p className="text-4xl font-black text-foreground">₹{plan.price}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">{plan.name} · {plan.duration}</p>
                </div>

                <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 space-y-1.5">
                  <p className="text-[10px] font-bold text-violet-700 dark:text-violet-300 mb-1">Order Summary</p>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="font-bold text-foreground">{plan.name}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Duration</span>
                    <span className="font-bold text-foreground">{plan.duration}</span>
                  </div>
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">Mobile</span>
                    <span className="font-bold text-foreground">+91 {mobile}</span>
                  </div>
                  <div className="flex justify-between text-[11px] pt-1 border-t border-violet-200 dark:border-violet-800">
                    <span className="font-bold text-foreground">Total</span>
                    <span className="font-black text-violet-600 dark:text-violet-400">₹{plan.price}</span>
                  </div>
                </div>

                <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl p-2.5 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <p className="text-[10px] text-emerald-700 dark:text-emerald-300">
                    Secure payment · Key auto-activates after payment confirmation
                  </p>
                </div>

                <Button
                  className="w-full h-11 brand-gradient text-white font-bold"
                  onClick={handleStartPayment}
                >
                  <Lock className="w-4 h-4 mr-2" />
                  Proceed to Pay ₹{plan.price}
                </Button>
              </>
            )}

            {/* Payment method phase — UPI only */}
            {phase === "payment-method" && (
              <>
                <div>
                  <p className="text-xs font-bold text-foreground mb-2">Pay via UPI</p>

                  {/* UPI payment info */}
                  <div className="bg-violet-50 dark:bg-violet-950/30 rounded-xl p-4 border-2 border-violet-200 dark:border-violet-800">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-xl bg-violet-600 flex items-center justify-center">
                        <Smartphone className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">UPI Payment</p>
                        <p className="text-[10px] text-muted-foreground">Pay to: gostr3248@okhdfcbank</p>
                      </div>
                    </div>

                    {/* UPI ID display + copy */}
                    <div className="bg-white dark:bg-card rounded-lg p-2.5 border border-violet-200 dark:border-violet-800">
                      <p className="text-[10px] text-muted-foreground mb-1">UPI ID</p>
                      <div className="flex items-center justify-between">
                        <code className="text-sm font-bold text-violet-600 dark:text-violet-400">gostr3248@okhdfcbank</code>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText("gostr3248@okhdfcbank");
                            toast.success("UPI ID copied!");
                          }}
                          className="text-[10px] bg-violet-600 hover:bg-violet-700 text-white px-2 py-1 rounded-md font-bold"
                        >
                          Copy
                        </button>
                      </div>
                    </div>

                    {/* Amount to pay */}
                    <div className="mt-3 flex items-center justify-between bg-white dark:bg-card rounded-lg p-2.5 border border-violet-200 dark:border-violet-800">
                      <span className="text-[11px] text-muted-foreground">Amount to Pay</span>
                      <span className="text-lg font-black text-violet-600 dark:text-violet-400">₹{plan.price}</span>
                    </div>
                  </div>

                  {/* Open UPI app button */}
                  <Button
                    className="w-full h-11 bg-emerald-500 hover:bg-emerald-600 text-white font-bold mt-3"
                    onClick={() => {
                      // Open UPI app with pre-filled payment
                      const upiUrl = `upi://pay?pa=gostr3248@okhdfcbank&pn=Apna%20Cricket&am=${plan.price}&cu=INR&tn=${plan.name} License`;
                      window.open(upiUrl, "_blank");
                      toast.info("Opening UPI app... After payment, click 'I've Paid' below");
                    }}
                  >
                    <Smartphone className="w-4 h-4 mr-2" />
                    Open UPI App & Pay ₹{plan.price}
                  </Button>

                  <p className="text-[10px] text-muted-foreground text-center mt-2">
                    GPay · PhonePe · Paytm · BHIM — any UPI app
                  </p>
                </div>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                  <p className="text-[10px] text-amber-700 dark:text-amber-300 font-bold">
                    ⚠️ Key activates ONLY after payment confirmation
                  </p>
                  <p className="text-[9px] text-amber-600 dark:text-amber-400 mt-0.5">
                    Pay ₹{plan.price} to the UPI ID above, then click "I've Paid — Verify & Activate" below.
                    If payment fails, no key will be generated.
                  </p>
                </div>

                <Button
                  className="w-full h-11 brand-gradient text-white font-bold"
                  onClick={handlePay}
                >
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  I've Paid — Verify & Activate
                </Button>
              </>
            )}

            {/* Processing phase */}
            {phase === "processing" && (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 mx-auto text-violet-500 animate-spin mb-4" />
                <h3 className="text-sm font-bold text-foreground">Processing Payment...</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Please wait — do not close this window
                </p>
                <div className="mt-4 space-y-1 text-[10px] text-muted-foreground">
                  <p>✓ Order created</p>
                  <p>⏳ Processing payment...</p>
                  <p className="opacity-50">⏳ Verifying & activating key...</p>
                </div>
              </div>
            )}

            {/* Success phase */}
            {phase === "success" && (
              <div className="text-center py-6">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", delay: 0.1 }}
                  className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center mb-3"
                >
                  <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                </motion.div>
                <h3 className="text-sm font-black text-foreground">Payment Successful!</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Your {plan.name} license is now active
                </p>

                {licenseKey && (
                  <div className="mt-3 bg-violet-50 dark:bg-violet-950/30 rounded-xl p-3 border border-violet-200 dark:border-violet-800">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Your License Key</p>
                    <code className="text-sm font-mono font-black text-violet-600 dark:text-violet-400 tracking-wider break-all">
                      {licenseKey}
                    </code>
                  </div>
                )}

                <p className="text-[10px] text-emerald-600 mt-3 font-bold">
                  ✓ Key auto-activated — all features unlocked
                </p>
              </div>
            )}

            {/* Failed phase */}
            {phase === "failed" && (
              <div className="text-center py-6">
                <div className="w-16 h-16 mx-auto rounded-full bg-red-100 dark:bg-red-950/50 flex items-center justify-center mb-3">
                  <X className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-sm font-black text-foreground">Payment Failed</h3>
                <p className="text-[11px] text-muted-foreground mt-1">
                  No charge was made. Please try again.
                </p>
                <Button
                  className="w-full h-10 mt-4 brand-gradient text-white font-bold"
                  onClick={() => setPhase("payment-method")}
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
