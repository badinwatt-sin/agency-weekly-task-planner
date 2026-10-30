import { ActionForm, SubmitButton } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { PageHeader, SampleBadge } from "@/components/ui";
import { requireManager } from "@/lib/auth";
import { getProjects } from "@/lib/data";
import { saveProject, setProjectActive } from "./actions";

export const metadata = { title: "Projects" };

export default async function ProjectsAdminPage() {
  await requireManager();
  const projects = await getProjects(true);
  return (
    <>
      <PageHeader title="Projects & categories" icon="folder" subtitle="Used to group tasks and filter the board and dashboard. Retired projects stay on existing tasks." />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <ul className="card divide-y divide-line">
          {projects.map((p) => (
            <li key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <ActionForm action={saveProject} className="flex flex-1 flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={p.id} />
                <input type="color" name="color" defaultValue={p.color} aria-label="Colour" className="h-10 w-12 cursor-pointer p-1" />
                <input name="name" defaultValue={p.name} required maxLength={80} aria-label="Project name" className="min-w-0 flex-1" />
                {p.is_sample && <SampleBadge />}
                <SubmitButton className="btn-secondary btn-sm">Save</SubmitButton>
              </ActionForm>
              <ActionForm action={setProjectActive}>
                <input type="hidden" name="id" value={p.id} />
                <input type="hidden" name="active" value={p.is_active ? "false" : "true"} />
                <SubmitButton className="btn-ghost btn-sm">{p.is_active ? "Retire" : "Restore"}</SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
        <div className="card h-fit p-4">
          <h2 className="mb-3 font-bold text-navy-900">Add project</h2>
          <ActionForm action={saveProject} className="space-y-3" resetOnSuccess>
            <div>
              <label htmlFor="p-name">Name</label>
              <input id="p-name" name="name" required maxLength={80} className="mt-1 w-full" />
            </div>
            <div>
              <label htmlFor="p-color">Colour</label>
              <input id="p-color" type="color" name="color" defaultValue="#2952cc" className="mt-1 h-10 w-16 p-1" />
            </div>
            <SubmitButton>
              <Icon name="plus" size={16} /> Add project
            </SubmitButton>
          </ActionForm>
        </div>
      </div>
    </>
  );
}
