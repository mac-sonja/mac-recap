import { createCase } from "@/modules/case-study";

export default function Page() {
  // Fails: inline server action with no authorize(.
  async function create(form: FormData) {
    "use server";
    await createCase(form);
  }
  return <form action={create} />;
}
