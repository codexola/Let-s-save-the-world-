import { RoleHomeShell } from "@/components/role-home-shell";
import { ModuleDirectory } from "@/components/module-directory";
import Link from "next/link";

export default function DeveloperHomePage() {
  return (
    <>
      <RoleHomeShell role="DEVELOPER" title="Developer home">
        <div className="panel" style={{ marginTop: "1.25rem" }}>
          <h2 style={{ marginTop: 0 }}>Developer tools</h2>
          <div className="link-row">
            <Link href="/developer/archive" className="btn btn-primary">
              Archive system
            </Link>
            <Link href="/developer/features" className="btn btn-ghost">
              Feature flags
            </Link>
            <Link href="/developers" className="btn btn-ghost">
              API platform
            </Link>
          </div>
        </div>
      </RoleHomeShell>
      <ModuleDirectory title="Platform modules" forceRole="DEVELOPER" />
    </>
  );
}
