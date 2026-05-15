import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";
import { LoginForm } from "@/components/login-form";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/locale";

const otpCookieName = "teleir_otp_request";
const otpErrorCookieName = "teleir_otp_error";

function readOtpCookie(value?: string) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as {
      phone?: string;
      requestId?: string;
    };
    if (!parsed.phone || !parsed.requestId) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default async function LoginPage({
  searchParams
}: {
  searchParams?: Promise<{ error?: string; phone?: string; requestId?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  const locale = await getRequestLocale();
  const t = getDictionary(locale);
  const params = (await searchParams) || {};
  const otpRequest = readOtpCookie(cookieStore.get(otpCookieName)?.value);
  const otpError = cookieStore.get(otpErrorCookieName)?.value;
  const initialPhone = otpRequest?.phone || params.phone || "";
  const initialRequestId = otpRequest?.requestId || params.requestId || "";

  if (session?.user) {
    redirect("/app");
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <BrandMark size="lg" className="auth-logo" />
        <h1>{initialRequestId ? t.verifyingCodeTitle : t.loginTitle}</h1>
        <p>{initialRequestId ? t.verifyingCodeSubtitle : t.loginSubtitle}</p>
        <LoginForm
          initialPhone={initialPhone}
          initialRequestId={initialRequestId}
          labels={{
            phoneNumber: t.phoneNumber,
            sendCode: t.sendCode,
            resendCode:
              locale === "fa"
                ? "ارسال مجدد کد"
                : locale === "ru"
                  ? "Отправить код снова"
                  : locale === "zh"
                    ? "重新发送验证码"
                    : "Resend code",
            sendingCode: locale === "fa" ? "در حال ارسال..." : locale === "ru" ? "Отправка..." : locale === "zh" ? "发送中..." : "Sending...",
            loginPhonePlaceholder: "09123456789",
            invalidPhoneMessage:
              locale === "fa"
                ? "شماره موبایل باید دقیقا ۱۱ رقم و مثل 09123456789 باشد."
                : locale === "ru"
                  ? "Номер должен состоять ровно из 11 цифр в формате 09123456789."
                  : locale === "zh"
                    ? "手机号必须正好 11 位，例如 09123456789。"
                    : "The phone number must be exactly 11 digits, like 09123456789.",
            sendCodeFailed:
              locale === "fa"
                ? "ارسال کد انجام نشد."
                : locale === "ru"
                  ? "Не удалось отправить код."
                  : locale === "zh"
                    ? "验证码发送失败。"
                    : "Failed to send the code.",
            codeSentNotice:
              locale === "fa"
                ? "کد تایید ارسال شد."
                : locale === "ru"
                  ? "Код подтверждения отправлен."
                  : locale === "zh"
                    ? "验证码已发送。"
                    : "Verification code sent.",
            codeSentTo: t.codeSentTo,
            changePhone: t.changePhone,
            verifyingCodeTitle: t.verifyingCodeTitle,
            verifyCode: t.verifyCode,
            verifyingCode:
              locale === "fa"
                ? "در حال بررسی..."
                : locale === "ru"
                  ? "Проверка..."
                  : locale === "zh"
                    ? "验证中..."
                    : "Verifying...",
            invalidOtpMessage:
              locale === "fa"
                ? "کد تایید باید ۶ رقم باشد."
                : locale === "ru"
                  ? "Код подтверждения должен состоять из 6 цифр."
                  : locale === "zh"
                    ? "验证码必须为 6 位数字。"
                    : "The verification code must be 6 digits.",
            otpRequiredFirst:
              locale === "fa"
                ? "ابتدا کد تایید را دریافت کنید."
                : locale === "ru"
                  ? "Сначала запросите код подтверждения."
                  : locale === "zh"
                    ? "请先获取验证码。"
                    : "Request the verification code first.",
            verifyCodeFailed:
              locale === "fa"
                ? "کد تایید صحیح نیست یا منقضی شده است."
                : locale === "ru"
                  ? "Код подтверждения неверный или истек."
                  : locale === "zh"
                    ? "验证码无效或已过期。"
                    : "The verification code is invalid or expired.",
            resendAvailableIn:
              locale === "fa"
                ? "ارسال مجدد تا"
                : locale === "ru"
                  ? "Повторная отправка через"
                  : locale === "zh"
                    ? "可重新发送倒计时"
                    : "Resend available in",
            autoReadHint:
              locale === "fa"
                ? "اگر مرورگر و پیامک پشتیبانی کنند، کد به صورت خودکار خوانده و ثبت می‌شود."
                : locale === "ru"
                  ? "Если браузер и SMS поддерживают это, код будет считан и введен автоматически."
                  : locale === "zh"
                    ? "如果浏览器和短信格式支持，验证码会自动读取并填写。"
                    : "If the browser and SMS format support it, the code will be read and filled automatically.",
          }}
        />
        {params.error ? <p className="error-text">{params.error}</p> : null}
        {otpError ? <p className="error-text">{decodeURIComponent(otpError)}</p> : null}
      </div>
    </main>
  );
}
