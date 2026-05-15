"use client";

import { useI18n } from "@/components/i18n-provider";

type BrandMarkProps = {
  size?: "sm" | "md" | "lg";
  withText?: boolean;
  className?: string;
};

export function BrandMark({
  size = "md",
  withText = false,
  className = ""
}: BrandMarkProps) {
  const classes = ["brand-mark", `brand-mark-${size}`, className]
    .filter(Boolean)
    .join(" ");
  const { t } = useI18n();

  return (
    <div className={classes}>
      <img src="/favicon.ico" alt="" aria-hidden="true" />
      {withText ? (
        <div className="brand-mark-text">
          <strong>{t("brandName")}</strong>
          <span>{t("brandTagline")}</span>
        </div>
      ) : null}
    </div>
  );
}
