import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BrandMark } from "@/components/brand-mark";

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
  searchParams?: Promise<{ error?: string; phone?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
  const params = (await searchParams) || {};
  const otpRequest = readOtpCookie(cookieStore.get(otpCookieName)?.value);
  const otpError = cookieStore.get(otpErrorCookieName)?.value;

  if (session?.user) {
    redirect("/app");
  }

  if (otpRequest) {
    return (
      <main className="auth-page">
        <div className="auth-card">
          <BrandMark size="lg" className="auth-logo" />
          <h1>کد تایید</h1>
          <p>کد پیامکی ارسال‌شده را وارد کنید.</p>
          <form className="stack-form" action="/api/auth/otp-login" method="post">
            <input type="hidden" name="phone" value={otpRequest.phone} />
            <input type="hidden" name="requestId" value={otpRequest.requestId} />
            <div className="otp-summary">
              <span>کد برای این شماره ارسال شد</span>
              <strong>{otpRequest.phone}</strong>
              <a href="/api/auth/otp-reset">تغییر شماره</a>
            </div>
            <label>
              <span>کد تایید</span>
              <input
                name="otpCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                pattern="[0-9]{6}"
                placeholder="123456"
                autoFocus
                required
              />
            </label>
            {otpError ? <p className="error-text">{decodeURIComponent(otpError)}</p> : null}
            <button className="primary-btn" type="submit">
              تایید کد
            </button>
          </form>
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (() => {
                  const input = document.querySelector('input[name="otpCode"]');
                  const form = input?.form;
                  let submitted = false;
                  input?.addEventListener("input", () => {
                    input.value = input.value.replace(/\\D+/g, "").slice(0, 6);
                    if (!submitted && input.value.length === 6) {
                      submitted = true;
                      form?.requestSubmit();
                    }
                  });
                })();
              `
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <BrandMark size="lg" className="auth-logo" />
        <h1>ورود به Teleir</h1>
        <p>شماره موبایل خود را وارد کنید و با کد پیامکی وارد شوید.</p>
        <form className="stack-form" action="/api/auth/send-code" method="post">
          <label>
            <span>شماره موبایل</span>
            <input
              name="phone"
              inputMode="numeric"
              maxLength={11}
              pattern="09[0-9]{9}"
              placeholder="09123456789"
              defaultValue={params.phone || ""}
              required
            />
          </label>
          {params.error ? <p className="error-text">{params.error}</p> : null}
          <button className="primary-btn" type="submit">
            ارسال کد
          </button>
        </form>
      </div>
    </main>
  );
}
