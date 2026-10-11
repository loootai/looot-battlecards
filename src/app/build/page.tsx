import { BuildForm } from "@/components/BuildForm";
import { requireAdminPage } from "@/lib/auth/guard";

export const metadata = { title: "Build" };

export default async function BuildPage() {
  await requireAdminPage();
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-20 font-semibold">Build battlecards</h1>
      <p className="text-mute">Enter your product and up to 10 competitors. You see the list-price cost before anything is paid. The server needs LOOOT_TOKEN to run a real build.</p>
      <BuildForm />
    </div>
  );
}
