"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

function toEnglishDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

type LoginFormLabels = {
  phoneNumber: string;
  sendCode: string;
  resendCode: string;
  sendingCode: string;
  loginPhonePlaceholder: string;
  invalidPhoneMessage: string;
  sendCodeFailed: string;
  codeSentNotice: string;
  codeSentTo: string;
  changePhone: string;
  verifyingCodeTitle: string;
  verifyCode: string;
  verifyingCode: string;
  invalidOtpMessage: string;
  otpRequiredFirst: string;
  verifyCodeFailed: string;
  resendAvailableIn: string;
  autoReadHint: string;
};

export function LoginForm({
  labels,
  initialPhone = "",
  initialRequestId = "",
}: {
  labels: LoginFormLabels;
  initialPhone?: string;
  initialRequestId?: string;
}) {
  const [step, setStep] = useState<"phone" | "code">(
    initialRequestId ? "code" : "phone",
  );
  const [phone, setPhone] = useState(initialPhone);
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState(initialRequestId);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(initialRequestId ? 90 : 0);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedPhone = toEnglishDigits(phone).replace(/\D+/g, "").slice(0, 11);
  const normalizedOtpCode = toEnglishDigits(otpCode).replace(/\D+/g, "").slice(0, 6);

  useEffect(() => {
    if (step !== "code" || resendCountdown <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      setResendCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [resendCountdown, step]);

  useEffect(() => {
    if (step !== "code" || !requestId) {
      return;
    }

    const nav = navigator as Navigator & {
      credentials?: {
        get?: (options?: Record<string, unknown>) => Promise<{ code?: string } | null>;
      };
    };

    if (typeof window === "undefined" || !window.isSecureContext || !nav.credentials?.get) {
      return;
    }

    const controller = new AbortController();
    void nav.credentials
      .get({
        otp: { transport: ["sms"] },
        signal: controller.signal,
      })
      .then((credential) => {
        const code = String(credential?.code || "").replace(/\D+/g, "").slice(0, 6);
        if (code.length === 6) {
          handleOtpInput(code);
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [requestId, step]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "phone") {
      await sendCode();
      return;
    }

    await verifyCode();
  }

  async function verifyCode(codeOverride?: string) {
    if (loading) {
      return;
    }

    setLoading(true);
    setError("");
    setNotice("");
    const currentPhone = toEnglishDigits(phoneInputRef.current?.value || phone)
      .replace(/\D+/g, "")
      .slice(0, 11);
    setPhone(currentPhone);

    if (!requestId) {
      setError(labels.otpRequiredFirst);
      setStep("phone");
      setLoading(false);
      return;
    }

    const codeToVerify = toEnglishDigits(codeOverride || otpCode).replace(/\D+/g, "").slice(0, 6);

    if (codeToVerify.length !== 6) {
      setError(labels.invalidOtpMessage);
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/otp-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: currentPhone,
        otpCode: codeToVerify,
        requestId,
      }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      setError(data.error || labels.verifyCodeFailed);
      setLoading(false);
      return;
    }

    window.location.href = data.redirectTo || "/app";
  }

  function handleOtpInput(value: string) {
    const nextCode = toEnglishDigits(value).replace(/\D+/g, "").slice(0, 6);
    setOtpCode(nextCode);
    setError("");

    if (nextCode.length === 6 && requestId && !loading) {
      window.setTimeout(() => void verifyCode(nextCode), 0);
    }
  }

  async function sendCode() {
    setError("");
    setNotice("");
    const currentPhone = toEnglishDigits(phoneInputRef.current?.value || phone)
      .replace(/\D+/g, "")
      .slice(0, 11);
    const currentPhoneIsValid = /^09\d{9}$/.test(currentPhone);
    setPhone(currentPhone);

    if (!currentPhoneIsValid) {
      setError(labels.invalidPhoneMessage);
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: currentPhone })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || labels.sendCodeFailed);
      setLoading(false);
      return;
    }
    setRequestId(data.requestId);
    setOtpCode("");
    setStep("code");
    setNotice(labels.codeSentNotice);
    setResendCountdown(90);
    setLoading(false);
    window.setTimeout(() => codeInputRef.current?.focus(), 50);
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      {step === "phone" ? (
        <>
          <label>
            <span>{labels.phoneNumber}</span>
            <input
              ref={phoneInputRef}
              value={normalizedPhone}
              onChange={(event) => {
                setPhone(toEnglishDigits(event.target.value).replace(/\D+/g, "").slice(0, 11));
                setRequestId("");
                setNotice("");
              }}
              inputMode="numeric"
              maxLength={11}
              pattern="09[0-9]{9}"
              placeholder={labels.loginPhonePlaceholder}
              required
            />
          </label>
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? labels.sendingCode : labels.sendCode}
          </button>
        </>
      ) : (
        <>
          <div className="otp-summary">
            <span>{labels.codeSentTo}</span>
            <strong>{normalizedPhone}</strong>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtpCode("");
                setRequestId("");
                setResendCountdown(0);
                setError("");
                setNotice("");
                window.setTimeout(() => phoneInputRef.current?.focus(), 50);
              }}
            >
              {labels.changePhone}
            </button>
          </div>
          <label>
            <span>{labels.verifyingCodeTitle}</span>
            <input
              ref={codeInputRef}
              value={normalizedOtpCode}
              onInput={(event) => handleOtpInput(event.currentTarget.value)}
              onChange={(event) => handleOtpInput(event.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="123456"
              required
            />
          </label>
          <p className="empty-text">{labels.autoReadHint}</p>
          <button
            className="ghost-btn"
            type="button"
            onClick={() => void sendCode()}
            disabled={loading || resendCountdown > 0}
          >
            {resendCountdown > 0
              ? `${labels.resendAvailableIn} ${resendCountdown}`
              : labels.resendCode}
          </button>
        </>
      )}
      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="success-text">{notice}</p> : null}
      {step === "code" ? (
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? labels.verifyingCode : labels.verifyCode}
        </button>
      ) : null}
    </form>
  );
}
