"use client";

import { FormEvent, useRef, useState } from "react";
import { signIn } from "next-auth/react";

function toEnglishDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

export function LoginForm() {
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [phone, setPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const phoneInputRef = useRef<HTMLInputElement | null>(null);
  const codeInputRef = useRef<HTMLInputElement | null>(null);
  const normalizedPhone = toEnglishDigits(phone).replace(/\D+/g, "").slice(0, 11);
  const phoneIsValid = /^09\d{9}$/.test(normalizedPhone);
  const normalizedOtpCode = toEnglishDigits(otpCode).replace(/\D+/g, "").slice(0, 6);

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
      setError("ابتدا کد تایید را دریافت کنید.");
      setStep("phone");
      setLoading(false);
      return;
    }

    const codeToVerify = toEnglishDigits(codeOverride || otpCode).replace(/\D+/g, "").slice(0, 6);

    if (codeToVerify.length !== 6) {
      setError("کد تایید باید ۶ رقم باشد.");
      setLoading(false);
      return;
    }

    const result = await signIn("credentials", {
      email: "",
      password: "",
      phone: currentPhone,
      otpCode: codeToVerify,
      requestId,
      redirect: false,
      callbackUrl: "/app"
    });

    if (result?.error) {
      setError("کد تایید صحیح نیست یا منقضی شده است.");
      setLoading(false);
      return;
    }

    window.location.href = "/app";
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
      setError("شماره موبایل باید دقیقا ۱۱ رقم و مثل 09104875928 باشد.");
      return;
    }
    setLoading(true);
    const response = await fetch("/api/auth/send-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: currentPhone })
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "ارسال کد انجام نشد.");
      setLoading(false);
      return;
    }
    setRequestId(data.requestId);
    setOtpCode("");
    setStep("code");
    setNotice("کد تایید ارسال شد.");
    setLoading(false);
    window.setTimeout(() => codeInputRef.current?.focus(), 50);
  }

  return (
    <form className="stack-form" onSubmit={handleSubmit}>
      {step === "phone" ? (
        <>
          <label>
            <span>شماره موبایل</span>
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
              placeholder="09104875928"
              required
            />
          </label>
          <button className="primary-btn" type="submit" disabled={loading}>
            {loading ? "در حال ارسال..." : "ارسال کد"}
          </button>
        </>
      ) : (
        <>
          <div className="otp-summary">
            <span>کد تایید برای این شماره ارسال شد</span>
            <strong>{normalizedPhone}</strong>
            <button
              type="button"
              onClick={() => {
                setStep("phone");
                setOtpCode("");
                setError("");
                setNotice("");
                window.setTimeout(() => phoneInputRef.current?.focus(), 50);
              }}
            >
              تغییر شماره
            </button>
          </div>
          <label>
            <span>کد تایید</span>
            <input
              ref={codeInputRef}
              value={normalizedOtpCode}
              onInput={(event) => handleOtpInput(event.currentTarget.value)}
              onChange={(event) => handleOtpInput(event.target.value)}
              inputMode="numeric"
              maxLength={6}
              pattern="[0-9]{6}"
              placeholder="123456"
              required
            />
          </label>
          <button className="ghost-btn" type="button" onClick={() => void sendCode()} disabled={loading}>
            ارسال دوباره کد
          </button>
        </>
      )}
      {error ? <p className="error-text">{error}</p> : null}
      {notice ? <p className="success-text">{notice}</p> : null}
      {step === "code" ? (
        <button className="primary-btn" type="submit" disabled={loading}>
          {loading ? "در حال بررسی..." : "تایید کد"}
        </button>
      ) : null}
    </form>
  );
}
