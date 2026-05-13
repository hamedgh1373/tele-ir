import { NextResponse } from "next/server";

const otpCookieName = "teleir_otp_request";
const otpErrorCookieName = "teleir_otp_error";

export async function GET() {
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: "/login"
    }
  });
  response.cookies.delete(otpCookieName);
  response.cookies.delete(otpErrorCookieName);
  return response;
}
