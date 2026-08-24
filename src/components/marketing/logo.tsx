import Image from "next/image";

export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Oviya Engineers"
      width={160}
      height={160}
      className={`${className} object-contain`}
      priority
    />
  );
}
