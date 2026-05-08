import { useServicesStore } from "../../servicesStore";

const statusColors = {
  all: "bg-green-500",
  some: "bg-yellow-500",
  error: "bg-red-500",
  none: "bg-muted-foreground/40",
} as const;

export function ServicesSidebarStatus() {
  const { services, configLoaded } = useServicesStore();

  if (!configLoaded) return null;

  const entries = Object.values(services);
  const total = entries.length;
  if (total === 0) return null;

  const running = entries.filter(
    (s) => s.status === "running" || s.status === "healthy" || s.status === "starting",
  ).length;
  const hasError = entries.some((s) => s.status === "error" || s.status === "unhealthy");

  let colorKey: keyof typeof statusColors;
  if (hasError) colorKey = "error";
  else if (running === total) colorKey = "all";
  else if (running > 0) colorKey = "some";
  else colorKey = "none";

  return (
    <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground/60">
      <span className={`size-1.5 rounded-full ${statusColors[colorKey]}`} />
      {running}/{total}
    </span>
  );
}
