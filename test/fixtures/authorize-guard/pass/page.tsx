import { authorize, getActor } from "@/modules/access";
import { createCase } from "@/modules/case-study";

// Not a "use server" module: only the inline action is checked.
export default function Page() {
  async function create(form: FormData) {
    "use server";
    const actor = await getActor();
    if (!actor.ok) return;
    if (!authorize(actor.value, "create case").ok) return;
    await createCase(actor.value, form);
  }
  return <form action={create} />;
}
