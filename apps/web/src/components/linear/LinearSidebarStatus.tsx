import { useLinearStore } from "../../linearStore";

export function LinearSidebarStatus() {
  const { issues, connected } = useLinearStore();

  if (!connected) return null;

  const issueCount = Object.keys(issues).length;

  return (
    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
      <span className="size-1.5 rounded-full bg-blue-500" />
      <span>{issueCount}</span>
    </span>
  );
}
