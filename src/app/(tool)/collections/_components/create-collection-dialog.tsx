"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PRIMARY_ACTION, SECONDARY_ACTION } from "@/app/_components/button-styles";
import { Dialog } from "@/app/_components/dialog";
import { collectionHref } from "@/app/_lib/routes";
import { createCollection } from "@/app/(tool)/collections/actions";
import { fill, it } from "@/shared/i18n/it";
import { cn } from "@/shared/utils";
import { invalidFields, ITEMS_MAX, NameField, refusedFields, TagsFields, type CollectionField, type TagOptions, type TagsValue } from "./collection-fields";

export interface CreateCollectionDialogProps {
  open: boolean;
  onClose: () => void;
  /** The selected cases, in the order they were selected. */
  caseIds: readonly string[];
  options: TagOptions;
}

/**
 * **Crea raccolta**'s dialog (Story 5.10a): the name and the tags (at least one business line and
 * one industry). **Crea** saves the selected cases in the order they were selected, each client's
 * cases gathered where its first one was, then opens the collection. A field left wrong says so
 * under it and nothing is sent; a refusal names its field or says what to do.
 */
export function CreateCollectionDialog({ open, onClose, caseIds, options }: CreateCollectionDialogProps) {
  const copy = it.collections.create;
  const router = useRouter();
  const [name, setName] = useState("");
  const [tags, setTags] = useState<TagsValue>({ businessLines: [], industries: [] });
  const [errors, setErrors] = useState<CollectionField[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const close = () => {
    if (pending) return;
    setErrors([]);
    setFailure(null);
    onClose();
  };

  const submit = async () => {
    if (pending) return;
    const wrong = invalidFields({ name, ...tags });
    setErrors(wrong);
    setFailure(null);
    if (wrong.length > 0) return;
    setPending(true);
    try {
      const result = await createCollection({ name, ...tags, caseIds: [...caseIds] });
      if (result.ok) {
        // Stays pending while the browser opens the collection.
        router.push(collectionHref(result.value.collectionId));
        return;
      }
      const fields = refusedFields(result.error.fields);
      if (result.error.code === "INVALID_INPUT" && fields.length > 0) setErrors(fields);
      else if (result.error.code === "INVALID_INPUT" && result.error.fields?.includes("caseIds")) setFailure(fill(it.library.select.tooMany, { max: ITEMS_MAX }));
      else setFailure(result.error.code === "CASE_NOT_COLLECTABLE" ? copy.notCollectable : copy.failed);
    } catch {
      setFailure(copy.failed);
    }
    setPending(false);
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title={copy.title}
      description={fill(copy.description, { n: caseIds.length })}
      actions={
        <>
          <button type="button" onClick={close} className={SECONDARY_ACTION}>
            {copy.cancel}
          </button>
          <button type="button" aria-disabled={pending || undefined} onClick={() => void submit()} className={cn(PRIMARY_ACTION, "aria-disabled:opacity-60")}>
            {copy.save}
          </button>
        </>
      }
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <NameField value={name} onChange={setName} error={errors.includes("name")} disabled={pending} />
        <TagsFields value={tags} onChange={setTags} options={options} errors={errors} disabled={pending} />
        <p role="alert" className="font-body text-sm text-danger empty:hidden">
          {failure ?? ""}
        </p>
      </form>
    </Dialog>
  );
}
