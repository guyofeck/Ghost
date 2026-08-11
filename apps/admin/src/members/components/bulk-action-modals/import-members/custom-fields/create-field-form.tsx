import {Button, Field, FieldError, FieldGroup, FieldLabel, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from '@tryghost/shade/components';
import {CustomFieldTypeOption} from '@/shared/member-custom-fields/custom-field-type-option';
import {APIError, HostLimitError, JSONError, ValidationError, getErrorMessage} from '@tryghost/admin-x-framework/errors';
import {memberCustomFieldCsvColumns, memberCustomFieldParts, memberCustomFieldUserTypes, useCreateMemberCustomField} from '@tryghost/admin-x-framework/api/member-custom-fields';
import {suggestedFieldName} from '@/members/components/bulk-action-modals/import-members/custom-fields/mapping';
import {useEffect, useRef, useState} from 'react';
import {useHandleError} from '@tryghost/admin-x-framework/hooks';
import type {MemberCustomField} from '@tryghost/admin-x-framework/api/member-custom-fields';

/**
 * The CSV column a row should map onto, resolved from the field the server actually created
 * rather than from the type that was asked for. If those ever disagree — an admin bundle older
 * than the server, a type added since the tab loaded — the wrong column would be mapped with
 * nothing failing, and the import would write into a field of the wrong shape.
 *
 * Null for a composite, which spans several columns and so has no single answer. Which of them
 * this column holds is asked in the field picker afterwards, not here: it is the same question
 * as any other mapping, and the picker already knows how to ask it.
 */
function columnFor(field: MemberCustomField): string | null {
    if (memberCustomFieldParts(field.type)) {
        return null;
    }
    return memberCustomFieldCsvColumns([field])[0]?.value ?? null;
}

interface CreateFieldFormProps {
    // The CSV column this field is being created for. Seeds the name, since a header is
    // usually close to what the publisher would have called the field anyway.
    columnKey: string;
    // The CSV column the row should map onto, or null for a composite — whose parts are all
    // candidates, and which the caller asks about in the picker instead.
    onCreated: (field: MemberCustomField, column: string | null) => void;
    onCancel: () => void;
}

export function CreateFieldForm({columnKey, onCreated, onCancel}: CreateFieldFormProps) {
    const {mutateAsync: createField} = useCreateMemberCustomField();
    const [name, setName] = useState(() => suggestedFieldName(columnKey));
    const [typeId, setTypeId] = useState(memberCustomFieldUserTypes[0].id);
    const [nameError, setNameError] = useState<string | null>(null);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    // A refusal the publisher cannot act on from here — the site is at its field ceiling —
    // shouldn't leave an enabled button that reissues the same doomed request.
    const [canRetry, setCanRetry] = useState(true);
    const handleError = useHandleError();

    // Opened from a row that may sit at the bottom edge of the scroll area, in which case the
    // form lands below the fold and its buttons are out of reach. `nearest` scrolls only when
    // some of it is actually hidden, so a form that already fits doesn't move the table, and
    // the scroll margin below carries it clear of the edge rather than flush against it.
    const formRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        formRef.current?.scrollIntoView({block: 'nearest'});
    }, []);

    // Every refusal is shown inside this form, which only works while the form is on screen.
    // The mapping step takes it away when another picker opens, so a request still in flight
    // when that happens has nowhere inline to report to and falls back to a toast.
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    const reportFailure = (error: unknown) => {
        const apiError = error instanceof JSONError ? error.data?.errors?.[0] : null;

        // A taken name belongs on the input they would change. Expected, and theirs to fix, so
        // it is not reported as a fault.
        if (error instanceof ValidationError && apiError?.property === 'name') {
            setNameError(getErrorMessage(error, 'Invalid name'));
            return;
        }

        // The server's own sentence wherever there is one: for the site's field ceiling it is
        // the only thing that explains the refusal, and `message` on the framework's error
        // classes carries the specific text for the rest (maintenance, timeout, unreachable).
        setSaveError(apiError?.message || (error instanceof APIError ? error.message : 'Could not create the custom field, please try again.'));
        // Nothing they can type changes a ceiling or a permission, so don't leave a button
        // inviting them to try the same request again.
        setCanRetry(!(error instanceof HostLimitError) && apiError?.type !== 'NoPermissionError');

        // The ceiling is an expected answer rather than a fault; everything reaching here
        // otherwise (a 500, a timeout, an expired session) should be visible to us.
        if (!(error instanceof HostLimitError)) {
            handleError(error, {withToast: !isMounted.current});
        }
    };

    const handleCreate = async () => {
        const trimmedName = name.trim();
        if (!trimmedName) {
            setNameError('Enter a name for the field');
            return;
        }
        setIsSaving(true);
        setNameError(null);
        setSaveError(null);

        let created: MemberCustomField | undefined;
        try {
            const response = await createField({name: trimmedName, type: typeId});
            created = response.members_custom_fields?.[0];
        } catch (error) {
            reportFailure(error);
            return;
        } finally {
            setIsSaving(false);
        }

        // Outside the try: this is the success path, and a throw in it would otherwise be
        // reported as a failure to create a field that has in fact been created.
        //
        // `resolved` separates the two nulls: a composite, which has no single column by
        // design, from a type this bundle cannot resolve one for at all.
        let column: string | null = null;
        let resolved = false;
        try {
            if (created) {
                column = columnFor(created);
                resolved = true;
            }
        } catch {
            // A type this bundle has never heard of reaches the shared catalog and throws.
            // The field exists either way, so this is reported as an unmapped column below.
            resolved = false;
        }

        if (!created || !resolved) {
            // The field exists. Telling them it could not be created would have them make a
            // second one, so this says what is actually true and leaves the row to be mapped
            // by hand from the list, where the field now appears.
            setSaveError('The field was created, but this column could not be mapped to it. Choose it from the list.');
            setCanRetry(false);
            handleError(new Error(`Custom field created without a resolvable CSV column (type: ${created?.type ?? 'none'})`), {withToast: !isMounted.current});
            return;
        }

        onCreated(created, column);
    };

    return (
        <div ref={formRef} className="scroll-mb-8 space-y-3" data-testid="import-create-custom-field">
            <FieldGroup className="flex-row flex-wrap items-start gap-3">
                    <Field className="min-w-56 flex-1" data-invalid={Boolean(nameError) || undefined}>
                        <FieldLabel className="text-sm!" htmlFor="import-custom-field-name">Name</FieldLabel>
                        <Input
                            aria-invalid={Boolean(nameError) || undefined}
                            autoComplete="off"
                            className="h-8 text-sm!"
                            id="import-custom-field-name"
                            placeholder="Enter custom field name"
                            value={name}
                            autoFocus
                            onChange={(e) => {
                                setName(e.target.value);
                                setNameError(null);
                                // The previous refusal was about the previous input; leaving it
                                // in place makes it look like a verdict on what they type now.
                                setSaveError(null);
                                setCanRetry(true);
                            }}
                        />
                        {nameError && <FieldError>{nameError}</FieldError>}
                    </Field>
                    <Field className="w-44">
                        <FieldLabel className="text-sm!">Type</FieldLabel>
                        <Select value={typeId} onValueChange={value => setTypeId(value as MemberCustomField['type'])}>
                            <SelectTrigger aria-label="Type" className="h-8 text-sm!">
                                <SelectValue><CustomFieldTypeOption type={typeId} /></SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                {memberCustomFieldUserTypes.map(userType => (
                                    <SelectItem key={userType.id} value={userType.id}>
                                        <CustomFieldTypeOption type={userType.id} />
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </Field>
                <div className="flex items-center gap-2 self-end pb-0.5">
                    <Button disabled={isSaving} size="sm" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button disabled={isSaving || !canRetry} size="sm" onClick={() => void handleCreate()}>
                        {isSaving ? 'Saving' : 'Save'}
                    </Button>
                </div>
            </FieldGroup>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
        </div>
    );
}
