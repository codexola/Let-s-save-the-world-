import { AdminConsolePage } from "@/components/admin-console";
import { ModuleDirectory } from "@/components/module-directory";

export default function AdminPage() {
  return (
    <>
      <AdminConsolePage />
      <ModuleDirectory title="Platform modules" forceRole="ADMIN" />
    </>
  );
}
