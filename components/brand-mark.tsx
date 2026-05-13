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

  return (
    <div className={classes}>
      <img src="/favicon.ico" alt="" aria-hidden="true" />
      {withText ? (
        <div className="brand-mark-text">
          <strong>Teleir</strong>
          <span>Private Messenger</span>
        </div>
      ) : null}
    </div>
  );
}
