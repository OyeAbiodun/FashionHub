import { Scissors } from "lucide-react";
import { useEffect, useState } from "react";

export function BusinessLogo({
  name,
  logoUrl,
  className = "h-10 w-10",
}: {
  name: string;
  logoUrl: string | null | undefined;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logoUrl]);

  if (logoUrl && !broken) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white ${className}`}
      >
        <img
          className="h-full w-full object-contain p-1"
          src={logoUrl}
          alt={`${name} logo`}
          onError={() => setBroken(true)}
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-white text-sidebar ${className}`}
      aria-label={`${name} logo fallback`}
    >
      <Scissors className="h-1/2 w-1/2" aria-hidden="true" />
    </span>
  );
}
